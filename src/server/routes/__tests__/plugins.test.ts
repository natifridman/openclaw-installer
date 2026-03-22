import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Deployer, DeployConfig, DeployResult, LogCallback } from "../../deployers/types.js";

// Mock the loader module before importing the router
vi.mock("../../plugins/loader.js", () => ({
  getDisabledModes: vi.fn(async () => []),
  setModeDisabled: vi.fn(async () => {}),
}));

// Mock the registry singleton with a fresh DeployerRegistry
vi.mock("../../deployers/registry.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../deployers/registry.js")>();
  return {
    ...actual,
    registry: new actual.DeployerRegistry(),
  };
});

import { getDisabledModes, setModeDisabled } from "../../plugins/loader.js";
import { registry } from "../../deployers/registry.js";

// Import the router after mocks are set up
const { default: pluginsRouter } = await import("../plugins.js");

function stubDeployer(): Deployer {
  return {
    async deploy(_config: DeployConfig, _log: LogCallback): Promise<DeployResult> {
      return { id: "test", mode: "test", status: "running", config: { mode: "test", agentName: "t" }, startedAt: "" };
    },
    async start(result: DeployResult): Promise<DeployResult> { return result; },
    async status(result: DeployResult): Promise<DeployResult> { return result; },
    async stop(): Promise<void> {},
    async teardown(): Promise<void> {},
  };
}

// Minimal mock for Express req/res to test route handlers directly
function mockReq(params: Record<string, string> = {}): any {
  return { params };
}

function mockRes() {
  const res: any = {
    statusCode: 200,
    body: null,
    status(code: number) { res.statusCode = code; return res; },
    json(data: any) { res.body = data; return res; },
  };
  return res;
}

// Extract route handlers from the router
function findHandler(method: string, path: string) {
  for (const layer of (pluginsRouter as any).stack) {
    if (
      layer.route &&
      layer.route.path === path &&
      layer.route.methods[method]
    ) {
      return layer.route.stack[0].handle;
    }
  }
  throw new Error(`No handler found for ${method.toUpperCase()} ${path}`);
}

const getPlugins = findHandler("get", "/");
const disablePlugin = findHandler("post", "/:mode/disable");
const enablePlugin = findHandler("post", "/:mode/enable");

describe("GET /api/plugins", () => {
  beforeEach(() => {
    vi.mocked(getDisabledModes).mockReset().mockResolvedValue([]);
    vi.mocked(setModeDisabled).mockReset().mockResolvedValue(undefined);
  });

  it("returns registered deployers with enabled status", async () => {
    registry.register({
      mode: "local",
      title: "This Machine",
      description: "Run locally",
      deployer: stubDeployer(),
      detect: async () => true,
      builtIn: true,
      priority: 0,
    });

    const res = mockRes();
    await getPlugins(mockReq(), res);

    expect(res.body.plugins).toBeDefined();
    const local = res.body.plugins.find((p: any) => p.mode === "local");
    expect(local).toBeDefined();
    expect(local.title).toBe("This Machine");
    expect(local.builtIn).toBe(true);
    expect(local.enabled).toBe(true);
  });

  it("marks disabled deployers correctly", async () => {
    vi.mocked(getDisabledModes).mockResolvedValue(["openshift"]);

    registry.register({
      mode: "openshift",
      title: "OpenShift",
      description: "Deploy to OpenShift",
      deployer: stubDeployer(),
      detect: async () => true,
      builtIn: false,
      priority: 10,
    });

    const res = mockRes();
    await getPlugins(mockReq(), res);

    const openshift = res.body.plugins.find((p: any) => p.mode === "openshift");
    expect(openshift).toBeDefined();
    expect(openshift.enabled).toBe(false);
  });

  it("includes load errors in response", async () => {
    registry.addLoadError({ pluginId: "broken-plugin", error: "Import failed" });

    const res = mockRes();
    await getPlugins(mockReq(), res);

    expect(res.body.errors).toBeDefined();
    expect(res.body.errors.some((e: any) => e.pluginId === "broken-plugin")).toBe(true);
  });
});

describe("POST /api/plugins/:mode/disable", () => {
  beforeEach(() => {
    vi.mocked(getDisabledModes).mockReset().mockResolvedValue([]);
    vi.mocked(setModeDisabled).mockReset().mockResolvedValue(undefined);
  });

  it("returns 404 for unknown deployer mode", async () => {
    const res = mockRes();
    await disablePlugin(mockReq({ mode: "nonexistent" }), res);

    expect(res.statusCode).toBe(404);
    expect(res.body.error).toMatch(/unknown deployer mode/i);
    expect(vi.mocked(setModeDisabled)).not.toHaveBeenCalled();
  });

  it("returns 400 when trying to disable a built-in deployer", async () => {
    registry.register({
      mode: "builtin-test",
      title: "Built-in Test",
      description: "Test",
      deployer: stubDeployer(),
      builtIn: true,
    });

    const res = mockRes();
    await disablePlugin(mockReq({ mode: "builtin-test" }), res);

    expect(res.statusCode).toBe(400);
    expect(res.body.error).toMatch(/built-in/i);
    expect(vi.mocked(setModeDisabled)).not.toHaveBeenCalled();
  });

  it("disables a non-built-in deployer", async () => {
    registry.register({
      mode: "plugin-test",
      title: "Plugin Test",
      description: "Test",
      deployer: stubDeployer(),
      builtIn: false,
    });

    const res = mockRes();
    await disablePlugin(mockReq({ mode: "plugin-test" }), res);

    expect(res.statusCode).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(vi.mocked(setModeDisabled)).toHaveBeenCalledWith("plugin-test", true);
  });
});

describe("POST /api/plugins/:mode/enable", () => {
  beforeEach(() => {
    vi.mocked(getDisabledModes).mockReset().mockResolvedValue([]);
    vi.mocked(setModeDisabled).mockReset().mockResolvedValue(undefined);
  });

  it("returns 404 for unknown deployer mode", async () => {
    const res = mockRes();
    await enablePlugin(mockReq({ mode: "nonexistent" }), res);

    expect(res.statusCode).toBe(404);
    expect(res.body.error).toMatch(/unknown deployer mode/i);
    expect(vi.mocked(setModeDisabled)).not.toHaveBeenCalled();
  });

  it("enables a previously disabled deployer", async () => {
    registry.register({
      mode: "plugin-enable-test",
      title: "Plugin Enable Test",
      description: "Test",
      deployer: stubDeployer(),
      builtIn: false,
    });

    const res = mockRes();
    await enablePlugin(mockReq({ mode: "plugin-enable-test" }), res);

    expect(res.statusCode).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(vi.mocked(setModeDisabled)).toHaveBeenCalledWith("plugin-enable-test", false);
  });
});
