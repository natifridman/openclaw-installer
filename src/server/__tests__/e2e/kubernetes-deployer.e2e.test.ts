import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { KubernetesDeployer } from "../../deployers/kubernetes.js";
import type { DeployConfig, DeployResult } from "../../deployers/types.js";

const execFileAsync = promisify(execFile);

/**
 * E2E tests for KubernetesDeployer
 *
 * These tests verify the complete Kubernetes deployment lifecycle:
 * deploy → start → status → stop → teardown
 *
 * Requirements:
 * - kind (Kubernetes in Docker) must be installed
 * - kubectl must be installed
 * - A kind cluster must be running or will be created
 *
 * Setup:
 * 1. Install kind: https://kind.sigs.k8s.io/docs/user/quick-start/
 * 2. Create a test cluster: kind create cluster --name openclaw-e2e
 * 3. Run tests: RUN_E2E_TESTS=true npm test
 *
 * Cleanup:
 * kind delete cluster --name openclaw-e2e
 */
describe.skipIf(!process.env.RUN_E2E_TESTS)("KubernetesDeployer E2E", () => {
  const deployer = new KubernetesDeployer();
  let deployResult: DeployResult | null = null;
  let kindClusterAvailable = false;
  const logs: string[] = [];
  const logCallback = (line: string) => {
    logs.push(line);
    console.log("[K8s Deploy Log]", line);
  };

  beforeAll(async () => {
    // Check if kind is available
    try {
      await execFileAsync("kind", ["--version"]);
      kindClusterAvailable = true;
    } catch (error) {
      console.warn("kind not found. Skipping Kubernetes E2E tests.");
      console.warn("Install kind: https://kind.sigs.k8s.io/docs/user/quick-start/");
      return;
    }

    // Check if kind cluster exists, create if not
    try {
      const { stdout } = await execFileAsync("kind", ["get", "clusters"]);
      if (!stdout.includes("openclaw-e2e")) {
        console.log("Creating kind cluster: openclaw-e2e");
        await execFileAsync("kind", [
          "create",
          "cluster",
          "--name",
          "openclaw-e2e",
          "--wait",
          "60s",
        ]);
        console.log("Kind cluster created successfully");
      } else {
        console.log("Using existing kind cluster: openclaw-e2e");
      }

      // Set kubeconfig context to kind cluster
      await execFileAsync("kubectl", [
        "config",
        "use-context",
        "kind-openclaw-e2e",
      ]);
    } catch (error) {
      console.error("Failed to setup kind cluster:", error);
      kindClusterAvailable = false;
    }
  }, 180000); // 3 minutes for cluster creation

  afterAll(async () => {
    // Cleanup: ensure resources are torn down
    if (deployResult && kindClusterAvailable) {
      try {
        await deployer.stop(deployResult, logCallback);
        await deployer.teardown(deployResult, logCallback);
      } catch (error) {
        console.error("Cleanup error:", error);
      }
    }
  });

  it.skipIf(!kindClusterAvailable)(
    "should deploy an OpenClaw instance to Kubernetes",
    async () => {
      const config: DeployConfig = {
        mode: "kubernetes",
        agentName: "test-k8s-agent",
        agentDisplayName: "Test K8s Agent",
        prefix: "e2e-test",
        namespace: "e2e-test-openclaw",
        image: "quay.io/sallyom/openclaw:latest",
        anthropicApiKey: "test-key-for-e2e",
      };

      deployResult = await deployer.deploy(config, logCallback);

      expect(deployResult).toBeDefined();
      expect(deployResult.id).toBeDefined();
      expect(deployResult.mode).toBe("kubernetes");
      expect(deployResult.containerId).toBeDefined(); // namespace in K8s context
      expect(logs.length).toBeGreaterThan(0);
    },
    180000
  ); // 3 minutes for deployment

  it.skipIf(!kindClusterAvailable)(
    "should start the deployed Kubernetes instance",
    async () => {
      expect(deployResult).toBeDefined();
      if (!deployResult) throw new Error("No deployment result");

      const startedResult = await deployer.start(deployResult, logCallback);

      expect(startedResult.status).toMatch(/running|deploying/);
      // URL may not be available without port-forwarding
      if (startedResult.url) {
        expect(startedResult.url).toContain("localhost");
      }
    },
    90000
  );

  it.skipIf(!kindClusterAvailable)(
    "should check status of running Kubernetes instance",
    async () => {
      expect(deployResult).toBeDefined();
      if (!deployResult) throw new Error("No deployment result");

      const statusResult = await deployer.status(deployResult);

      expect(statusResult.status).toBeDefined();
      expect(statusResult.containerId).toBeDefined();
      expect(statusResult.pods).toBeDefined();
      if (statusResult.pods && statusResult.pods.length > 0) {
        expect(statusResult.pods[0].name).toContain("openclaw");
      }
    },
    60000
  );

  it.skipIf(!kindClusterAvailable)(
    "should stop the running Kubernetes instance",
    async () => {
      expect(deployResult).toBeDefined();
      if (!deployResult) throw new Error("No deployment result");

      await deployer.stop(deployResult, logCallback);

      // Verify deployment is scaled down or deleted
      const statusAfterStop = await deployer.status(deployResult);
      expect(statusAfterStop.status).toBeDefined();
    },
    60000
  );

  it.skipIf(!kindClusterAvailable)(
    "should teardown (remove) the Kubernetes resources",
    async () => {
      expect(deployResult).toBeDefined();
      if (!deployResult) throw new Error("No deployment result");

      await deployer.teardown(deployResult, logCallback);

      // Verify namespace and resources are removed
      try {
        const { stdout } = await execFileAsync("kubectl", [
          "get",
          "namespace",
          deployResult.containerId || "e2e-test-openclaw",
        ]);
        // If namespace still exists, check if it's being terminated
        expect(stdout).toContain("Terminating");
      } catch (error) {
        // Namespace not found is expected after teardown
        expect((error as any).code).toBe(1);
      }
    },
    90000
  );
});
