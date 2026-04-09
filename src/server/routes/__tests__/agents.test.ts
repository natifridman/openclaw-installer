import { describe, it, expect, vi, beforeEach } from "vitest";
import { execFile } from "node:child_process";
import { readdir, stat, readFile, rm } from "node:fs/promises";
import { join } from "node:path";

// Mock fs/promises and child_process
vi.mock("node:child_process", () => ({
  execFile: vi.fn(),
}));

vi.mock("node:fs/promises", () => ({
  readdir: vi.fn(),
  stat: vi.fn(),
  readFile: vi.fn(),
  rm: vi.fn(),
}));

// Import router after mocks
const { default: agentsRouter } = await import("../agents.js");

// Mock request/response helpers
function mockReq(query: Record<string, string> = {}): any {
  return { query };
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

// Extract route handlers
function findHandler(method: string, path: string) {
  for (const layer of (agentsRouter as any).stack) {
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

const browseAgents = findHandler("get", "/browse");
const listLocalAgents = findHandler("get", "/local");

describe("GET /api/agents/browse", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 400 when repo parameter is missing", async () => {
    const res = mockRes();
    await browseAgents(mockReq(), res);

    expect(res.statusCode).toBe(400);
    expect(res.body.error).toMatch(/repo.*required/i);
  });

  it("returns agent list when git clone succeeds", async () => {
    vi.mocked(execFile).mockImplementation((_cmd, _args, callback: any) => {
      callback(null, { stdout: "", stderr: "" });
      return {} as any;
    });

    vi.mocked(readdir).mockResolvedValue([
      { name: "agent1", isDirectory: () => true } as any,
      { name: "_ignored", isDirectory: () => true } as any,
      { name: "file.txt", isDirectory: () => false } as any,
    ]);

    vi.mocked(stat)
      .mockResolvedValueOnce({} as any) // AGENTS.md.envsubst exists
      .mockRejectedValueOnce(new Error("not found")); // JOB.md doesn't exist

    vi.mocked(readFile).mockResolvedValue("description: Test agent\n");
    vi.mocked(rm).mockResolvedValue(undefined);

    const res = mockRes();
    await browseAgents(mockReq({ repo: "https://github.com/test/repo" }), res);

    expect(res.statusCode).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBe(1);
    expect(res.body[0].id).toBe("agent1");
    expect(res.body[0].description).toBe("Test agent");
    expect(res.body[0].hasAgentsMd).toBe(true);
    expect(res.body[0].hasJobMd).toBe(false);
  });

  it("returns 500 when git clone fails", async () => {
    vi.mocked(execFile).mockImplementation((_cmd, _args, callback: any) => {
      callback(new Error("git clone failed"), null);
      return {} as any;
    });

    vi.mocked(rm).mockResolvedValue(undefined);

    const res = mockRes();
    await browseAgents(mockReq({ repo: "https://invalid.repo" }), res);

    expect(res.statusCode).toBe(500);
    expect(res.body.error).toMatch(/failed to browse repo/i);
  });

  it("skips directories without AGENTS.md.envsubst", async () => {
    vi.mocked(execFile).mockImplementation((_cmd, _args, callback: any) => {
      callback(null, { stdout: "", stderr: "" });
      return {} as any;
    });

    vi.mocked(readdir).mockResolvedValue([
      { name: "agent1", isDirectory: () => true } as any,
      { name: "agent2", isDirectory: () => true } as any,
    ]);

    vi.mocked(stat)
      .mockResolvedValueOnce({} as any) // agent1 has AGENTS.md.envsubst
      .mockRejectedValueOnce(new Error("not found")) // agent1 no JOB.md
      .mockRejectedValueOnce(new Error("not found")); // agent2 no AGENTS.md.envsubst

    vi.mocked(readFile).mockResolvedValue("");
    vi.mocked(rm).mockResolvedValue(undefined);

    const res = mockRes();
    await browseAgents(mockReq({ repo: "https://github.com/test/repo" }), res);

    expect(res.statusCode).toBe(200);
    expect(res.body.length).toBe(1);
    expect(res.body[0].id).toBe("agent1");
  });
});

describe("GET /api/agents/local", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns local agents from the agents directory", async () => {
    vi.mocked(readdir).mockResolvedValue([
      { name: "local-agent", isDirectory: () => true } as any,
    ]);

    vi.mocked(stat)
      .mockResolvedValueOnce({} as any) // AGENTS.md.envsubst exists
      .mockResolvedValueOnce({} as any); // JOB.md exists

    vi.mocked(readFile).mockResolvedValue("description: Local test agent\n");

    const res = mockRes();
    await listLocalAgents(mockReq(), res);

    expect(res.statusCode).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBe(1);
    expect(res.body[0].id).toBe("local-agent");
    expect(res.body[0].description).toBe("Local test agent");
    expect(res.body[0].hasAgentsMd).toBe(true);
    expect(res.body[0].hasJobMd).toBe(true);
  });

  it("returns empty array when directory doesn't exist", async () => {
    vi.mocked(readdir).mockRejectedValue(new Error("ENOENT"));

    const res = mockRes();
    await listLocalAgents(mockReq(), res);

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual([]);
  });
});
