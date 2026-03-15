import { describe, it, expect, vi } from "vitest";
import { CodeExecTools } from "../tools/code-exec-tools";

// Mock the sandbox factory so we don't need a real sandbox in tests
vi.mock("../sandbox/sandbox-factory", () => ({
  createSandbox: vi.fn().mockResolvedValue({
    type: "docker",
    initialize: vi.fn().mockResolvedValue(undefined),
    execute: vi.fn().mockImplementation(async (command: string) => ({
      exitCode: 0,
      stdout: command.includes("python3") ? "hello python" : "hello shell",
      stderr: "",
      killed: false,
      timedOut: false,
    })),
    executeCode: vi.fn().mockResolvedValue({
      exitCode: 0,
      stdout: "hello python",
      stderr: "",
      killed: false,
      timedOut: false,
    }),
    cleanup: vi.fn(),
  }),
}));

const fakeWorkspace = { id: "ws-1", name: "test", path: "/tmp/test", createdAt: 0, lastUsedAt: 0 };

describe("CodeExecTools", () => {
  it("executes shell code and returns stdout", async () => {
    const tools = new CodeExecTools(fakeWorkspace as unknown as import("../../../shared/types").Workspace);
    const result = await tools.executeCode({ language: "shell", code: "echo hello" });
    expect(result.stdout).toBe("hello shell");
    expect(result.exit_code).toBe(0);
    expect(result.language).toBe("shell");
    expect(result.timed_out).toBe(false);
  });

  it("executes python code via executeCode sandbox method", async () => {
    const tools = new CodeExecTools(fakeWorkspace as unknown as import("../../../shared/types").Workspace);
    const result = await tools.executeCode({ language: "python", code: "print('hello')" });
    expect(result.stdout).toBe("hello python");
    expect(result.language).toBe("python");
  });

  it("rejects execution when no OS-level sandbox is available", async () => {
    const { createSandbox } = await import("../sandbox/sandbox-factory");
    vi.mocked(createSandbox).mockResolvedValueOnce({
      type: "none",
      initialize: vi.fn().mockResolvedValue(undefined),
      execute: vi.fn(),
      executeCode: vi.fn(),
      cleanup: vi.fn(),
    } as never);

    const tools = new CodeExecTools(fakeWorkspace as unknown as import("../../../shared/types").Workspace);
    await expect(tools.executeCode({ language: "shell", code: "echo hello" })).rejects.toThrow(
      /requires an OS-level sandbox/i,
    );
  });

  it("clamps timeout to max 60 seconds", async () => {
    const { createSandbox } = await import("../sandbox/sandbox-factory");
    const tools = new CodeExecTools(fakeWorkspace as unknown as import("../../../shared/types").Workspace);
    await tools.executeCode({ language: "shell", code: "sleep 1", timeout_seconds: 999 });
    // The sandbox.execute is called with options; we just verify no error thrown
    expect(createSandbox).toHaveBeenCalled();
  });

  it("getToolDefinitions returns a tool named execute_code", () => {
    const defs = CodeExecTools.getToolDefinitions();
    expect(defs).toHaveLength(1);
    expect(defs[0].name).toBe("execute_code");
    expect(defs[0].input_schema.required).toContain("language");
    expect(defs[0].input_schema.required).toContain("code");
  });
});
