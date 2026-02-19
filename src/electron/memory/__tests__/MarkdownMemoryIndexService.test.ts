import { describe, expect, it } from "vitest";
import {
  buildMarkdownFtsQuery,
  chunkMarkdownForIndex,
  redactSensitiveMarkdownContent,
  tokenizeForMemorySearch,
} from "../MarkdownMemoryIndexService";

describe("MarkdownMemoryIndexService helpers", () => {
  it("tokenizes and removes common stop words", () => {
    const tokens = tokenizeForMemorySearch(
      "Please update the release checklist and deployment notes for production",
    );

    expect(tokens).toContain("update");
    expect(tokens).toContain("release");
    expect(tokens).toContain("checklist");
    expect(tokens).not.toContain("the");
    expect(tokens).not.toContain("for");
  });

  it("builds a safe FTS query from free text", () => {
    const query = buildMarkdownFtsQuery('Release checklist: deploy "hotfix" now');
    expect(query).toBe('"release" AND "checklist" AND "deploy" AND "hotfix" AND "now"');
  });

  it("returns null FTS query when input has no searchable tokens", () => {
    const query = buildMarkdownFtsQuery("the and or if");
    expect(query).toBeNull();
  });

  it("chunks long markdown and preserves line ranges", () => {
    const lines = [
      "# Release Plan",
      "",
      "Step 1: prepare notes and validate migrations.",
      "Step 2: run smoke tests.",
      "",
      "## Rollout",
      "",
      "Deploy to staging.",
      "Promote to production.",
      "",
      "## Verify",
      "",
      "Check alerts and logs.",
      "Confirm dashboard health.",
      "Record learnings.",
    ];
    const content = lines.join("\n");
    const chunks = chunkMarkdownForIndex(content);

    expect(chunks.length).toBeGreaterThan(0);
    for (const chunk of chunks) {
      expect(chunk.startLine).toBeGreaterThan(0);
      expect(chunk.endLine).toBeGreaterThanOrEqual(chunk.startLine);
      expect(chunk.text.length).toBeGreaterThan(0);
    }
  });

  it("redacts sensitive secrets from markdown text", () => {
    const input = `
API_KEY=super-secret-value
Authorization: Bearer abc.def.ghi
token: xoxb-123-456-789
`;
    const redacted = redactSensitiveMarkdownContent(input);
    expect(redacted).not.toContain("super-secret-value");
    expect(redacted).not.toContain("abc.def.ghi");
    expect(redacted).not.toContain("xoxb-123-456-789");
    expect(redacted).toContain("[REDACTED]");
  });
});
