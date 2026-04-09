import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { GenericContainer, StartedTestContainer, Wait } from "testcontainers";
import { LocalDeployer } from "../../deployers/local.js";
import type { DeployConfig, DeployResult } from "../../deployers/types.js";

/**
 * E2E tests for LocalDeployer
 *
 * These tests verify the complete deployment lifecycle:
 * deploy → start → status → stop → teardown
 *
 * Requirements:
 * - Docker or Podman must be installed and running
 * - Port 18789 must be available
 *
 * Run with: npm run test:e2e or RUN_E2E_TESTS=true npm test
 */
describe.skipIf(!process.env.RUN_E2E_TESTS)("LocalDeployer E2E", () => {
  const deployer = new LocalDeployer();
  let deployResult: DeployResult | null = null;
  const logs: string[] = [];
  const logCallback = (line: string) => {
    logs.push(line);
    console.log("[Deploy Log]", line);
  };

  afterAll(async () => {
    // Cleanup: ensure container is torn down
    if (deployResult) {
      try {
        await deployer.stop(deployResult, logCallback);
        await deployer.teardown(deployResult, logCallback);
      } catch (error) {
        console.error("Cleanup error:", error);
      }
    }
  });

  it("should deploy a local OpenClaw instance", async () => {
    const config: DeployConfig = {
      mode: "local",
      agentName: "test-agent",
      agentDisplayName: "Test Agent",
      prefix: "e2e-test",
      containerRuntime: "docker",
      image: "quay.io/sallyom/openclaw:latest",
      port: 18789,
      anthropicApiKey: "test-key-for-e2e",
    };

    deployResult = await deployer.deploy(config, logCallback);

    expect(deployResult).toBeDefined();
    expect(deployResult.id).toBeDefined();
    expect(deployResult.mode).toBe("local");
    expect(deployResult.containerId).toBeDefined();
    expect(deployResult.volumeName).toBeDefined();
    expect(logs.length).toBeGreaterThan(0);
  }, 120000); // 2 minute timeout for pulling image

  it("should start the deployed instance", async () => {
    expect(deployResult).toBeDefined();
    if (!deployResult) throw new Error("No deployment result");

    const startedResult = await deployer.start(deployResult, logCallback);

    expect(startedResult.status).toMatch(/running|deploying/);
    expect(startedResult.url).toBeDefined();
    expect(startedResult.url).toContain("localhost");
  }, 60000);

  it("should check status of running instance", async () => {
    expect(deployResult).toBeDefined();
    if (!deployResult) throw new Error("No deployment result");

    const statusResult = await deployer.status(deployResult);

    expect(statusResult.status).toMatch(/running|deploying/);
    expect(statusResult.containerId).toBeDefined();
  }, 30000);

  it("should stop the running instance", async () => {
    expect(deployResult).toBeDefined();
    if (!deployResult) throw new Error("No deployment result");

    await deployer.stop(deployResult, logCallback);

    // Verify container is stopped
    const statusAfterStop = await deployer.status(deployResult);
    expect(statusAfterStop.status).toMatch(/stopped|unknown/);
  }, 30000);

  it("should teardown (remove) the stopped instance", async () => {
    expect(deployResult).toBeDefined();
    if (!deployResult) throw new Error("No deployment result");

    await deployer.teardown(deployResult, logCallback);

    // Verify container and volume are removed
    const statusAfterTeardown = await deployer.status(deployResult);
    expect(statusAfterTeardown.status).toMatch(/stopped|unknown/);
    expect(statusAfterTeardown.hasLocalState).toBe(false);
  }, 30000);
});
