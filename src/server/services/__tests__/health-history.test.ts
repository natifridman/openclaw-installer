import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  saveHealthCheckResult,
  getHealthHistory,
  getLatestHealthStatus,
  getAllInstancesWithHealth,
  cleanupOldHealthHistory,
  type HealthCheckResult,
} from "../health-history.js";

// Mock the paths module to use a temp directory
let testDir: string;

vi.mock("../../paths.js", () => ({
  installerDataDir: () => testDir,
}));

describe("Health History", () => {
  beforeEach(async () => {
    testDir = await mkdtemp(join(tmpdir(), "health-history-test-"));
  });

  afterEach(async () => {
    try {
      await rm(testDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  it("should save and retrieve health check results", async () => {
    const result: HealthCheckResult = {
      instanceId: "test-instance",
      mode: "local",
      healthStatus: "healthy",
      containerStatus: "running",
      checks: {
        container: "passing",
        httpResponse: "passing",
      },
      checkedAt: new Date().toISOString(),
    };

    await saveHealthCheckResult(result);

    const history = await getHealthHistory("test-instance");
    expect(history).toHaveLength(1);
    expect(history[0]).toEqual(result);
  });

  it("should limit history to 100 entries", async () => {
    const baseTimestamp = Date.now();

    // Add 150 results
    for (let i = 0; i < 150; i++) {
      const result: HealthCheckResult = {
        instanceId: "test-instance",
        mode: "local",
        healthStatus: "healthy",
        checks: {},
        checkedAt: new Date(baseTimestamp + i * 1000).toISOString(),
      };
      await saveHealthCheckResult(result);
    }

    const history = await getHealthHistory("test-instance", 200);
    expect(history).toHaveLength(100);

    // Should keep the most recent 100
    const firstEntry = history[0];
    const lastEntry = history[history.length - 1];
    expect(new Date(firstEntry.checkedAt).getTime()).toBeGreaterThan(baseTimestamp + 49 * 1000);
    expect(new Date(lastEntry.checkedAt).getTime()).toBe(baseTimestamp + 149 * 1000);
  });

  it("should retrieve latest health status", async () => {
    const results: HealthCheckResult[] = [
      {
        instanceId: "test-instance",
        mode: "local",
        healthStatus: "healthy",
        checks: {},
        checkedAt: "2024-01-01T00:00:00Z",
      },
      {
        instanceId: "test-instance",
        mode: "local",
        healthStatus: "degraded",
        checks: {},
        checkedAt: "2024-01-01T00:01:00Z",
      },
      {
        instanceId: "test-instance",
        mode: "local",
        healthStatus: "unhealthy",
        checks: {},
        checkedAt: "2024-01-01T00:02:00Z",
      },
    ];

    for (const result of results) {
      await saveHealthCheckResult(result);
    }

    const latest = await getLatestHealthStatus("test-instance");
    expect(latest).not.toBeNull();
    expect(latest?.healthStatus).toBe("unhealthy");
    expect(latest?.checkedAt).toBe("2024-01-01T00:02:00Z");
  });

  it("should return null for nonexistent instance", async () => {
    const latest = await getLatestHealthStatus("nonexistent");
    expect(latest).toBeNull();
  });

  it("should return empty array for instance with no history", async () => {
    const history = await getHealthHistory("nonexistent");
    expect(history).toEqual([]);
  });

  it("should track multiple instances", async () => {
    const instance1: HealthCheckResult = {
      instanceId: "instance-1",
      mode: "local",
      healthStatus: "healthy",
      checks: {},
      checkedAt: new Date().toISOString(),
    };

    const instance2: HealthCheckResult = {
      instanceId: "instance-2",
      mode: "kubernetes",
      healthStatus: "degraded",
      checks: {},
      checkedAt: new Date().toISOString(),
    };

    await saveHealthCheckResult(instance1);
    await saveHealthCheckResult(instance2);

    const instances = await getAllInstancesWithHealth();
    expect(instances).toHaveLength(2);
    expect(instances).toContain("instance-1");
    expect(instances).toContain("instance-2");
  });

  it("should cleanup old history", async () => {
    const now = Date.now();
    const oldDate = new Date(now - 40 * 24 * 60 * 60 * 1000); // 40 days ago
    const recentDate = new Date(now - 10 * 24 * 60 * 60 * 1000); // 10 days ago

    const oldResult: HealthCheckResult = {
      instanceId: "test-instance",
      mode: "local",
      healthStatus: "healthy",
      checks: {},
      checkedAt: oldDate.toISOString(),
    };

    const recentResult: HealthCheckResult = {
      instanceId: "test-instance",
      mode: "local",
      healthStatus: "healthy",
      checks: {},
      checkedAt: recentDate.toISOString(),
    };

    await saveHealthCheckResult(oldResult);
    await saveHealthCheckResult(recentResult);

    let history = await getHealthHistory("test-instance");
    expect(history).toHaveLength(2);

    await cleanupOldHealthHistory(30);

    history = await getHealthHistory("test-instance");
    expect(history).toHaveLength(1);
    expect(history[0].checkedAt).toBe(recentDate.toISOString());
  });

  it("should handle K8s health results with replicas", async () => {
    const result: HealthCheckResult = {
      instanceId: "openclaw-ns",
      mode: "kubernetes",
      healthStatus: "degraded",
      replicas: {
        desired: 2,
        ready: 1,
        available: 1,
      },
      checks: {
        livenessProbe: "passing",
        readinessProbe: "failing",
      },
      checkedAt: new Date().toISOString(),
    };

    await saveHealthCheckResult(result);

    const history = await getHealthHistory("openclaw-ns");
    expect(history).toHaveLength(1);
    expect(history[0].replicas).toEqual({
      desired: 2,
      ready: 1,
      available: 1,
    });
  });
});
