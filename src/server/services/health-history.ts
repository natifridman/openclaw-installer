import { readFile, writeFile, mkdir, readdir } from "node:fs/promises";
import { join } from "node:path";
import { installerDataDir } from "../paths.js";

export interface HealthCheckResult {
  instanceId: string;
  mode: string;
  healthStatus: "healthy" | "degraded" | "unhealthy";
  containerStatus?: string;
  replicas?: {
    desired: number;
    ready: number;
    available: number;
  };
  checks: Record<string, string>;
  checkedAt: string;
  details?: unknown;
}

function healthHistoryDir(): string {
  return join(installerDataDir(), "health-history");
}

function instanceHealthFile(instanceId: string): string {
  return join(healthHistoryDir(), `${instanceId}.json`);
}

/**
 * Save a health check result to history.
 * Keeps the last 100 entries per instance.
 */
export async function saveHealthCheckResult(result: HealthCheckResult): Promise<void> {
  try {
    await mkdir(healthHistoryDir(), { recursive: true });

    const file = instanceHealthFile(result.instanceId);
    let history: HealthCheckResult[] = [];

    try {
      const content = await readFile(file, "utf8");
      history = JSON.parse(content);
    } catch {
      // File doesn't exist or is invalid
    }

    // Add new result
    history.push(result);

    // Keep only the last 100 entries
    if (history.length > 100) {
      history = history.slice(-100);
    }

    await writeFile(file, JSON.stringify(history, null, 2), "utf8");
  } catch (err) {
    console.error("Failed to save health check result:", err);
  }
}

/**
 * Get health check history for an instance.
 * @param instanceId The instance ID
 * @param limit Maximum number of results to return (default: 50)
 */
export async function getHealthHistory(instanceId: string, limit = 50): Promise<HealthCheckResult[]> {
  try {
    const file = instanceHealthFile(instanceId);
    const content = await readFile(file, "utf8");
    const history: HealthCheckResult[] = JSON.parse(content);

    // Return most recent entries
    return history.slice(-limit);
  } catch {
    return [];
  }
}

/**
 * Get the latest health status for an instance.
 */
export async function getLatestHealthStatus(instanceId: string): Promise<HealthCheckResult | null> {
  try {
    const file = instanceHealthFile(instanceId);
    const content = await readFile(file, "utf8");
    const history: HealthCheckResult[] = JSON.parse(content);

    return history.length > 0 ? history[history.length - 1] : null;
  } catch {
    return null;
  }
}

/**
 * Get all instances that have health history.
 */
export async function getAllInstancesWithHealth(): Promise<string[]> {
  try {
    const dir = healthHistoryDir();
    const files = await readdir(dir);
    return files
      .filter((f) => f.endsWith(".json"))
      .map((f) => f.replace(".json", ""));
  } catch {
    return [];
  }
}

/**
 * Clean up old health history files (older than 30 days).
 */
export async function cleanupOldHealthHistory(daysToKeep = 30): Promise<void> {
  try {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);

    const instances = await getAllInstancesWithHealth();

    for (const instanceId of instances) {
      const file = instanceHealthFile(instanceId);
      const content = await readFile(file, "utf8");
      const history: HealthCheckResult[] = JSON.parse(content);

      // Filter out entries older than the cutoff
      const filtered = history.filter((entry) => {
        const entryDate = new Date(entry.checkedAt);
        return entryDate >= cutoffDate;
      });

      if (filtered.length === 0) {
        // No recent entries, could delete the file
        // For now, just clear it
        await writeFile(file, JSON.stringify([], null, 2), "utf8");
      } else if (filtered.length < history.length) {
        await writeFile(file, JSON.stringify(filtered, null, 2), "utf8");
      }
    }
  } catch (err) {
    console.error("Failed to cleanup health history:", err);
  }
}
