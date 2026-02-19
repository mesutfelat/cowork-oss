import { describe, it, expect } from "vitest";
import { ContextManager } from "../context-manager";
import type { LLMMessage } from "../llm";

describe("ContextManager.compactMessagesWithMeta", () => {
  it("returns kind=none when within limits", () => {
    const cm = new ContextManager("gpt-3.5-turbo");
    const messages: LLMMessage[] = [
      { role: "user", content: "short task context" },
      { role: "assistant", content: "short response" },
    ];

    const res = cm.compactMessagesWithMeta(messages, 0);
    expect(res.meta.kind).toBe("none");
    expect(res.meta.removedMessages.didRemove).toBe(false);
    expect(res.meta.removedMessages.messages).toEqual([]);
    expect(res.messages).toEqual(messages);
  });

  it("keeps pinned messages and reports removed messages", () => {
    const cm = new ContextManager("gpt-3.5-turbo");
    const pinned: LLMMessage = {
      role: "user",
      content: "<cowork_memory_recall>\n- pinned\n</cowork_memory_recall>",
    };

    const messages: LLMMessage[] = [{ role: "user", content: "task context" }, pinned];

    // Force compaction by exceeding the available token estimate.
    for (let i = 0; i < 40; i++) {
      messages.push({
        role: i % 2 === 0 ? "assistant" : "user",
        content: "x".repeat(2000),
      });
    }

    const res = cm.compactMessagesWithMeta(messages, 0);
    expect(res.meta.kind).toBe("message_removal");
    expect(res.meta.removedMessages.didRemove).toBe(true);
    expect(res.meta.removedMessages.count).toBeGreaterThan(0);
    expect(res.meta.removedMessages.messages.length).toBe(res.meta.removedMessages.count);

    // Pinned recall must be retained.
    expect(
      res.messages.some(
        (m) => typeof m.content === "string" && m.content.includes("<cowork_memory_recall>"),
      ),
    ).toBe(true);

    // Removed messages should never include pinned blocks.
    expect(
      res.meta.removedMessages.messages.some(
        (m) => typeof m.content === "string" && m.content.includes("<cowork_memory_recall>"),
      ),
    ).toBe(false);

    // First message (task/step context) is always retained.
    expect(res.messages[0]?.role).toBe("user");
    expect(res.messages[0]?.content).toBe("task context");
  });
});
