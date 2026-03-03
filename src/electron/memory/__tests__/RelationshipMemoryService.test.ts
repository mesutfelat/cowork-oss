import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../database/SecureSettingsRepository", () => ({
  SecureSettingsRepository: {
    isInitialized: vi.fn().mockReturnValue(false),
    getInstance: vi.fn(),
  },
}));

import { RelationshipMemoryService } from "../RelationshipMemoryService";

type Any = Record<string, unknown>;

describe("RelationshipMemoryService task history capture", () => {
  beforeEach(() => {
    (RelationshipMemoryService as Any).inMemoryProfile = {
      items: [],
      updatedAt: 0,
    };
  });

  it("collapses recurring cron task completions to one history entry per title", () => {
    RelationshipMemoryService.recordTaskCompletion(
      "Daily F1 News",
      "First run summary about race practice and driver updates.",
      "task-1",
      "cron",
    );
    RelationshipMemoryService.recordTaskCompletion(
      "Daily F1 News",
      "Second run summary with latest qualifying changes.",
      "task-2",
      "cron",
    );

    const history = RelationshipMemoryService.listItems({
      layer: "history",
      includeDone: true,
      limit: 20,
    });

    expect(history).toHaveLength(1);
    expect(history[0].text).toContain("Daily F1 News");
    expect(history[0].text).toContain("Second run summary");
    expect(history[0].lastTaskId).toBe("task-2");
  });

  it("keeps distinct manual task completion history entries", () => {
    RelationshipMemoryService.recordTaskCompletion(
      "Daily F1 News",
      "Manual run one summary.",
      "task-1",
      "manual",
    );
    RelationshipMemoryService.recordTaskCompletion(
      "Daily F1 News",
      "Manual run two summary.",
      "task-2",
      "manual",
    );

    const history = RelationshipMemoryService.listItems({
      layer: "history",
      includeDone: true,
      limit: 20,
    });

    expect(history).toHaveLength(2);
  });

  it("one-click cleanup collapses existing duplicate completed-task history entries", () => {
    RelationshipMemoryService.recordTaskCompletion(
      "Daily AI Agent Trends Research",
      "Older run summary.",
      "task-1",
      "manual",
    );
    RelationshipMemoryService.recordTaskCompletion(
      "Daily AI Agent Trends Research",
      "Newest run summary.",
      "task-2",
      "manual",
    );
    RelationshipMemoryService.recordTaskCompletion(
      "Weekly Infra Status",
      "Different recurring title.",
      "task-3",
      "manual",
    );

    const cleanup = RelationshipMemoryService.cleanupRecurringTaskHistory();
    expect(cleanup.collapsed).toBe(1);
    expect(cleanup.groupsCollapsed).toBe(1);

    const history = RelationshipMemoryService.listItems({
      layer: "history",
      includeDone: true,
      limit: 20,
    });
    expect(history).toHaveLength(2);
    const titles = history.map((entry) => entry.text);
    expect(titles.some((text) => text.includes("Newest run summary"))).toBe(true);
    expect(titles.some((text) => text.includes("Older run summary"))).toBe(false);
  });
});
