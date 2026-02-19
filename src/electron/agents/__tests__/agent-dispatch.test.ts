import { afterEach, beforeEach, describe, expect, it } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";

import { buildAgentDispatchPrompt } from "../agent-dispatch";

describe("agent-dispatch", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "cowork-agent-dispatch-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("injects role profile when workspacePath is provided", () => {
    fs.mkdirSync(path.join(tmpDir, ".cowork", "agents", "qa-analyst"), { recursive: true });
    fs.writeFileSync(
      path.join(tmpDir, ".cowork", "agents", "qa-analyst", "SOUL.md"),
      "# SOUL\n\nCalm and concise",
      "utf-8",
    );

    const prompt = buildAgentDispatchPrompt(
      { displayName: "QA Analyst" },
      { title: "Audit", prompt: "Review logs" },
      { includeRoleDetails: false, workspacePath: tmpDir },
    );

    expect(prompt).toContain("ROLE PROFILE");
    expect(prompt).toContain("Calm and concise");
    expect(prompt).toContain("Parent task: Audit");
    expect(prompt).not.toContain("You are QA Analyst");
  });

  it("omits role profile when includeRoleProfile is false", () => {
    const prompt = buildAgentDispatchPrompt(
      { displayName: "QA Analyst" },
      { title: "Audit", prompt: "Review logs" },
      { includeRoleDetails: false, includeRoleProfile: false, workspacePath: tmpDir },
    );

    expect(prompt).not.toContain("ROLE PROFILE");
    expect(prompt).not.toContain("ROLE NOTES");
    expect(prompt).toContain("Parent task: Audit");
    expect(prompt).not.toContain("You are QA Analyst");
  });
});
