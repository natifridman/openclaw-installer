import { discoverContainers, detectRuntime } from "./container.js";
import { discoverK8sInstances } from "../deployers/kubernetes.js";
import { isClusterReachable, coreApi, appsApi } from "./k8s.js";
import { saveHealthCheckResult, cleanupOldHealthHistory, getLatestHealthStatus, getAllInstancesWithHealth, type HealthCheckResult } from "./health-history.js";
// TODO: Implement sendHealthAlert in ws.js
// import { sendHealthAlert } from "../ws.js";

// Track previous health status to detect changes
const previousHealthStatuses = new Map<string, "healthy" | "degraded" | "unhealthy">();

/**
 * Check health of a local container instance
 */
async function checkLocalInstanceHealth(instanceId: string, containerStatus: string, url?: string): Promise<HealthCheckResult> {
  let healthStatus: "healthy" | "degraded" | "unhealthy";
  let responseCheck: "passing" | "failing" | "unknown" = "unknown";

  if (containerStatus === "running") {
    // Try to ping the gateway endpoint
    try {
      const port = url ? new URL(url).port : "18789";
      const http = await import("node:http");
      await new Promise<void>((resolve, reject) => {
        const req = http.get(`http://localhost:${port}/`, (res) => {
          if (res.statusCode && res.statusCode < 400) {
            resolve();
          } else {
            reject(new Error(`HTTP ${res.statusCode}`));
          }
        });
        req.on("error", reject);
        req.setTimeout(5000, () => {
          req.destroy();
          reject(new Error("Timeout"));
        });
      });
      responseCheck = "passing";
      healthStatus = "healthy";
    } catch {
      responseCheck = "failing";
      healthStatus = "degraded";
    }
  } else {
    healthStatus = "unhealthy";
  }

  return {
    instanceId,
    mode: "local",
    healthStatus,
    containerStatus,
    checks: {
      container: containerStatus === "running" ? "passing" : "failing",
      httpResponse: responseCheck,
    },
    checkedAt: new Date().toISOString(),
  };
}

/**
 * Check health of a K8s instance
 */
async function checkK8sInstanceHealth(namespace: string): Promise<HealthCheckResult> {
  try {
    const core = coreApi();
    const apps = appsApi();

    const deployment = await apps.readNamespacedDeployment({ name: "openclaw", namespace });
    const podList = await core.listNamespacedPod({
      namespace,
      labelSelector: "app=openclaw",
    });

    const pods = podList.items.map((pod) => {
      const containerStatuses = pod.status?.containerStatuses || [];
      const gatewayContainer = containerStatuses.find((c) => c.name === "gateway");

      return {
        name: pod.metadata?.name || "",
        phase: pod.status?.phase || "Unknown",
        ready: gatewayContainer?.ready ?? false,
        restarts: gatewayContainer?.restartCount ?? 0,
        containerStatus: gatewayContainer?.state?.running ? "Running"
          : gatewayContainer?.state?.waiting?.reason || "Unknown",
      };
    });

    const replicas = deployment.spec?.replicas ?? 1;
    const readyReplicas = deployment.status?.readyReplicas ?? 0;
    const availableReplicas = deployment.status?.availableReplicas ?? 0;

    let healthStatus: "healthy" | "degraded" | "unhealthy";
    if (readyReplicas === replicas && readyReplicas > 0) {
      healthStatus = "healthy";
    } else if (readyReplicas > 0) {
      healthStatus = "degraded";
    } else {
      healthStatus = "unhealthy";
    }

    return {
      instanceId: namespace,
      mode: "kubernetes",
      healthStatus,
      replicas: {
        desired: replicas,
        ready: readyReplicas,
        available: availableReplicas,
      },
      checks: {
        livenessProbe: pods.some((p) => p.ready) ? "passing" : "failing",
        readinessProbe: readyReplicas > 0 ? "passing" : "failing",
      },
      checkedAt: new Date().toISOString(),
      details: { pods },
    };
  } catch (err) {
    // Instance may have been deleted or is unreachable
    return {
      instanceId: namespace,
      mode: "kubernetes",
      healthStatus: "unhealthy",
      checks: {
        error: err instanceof Error ? err.message : String(err),
      },
      checkedAt: new Date().toISOString(),
    };
  }
}

/**
 * Poll all instances and save health check results
 */
