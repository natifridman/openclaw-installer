import { mkdir, readdir, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { existsSync } from "node:fs";
import type { DeployConfig } from "./types.js";
import { installerLocalHistoryDir, installerK8sHistoryDir } from "../paths.js";

const DEFAULT_MAX_HISTORY = 10;

export interface DeploymentHistoryEntry {
  timestamp: string;
  filename: string;
  config: DeployConfig;
}

/**
 * Save a deployment config to history.
 * For local mode: saves as deploy-{timestamp}.env
 * For k8s mode: saves as deploy-config-{timestamp}.json
 */
export async function saveDeploymentHistory(
  config: DeployConfig,
  content: string,
  isJson = false,
): Promise<void> {
  const timestamp = Date.now();
  const extension = isJson ? "json" : "env";
  const prefix = isJson ? "deploy-config" : "deploy";
  const filename = `${prefix}-${timestamp}.${extension}`;

  let historyDir: string;
  if (config.mode === "local") {
    historyDir = installerLocalHistoryDir(config.agentName);
  } else if (config.mode === "kubernetes") {
    if (!config.namespace) {
      throw new Error("Kubernetes deployments require a namespace");
    }
    historyDir = installerK8sHistoryDir(config.namespace);
  } else {
    // Skip history for unsupported modes
    return;
  }

  try {
    await mkdir(historyDir, { recursive: true });
    const historyPath = join(historyDir, filename);
    await writeFile(historyPath, content, { mode: 0o600 });
  } catch (error) {
    // Log but don't fail deployment if history save fails
    console.warn(`Failed to save deployment history: ${error}`);
  }

  // Cleanup old history after saving
  await cleanupOldHistory(config);
}

/**
 * Remove old deployment history entries, keeping only the most recent N.
 */
export async function cleanupOldHistory(
  config: DeployConfig,
  maxHistory = DEFAULT_MAX_HISTORY,
): Promise<void> {
  let historyDir: string;
  let pattern: RegExp;

  if (config.mode === "local") {
    historyDir = installerLocalHistoryDir(config.agentName);
    pattern = /^deploy-(\d+)\.env$/;
  } else if (config.mode === "kubernetes") {
    if (!config.namespace) return;
    historyDir = installerK8sHistoryDir(config.namespace);
    pattern = /^deploy-config-(\d+)\.json$/;
  } else {
    return;
  }

  if (!existsSync(historyDir)) return;

  try {
    const files = await readdir(historyDir);
    const historyFiles = files
      .filter((f) => pattern.test(f))
      .map((f) => {
        const match = f.match(pattern);
        return {
          filename: f,
          timestamp: match ? parseInt(match[1], 10) : 0,
        };
      })
      .sort((a, b) => b.timestamp - a.timestamp); // Sort newest first

    // Remove files beyond maxHistory
    const filesToDelete = historyFiles.slice(maxHistory);
    for (const file of filesToDelete) {
      await unlink(join(historyDir, file.filename));
    }
  } catch (error) {
    console.warn(`Failed to cleanup old history: ${error}`);
  }
}

/**
 * Get deployment history for an instance.
 * Returns array of history entries sorted newest first.
 */
export async function getDeploymentHistory(
  config: DeployConfig,
): Promise<DeploymentHistoryEntry[]> {
  let historyDir: string;
  let pattern: RegExp;

  if (config.mode === "local") {
    historyDir = installerLocalHistoryDir(config.agentName);
    pattern = /^deploy-(\d+)\.env$/;
  } else if (config.mode === "kubernetes") {
    if (!config.namespace) return [];
    historyDir = installerK8sHistoryDir(config.namespace);
    pattern = /^deploy-config-(\d+)\.json$/;
  } else {
    return [];
  }

  if (!existsSync(historyDir)) return [];

  try {
    const files = await readdir(historyDir);
    const historyFiles = files
      .filter((f) => pattern.test(f))
      .map((f) => {
        const match = f.match(pattern);
        const timestamp = match ? parseInt(match[1], 10) : 0;
        return {
          timestamp: new Date(timestamp).toISOString(),
          filename: f,
          config, // We'll need to read the actual config in a future phase
        };
      })
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    return historyFiles;
  } catch (error) {
    console.warn(`Failed to read deployment history: ${error}`);
    return [];
  }
}
