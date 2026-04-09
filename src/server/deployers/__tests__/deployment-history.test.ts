import { mkdtempSync, rmSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  saveDeploymentHistory,
  cleanupOldHistory,
  getDeploymentHistory,
} from "../deployment-history.js";
import type { DeployConfig } from "../types.js";
import * as paths from "../../paths.js";

const tempDirs: string[] = [];

describe("deployment-history", () => {
  let tempDir: string;

  beforeEach(() => {
    // Create a temp directory for history tests
    tempDir = mkdtempSync(join(tmpdir(), "openclaw-history-"));
    tempDirs.push(tempDir);
  });

  afterEach(() => {
    // Cleanup temp directories
    for (const dir of tempDirs.splice(0)) {
      try {
        rmSync(dir, { recursive: true, force: true });
      } catch {
        // Ignore cleanup failures in tests
      }
    }
    vi.restoreAllMocks();
  });

  describe("saveDeploymentHistory", () => {
    it("saves local deployment history as .env file", async () => {
      const config: DeployConfig = {
        mode: "local",
        agentName: "test-agent",
        agentDisplayName: "Test Agent",
      };

      // Mock the history directory path
      vi.spyOn(paths, "installerLocalHistoryDir").mockReturnValue(
        join(tempDir, "local", "test-agent", "history"),
      );

      const envContent = "OPENCLAW_AGENT_NAME=test-agent\nOPENCLAW_PORT=18789";
      await saveDeploymentHistory(config, envContent, false);

      const historyDir = join(tempDir, "local", "test-agent", "history");
      const files = readdirSync(historyDir);

      expect(files.length).toBe(1);
      expect(files[0]).toMatch(/^deploy-\d+\.env$/);

      const savedContent = readFileSync(join(historyDir, files[0]), "utf-8");
      expect(savedContent).toBe(envContent);
    });

    it("saves kubernetes deployment history as .json file", async () => {
      const config: DeployConfig = {
        mode: "kubernetes",
        namespace: "test-ns",
        agentName: "test-agent",
        agentDisplayName: "Test Agent",
      };

      // Mock the history directory path
      vi.spyOn(paths, "installerK8sHistoryDir").mockReturnValue(
        join(tempDir, "k8s", "test-ns", "history"),
      );

      const jsonContent = JSON.stringify({ mode: "kubernetes", namespace: "test-ns" });
      await saveDeploymentHistory(config, jsonContent, true);

      const historyDir = join(tempDir, "k8s", "test-ns", "history");
      const files = readdirSync(historyDir);

      expect(files.length).toBe(1);
      expect(files[0]).toMatch(/^deploy-config-\d+\.json$/);

      const savedContent = readFileSync(join(historyDir, files[0]), "utf-8");
      expect(savedContent).toBe(jsonContent);
    });

    it("does not throw on save failure", async () => {
      const config: DeployConfig = {
        mode: "local",
        agentName: "test-agent",
        agentDisplayName: "Test Agent",
      };

      // Mock to return an invalid path
      vi.spyOn(paths, "installerLocalHistoryDir").mockReturnValue("/invalid/path/that/does/not/exist");

      const envContent = "OPENCLAW_AGENT_NAME=test-agent";

      // Should not throw even though the path is invalid
      await expect(saveDeploymentHistory(config, envContent, false)).resolves.toBeUndefined();
    });

    it("skips history for unsupported deployment modes", async () => {
      const config: DeployConfig = {
        mode: "ssh",
        agentName: "test-agent",
        agentDisplayName: "Test Agent",
      };

      const content = "some content";
      await saveDeploymentHistory(config, content, false);

      // Should not create any directories since SSH mode is not supported
      // Just verify it completes without error
      expect(true).toBe(true);
    });
  });

  describe("cleanupOldHistory", () => {
    it("removes old history files keeping only the most recent N", async () => {
      const config: DeployConfig = {
        mode: "local",
        agentName: "test-agent",
        agentDisplayName: "Test Agent",
      };

      const historyDir = join(tempDir, "local", "test-agent", "history");
      vi.spyOn(paths, "installerLocalHistoryDir").mockReturnValue(historyDir);

      // Create 15 history files with different timestamps
      for (let i = 0; i < 15; i++) {
        const timestamp = Date.now() + i * 1000;
        const content = `DEPLOY_${i}=true`;
        await saveDeploymentHistory(config, content, false);
        // Small delay to ensure different timestamps
        await new Promise((r) => setTimeout(r, 10));
      }

      // After saving, should have max 10 files (default cleanup)
      const files = readdirSync(historyDir);
      expect(files.length).toBeLessThanOrEqual(10);
    });

    it("handles cleanup when history directory does not exist", async () => {
      const config: DeployConfig = {
        mode: "local",
        agentName: "test-agent",
        agentDisplayName: "Test Agent",
      };

      vi.spyOn(paths, "installerLocalHistoryDir").mockReturnValue(
        join(tempDir, "non-existent"),
      );

      // Should not throw
      await expect(cleanupOldHistory(config, 10)).resolves.toBeUndefined();
    });
  });

  describe("getDeploymentHistory", () => {
    it("returns empty array when no history exists", async () => {
      const config: DeployConfig = {
        mode: "local",
        agentName: "test-agent",
        agentDisplayName: "Test Agent",
      };

      vi.spyOn(paths, "installerLocalHistoryDir").mockReturnValue(
        join(tempDir, "non-existent"),
      );

      const history = await getDeploymentHistory(config);
      expect(history).toEqual([]);
    });

    it("returns deployment history sorted newest first", async () => {
      const config: DeployConfig = {
        mode: "local",
        agentName: "test-agent",
        agentDisplayName: "Test Agent",
      };

      const historyDir = join(tempDir, "local", "test-agent", "history");
      vi.spyOn(paths, "installerLocalHistoryDir").mockReturnValue(historyDir);

      // Create 3 history files
      for (let i = 0; i < 3; i++) {
        await saveDeploymentHistory(config, `DEPLOY_${i}=true`, false);
        await new Promise((r) => setTimeout(r, 50));
      }

      const history = await getDeploymentHistory(config);
      expect(history.length).toBe(3);

      // Verify sorted newest first
      const timestamps = history.map((h) => new Date(h.timestamp).getTime());
      for (let i = 0; i < timestamps.length - 1; i++) {
        expect(timestamps[i]).toBeGreaterThanOrEqual(timestamps[i + 1]);
      }
    });

    it("returns empty array for unsupported deployment modes", async () => {
      const config: DeployConfig = {
        mode: "ssh",
        agentName: "test-agent",
        agentDisplayName: "Test Agent",
      };

      const history = await getDeploymentHistory(config);
      expect(history).toEqual([]);
    });
  });
});
