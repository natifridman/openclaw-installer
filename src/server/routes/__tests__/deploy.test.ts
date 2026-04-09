import { describe, it, expect, vi, beforeEach } from "vitest";
import type { DeployConfig } from "../../deployers/types.js";

// Mock dependencies
vi.mock("../../deployers/registry.js", () => ({
  registry: {
    get: vi.fn(),
  },
}));

vi.mock("../../ws.js", () => ({
  createLogCallback: vi.fn(() => vi.fn()),
  sendStatus: vi.fn(),
}));

vi.mock("../../services/gcp.js", () => ({
  detectGcpDefaults: vi.fn(async () => ({ projectId: null, location: null, serviceAccountJson: null })),
  defaultVertexLocation: vi.fn(() => "us-central1"),
}));

vi.mock("node:fs", () => ({
  readFileSync: vi.fn(),
  existsSync: vi.fn(),
}));

import { registry } from "../../deployers/registry.js";
import { readFileSync, existsSync } from "node:fs";

// Import router after mocks
const { default: deployRouter } = await import("../deploy.js");

// Mock request/response helpers
function mockReq(body: Partial<DeployConfig>): any {
  return { body };
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

// Extract POST / handler
function findHandler(method: string, path: string) {
  for (const layer of (deployRouter as any).stack) {
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

const deployHandler = findHandler("post", "/");

describe("POST /api/deploy", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 400 when mode is missing", async () => {
    const res = mockRes();
    await deployHandler(mockReq({ agentName: "test" }), res);

    expect(res.statusCode).toBe(400);
    expect(res.body.error).toMatch(/missing required fields/i);
  });

  it("returns 400 when agentName is missing", async () => {
    const res = mockRes();
    await deployHandler(mockReq({ mode: "local" }), res);

    expect(res.statusCode).toBe(400);
    expect(res.body.error).toMatch(/missing required fields/i);
  });

  it("returns 400 when agentName is invalid", async () => {
    const res = mockRes();
    await deployHandler(mockReq({ mode: "local", agentName: "Invalid Name!" }), res);

    expect(res.statusCode).toBe(400);
    expect(res.body.error).toMatch(/invalid agent name/i);
  });

  it("returns 400 for unsupported mode", async () => {
    vi.mocked(registry.get).mockReturnValue(null);

    const res = mockRes();
    await deployHandler(mockReq({ mode: "unsupported", agentName: "test" }), res);

    expect(res.statusCode).toBe(400);
    expect(res.body.error).toMatch(/unsupported mode/i);
  });

  it("returns 400 when SSH sandbox is enabled without target", async () => {
    const res = mockRes();
    await deployHandler(
      mockReq({
        mode: "local",
        agentName: "test",
        sandboxEnabled: true,
        sandboxBackend: "ssh",
      }),
      res
    );

    expect(res.statusCode).toBe(400);
    expect(res.body.error).toMatch(/ssh sandbox requires.*target/i);
  });

  it("returns 400 when SSH sandbox is enabled without identity path", async () => {
    const res = mockRes();
    await deployHandler(
      mockReq({
        mode: "local",
        agentName: "test",
        sandboxEnabled: true,
        sandboxBackend: "ssh",
        sandboxSshTarget: "user@host",
      }),
      res
    );

    expect(res.statusCode).toBe(400);
    expect(res.body.error).toMatch(/ssh sandbox requires.*identity/i);
  });

  it("returns 400 when SecretRef is malformed", async () => {
    const res = mockRes();
    await deployHandler(
      mockReq({
        mode: "local",
        agentName: "test",
        anthropicApiKeyRef: { source: "invalid" as any, provider: "", id: "" },
      }),
      res
    );

    expect(res.statusCode).toBe(400);
    expect(res.body.error).toMatch(/secretref requires/i);
  });

  it("returns 400 when secretsProvidersJson is invalid JSON", async () => {
    const res = mockRes();
    await deployHandler(
      mockReq({
        mode: "local",
        agentName: "test",
        secretsProvidersJson: "not-valid-json",
      }),
      res
    );

    expect(res.statusCode).toBe(400);
    expect(res.body.error).toMatch(/invalid secretsProvidersjson/i);
  });

  it("returns 400 when secretsProvidersJson is not an object", async () => {
    const res = mockRes();
    await deployHandler(
      mockReq({
        mode: "local",
        agentName: "test",
        secretsProvidersJson: "[]",
      }),
      res
    );

    expect(res.statusCode).toBe(400);
    expect(res.body.error).toMatch(/must be a json object/i);
  });

  it("returns 400 when GCP SA JSON file is not found", async () => {
    vi.mocked(existsSync).mockReturnValue(false);

    const res = mockRes();
    await deployHandler(
      mockReq({
        mode: "local",
        agentName: "test",
        gcpServiceAccountPath: "/nonexistent/path.json",
      }),
      res
    );

    expect(res.statusCode).toBe(400);
    expect(res.body.error).toMatch(/gcp sa json file not found/i);
  });

  it("returns 400 when modelEndpoint has invalid URL format", async () => {
    const res = mockRes();
    await deployHandler(
      mockReq({
        mode: "local",
        agentName: "test",
        modelEndpoint: "not-a-url",
      }),
      res
    );

    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBeTruthy();
  });

  it("returns 202 with deployId when deploy is accepted", async () => {
    const mockDeployer = {
      deploy: vi.fn(async () => ({ id: "test", status: "running" })),
    };
    vi.mocked(registry.get).mockReturnValue(mockDeployer as any);

    const res = mockRes();
    await deployHandler(
      mockReq({
        mode: "local",
        agentName: "test",
      }),
      res
    );

    expect(res.statusCode).toBe(202);
    expect(res.body.deployId).toBeTruthy();
    expect(typeof res.body.deployId).toBe("string");
  });

  it("trims optional string fields to undefined when empty", async () => {
    const mockDeployer = {
      deploy: vi.fn(async (_config: DeployConfig) => {
        // Verify trimming happened
        expect(_config.image).toBeUndefined();
        expect(_config.modelEndpoint).toBeUndefined();
        return { id: "test", status: "running" };
      }),
    };
    vi.mocked(registry.get).mockReturnValue(mockDeployer as any);

    const res = mockRes();
    await deployHandler(
      mockReq({
        mode: "local",
        agentName: "test",
        image: "   ",
        modelEndpoint: "",
      }),
      res
    );

    expect(res.statusCode).toBe(202);
    expect(mockDeployer.deploy).toHaveBeenCalled();
  });

  it("normalizes SecretRef correctly when all fields are present", async () => {
    const mockDeployer = {
      deploy: vi.fn(async (_config: DeployConfig) => {
        expect(_config.anthropicApiKeyRef).toEqual({
          source: "env",
          provider: "default",
          id: "ANTHROPIC_API_KEY",
        });
        return { id: "test", status: "running" };
      }),
    };
    vi.mocked(registry.get).mockReturnValue(mockDeployer as any);

    const res = mockRes();
    await deployHandler(
      mockReq({
        mode: "local",
        agentName: "test",
        anthropicApiKeyRef: {
          source: "env",
          provider: "default",
          id: "ANTHROPIC_API_KEY",
        },
      }),
      res
    );

    expect(res.statusCode).toBe(202);
  });

  it("normalizes SecretRef to undefined when all fields are empty", async () => {
    const mockDeployer = {
      deploy: vi.fn(async (_config: DeployConfig) => {
        expect(_config.anthropicApiKeyRef).toBeUndefined();
        return { id: "test", status: "running" };
      }),
    };
    vi.mocked(registry.get).mockReturnValue(mockDeployer as any);

    const res = mockRes();
    await deployHandler(
      mockReq({
        mode: "local",
        agentName: "test",
        anthropicApiKeyRef: {
          source: "" as any,
          provider: "",
          id: "",
        },
      }),
      res
    );

    expect(res.statusCode).toBe(202);
  });

  it("deduplicates and normalizes modelFallbacks array", async () => {
    const mockDeployer = {
      deploy: vi.fn(async (_config: DeployConfig) => {
        expect(_config.modelFallbacks).toEqual(["model1", "model2"]);
        return { id: "test", status: "running" };
      }),
    };
    vi.mocked(registry.get).mockReturnValue(mockDeployer as any);

    const res = mockRes();
    await deployHandler(
      mockReq({
        mode: "local",
        agentName: "test",
        modelFallbacks: ["model1", "  model2  ", "model1", ""],
      }),
      res
    );

    expect(res.statusCode).toBe(202);
  });

  it("applies server env fallbacks for API keys", async () => {
    const mockDeployer = {
      deploy: vi.fn(async (_config: DeployConfig) => {
        expect(_config.anthropicApiKey).toBe("sk-ant-from-env");
        return { id: "test", status: "running" };
      }),
    };
    vi.mocked(registry.get).mockReturnValue(mockDeployer as any);

    // Mock process.env
    const originalEnv = process.env;
    process.env = { ...originalEnv, ANTHROPIC_API_KEY: "sk-ant-from-env" };

    const res = mockRes();
    await deployHandler(
      mockReq({
        mode: "local",
        agentName: "test",
      }),
      res
    );

    process.env = originalEnv;

    expect(res.statusCode).toBe(202);
  });
});
