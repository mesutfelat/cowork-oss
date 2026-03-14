import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { runWorkspaceKitLintCli, usage } from "../kit-lint-cli";

function writeFile(filePath: string, content: string): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, "utf8");
}

describe("kit-lint-cli", () => {
  let tmpDir: string;
  let originalArgv: string[];
  let logSpy: ReturnType<typeof vi.spyOn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "cowork-kit-cli-"));
    originalArgv = [...process.argv];
    logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    process.exitCode = 0;
  });

  afterEach(() => {
    process.argv = originalArgv;
    process.exitCode = 0;
    logSpy.mockRestore();
    errorSpy.mockRestore();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("prints usage and exits cleanly for --help", async () => {
    const code = await runWorkspaceKitLintCli(["node", "kit-lint", "--help"]);

    expect(code).toBe(0);
    expect(logSpy).toHaveBeenCalledWith(usage());
  });

  it("returns success when no lint findings are present", async () => {
    writeFile(
      path.join(tmpDir, ".cowork", "AGENTS.md"),
      [
        "---",
        "file: AGENTS.md",
        "updated: 2026-03-14",
        "scope: task, main-session",
        "mutability: system_locked",
        "---",
        "",
        "# Workspace Rules",
        "",
        "## Coordination",
        "- Keep durable context in memory",
        "",
      ].join("\n"),
    );

    const code = await runWorkspaceKitLintCli(["node", "kit-lint", tmpDir]);
    const output = logSpy.mock.calls.map((call: unknown[]) => call.join(" ")).join("\n");

    expect(code).toBe(0);
    expect(output).toContain("Workspace Kit Lint");
    expect(output).toContain(`workspace: ${tmpDir}`);
    expect(output).toContain("errors: 0");
  });

  it("returns non-zero and includes issue details when lint findings are present", async () => {
    writeFile(
      path.join(tmpDir, ".cowork", "TOOLS.md"),
      [
        "---",
        "file: TOOLS.md",
        "updated: 2020-01-01",
        "scope: task, main-session",
        "mutability: user_owned",
        "---",
        "",
        "# Tools",
        "",
        "## Notes",
        "- password = super-secret",
        "",
      ].join("\n"),
    );

    const code = await runWorkspaceKitLintCli(["node", "kit-lint", "--strict", tmpDir]);
    const output = logSpy.mock.calls.map((call: unknown[]) => call.join(" ")).join("\n");

    expect(code).toBe(1);
    expect(output).toContain("Tracked entries with findings:");
    expect(output).toContain("TOOLS.md");
    expect(output).toContain("possible_secret");
  });

  it("emits JSON output when requested", async () => {
    writeFile(
      path.join(tmpDir, ".cowork", "BOOTSTRAP.md"),
      [
        "---",
        "file: BOOTSTRAP.md",
        "updated: 2026-03-14",
        "scope: bootstrap",
        "mutability: system_locked",
        "---",
        "",
        "# Bootstrap",
        "",
        "- [ ] Seed project",
        "",
      ].join("\n"),
    );

    const code = await runWorkspaceKitLintCli(["node", "kit-lint", "--json", tmpDir]);
    const payload = logSpy.mock.calls[0]?.[0];

    expect(code).toBe(0);
    expect(typeof payload).toBe("string");
    expect(() => JSON.parse(String(payload))).not.toThrow();
    expect(JSON.parse(String(payload))).toMatchObject({
      workspacePath: tmpDir,
      onboarding: {
        bootstrapPresent: true,
      },
    });
  });
});