export async function pollAllInstancesHealth(): Promise<void> {
  const results: HealthCheckResult[] = [];

  try {
    // Check local instances
    const runtime = await detectRuntime();
    if (runtime) {
      const containers = await discoverContainers(runtime);
      const openclawContainers = containers.filter((c) =>
        c.name.startsWith("openclaw-") || c.labels["openclaw.agent"]
      );

      for (const container of openclawContainers) {
        const port = extractPort(container.ports);
        const url = container.status === "running" ? `http://localhost:${port}` : undefined;
        const result = await checkLocalInstanceHealth(container.name, container.status, url);
        results.push(result);
      }
    }

    // Check K8s instances
    if (await isClusterReachable()) {
      const k8sInstances = await discoverK8sInstances();
      for (const instance of k8sInstances) {
        const result = await checkK8sInstanceHealth(instance.namespace);
        results.push(result);
      }
    }

    // Save all results and check for status changes
    for (const result of results) {
      await saveHealthCheckResult(result);

      // Check for status changes and send alerts
      const previousStatus = previousHealthStatuses.get(result.instanceId);
      if (previousStatus && previousStatus !== result.healthStatus) {
        // Status changed - send alert
        let message = `Instance ${result.instanceId} health changed from ${previousStatus} to ${result.healthStatus}`;

        if (result.healthStatus === "unhealthy") {
          message = `⚠️ Instance ${result.instanceId} is now UNHEALTHY`;
          if (result.containerStatus === "stopped") {
            message += " (container stopped)";
          } else if (result.replicas && result.replicas.ready === 0) {
            message += " (no ready replicas)";
          }
        } else if (result.healthStatus === "degraded") {
          message = `⚠️ Instance ${result.instanceId} is DEGRADED`;
          if (result.replicas) {
            message += ` (${result.replicas.ready}/${result.replicas.desired} replicas ready)`;
          }
        } else if (result.healthStatus === "healthy") {
          message = `✅ Instance ${result.instanceId} is now healthy`;
        }

        // TODO: Uncomment when sendHealthAlert is implemented
        // sendHealthAlert({
        //   instanceId: result.instanceId,
        //   healthStatus: result.healthStatus,
        //   previousStatus,
        //   message,
        //   timestamp: result.checkedAt,
        // });

        console.log(`Health alert: ${message}`);
      }

      // Update tracked status
      previousHealthStatuses.set(result.instanceId, result.healthStatus);
    }

    console.log(`Health check poll completed: ${results.length} instances checked`);
  } catch (err) {
    console.error("Health monitoring poll error:", err);
  }
}

/**
 * Extract port from container ports string
 */
function extractPort(portsStr: string): string {
  // Docker format: "8080->18789/tcp"
  const portMatch = portsStr.match(/(\d+)->18789/);
  if (portMatch) {
    return portMatch[1];
  }

  // Podman JSON format
  const gatewayPortMatch = portsStr.match(/"host_port"\s*:\s*(\d+)[^}]*"container_port"\s*:\s*18789/);
  const reverseMatch = portsStr.match(/"container_port"\s*:\s*18789[^}]*"host_port"\s*:\s*(\d+)/);
  const hostPortMatch = gatewayPortMatch || reverseMatch;
  if (hostPortMatch) {
    return hostPortMatch[1];
  }

  return "18789";
}

/**
 * Start the health monitoring service
 * @param intervalMs Polling interval in milliseconds (default: 60000 = 1 minute)
 */
export function startHealthMonitoring(intervalMs = 60000): NodeJS.Timeout {
  console.log(`Starting health monitoring service (interval: ${intervalMs}ms)`);

  // Initialize previous health statuses from history
  void (async () => {
    try {
      const instances = await getAllInstancesWithHealth();
      for (const instanceId of instances) {
        const latestStatus = await getLatestHealthStatus(instanceId);
        if (latestStatus) {
          previousHealthStatuses.set(instanceId, latestStatus.healthStatus);
        }
      }
      console.log(`Loaded previous health status for ${previousHealthStatuses.size} instances`);
    } catch (err) {
      console.error("Failed to load previous health statuses:", err);
    }
  })();

  // Run initial check
  void pollAllInstancesHealth();

  // Schedule periodic checks
  const interval = setInterval(() => {
    void pollAllInstancesHealth();
  }, intervalMs);

  // Clean up old history daily
  const cleanupInterval = setInterval(() => {
    void cleanupOldHealthHistory(30);
  }, 24 * 60 * 60 * 1000); // 24 hours

  // Return the main interval so it can be cleared if needed
  return interval;
}

/**
 * Stop the health monitoring service
 */
export function stopHealthMonitoring(interval: NodeJS.Timeout): void {
  clearInterval(interval);
  console.log("Health monitoring service stopped");
}
