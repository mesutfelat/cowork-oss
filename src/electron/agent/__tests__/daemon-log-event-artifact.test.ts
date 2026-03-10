import { describe, expect, it, vi } from "vitest";

import { AgentDaemon } from "../daemon";

function createDaemonLike() {
  let seq = 0;
  return {
    taskRepo: {
      findById: vi.fn().mockReturnValue({
        id: "task-1",
        workspaceId: "workspace-1",
      }),
    },
    workspaceRepo: {
      findById: vi.fn().mockReturnValue({
        id: "workspace-1",
        path: "/workspace",
      }),
    },
    timelineMetrics: {
      totalEvents: 0,
      droppedEvents: 0,
      orderViolations: 0,
      stepStateMismatches: 0,
      completionGateBlocks: 0,
      evidenceGateFails: 0,
    },
    getCurrentEventSeq: vi.fn().mockReturnValue(0),
    nextEventSeq: vi.fn().mockImplementation(() => {
      seq += 1;
      return seq;
    }),
    transitionTimelineStage: vi.fn(),
    trackTimelineStepState: vi.fn(),
    trackEvidenceRefs: vi.fn(),
    persistTimelineEvent: vi.fn(),
    normalizeArtifactEventPayload: (AgentDaemon.prototype as Any).normalizeArtifactEventPayload,
  } as Any;
}

describe("AgentDaemon.logEvent artifact normalization", () => {
  it("normalizes relative artifact paths to absolute workspace paths and assigns stable label", () => {
    const daemonLike = createDaemonLike();

    AgentDaemon.prototype.logEvent.call(daemonLike, "task-1", "artifact_created", {
      path: "reports/final.pdf",
    });

    const [timelineEvent, options] = (daemonLike.persistTimelineEvent as Any).mock.calls[0];
    expect(timelineEvent.type).toBe("timeline_artifact_emitted");
    expect(timelineEvent.payload.path).toBe("/workspace/reports/final.pdf");
    expect(timelineEvent.payload.label).toBe("final.pdf");
    expect(options.legacyType).toBe("artifact_created");
    expect(options.legacyPayload.path).toBe("/workspace/reports/final.pdf");
  });

  it("keeps URL artifacts and defaults label to the URL when missing", () => {
    const daemonLike = createDaemonLike();

    AgentDaemon.prototype.logEvent.call(daemonLike, "task-1", "timeline_artifact_emitted", {
      path: "https://example.com/report.pdf",
    });

    const [timelineEvent] = (daemonLike.persistTimelineEvent as Any).mock.calls[0];
    expect(timelineEvent.payload.path).toBe("https://example.com/report.pdf");
    expect(timelineEvent.payload.label).toBe("https://example.com/report.pdf");
  });
});

describe("AgentDaemon.emitTaskEvent legacy alias bridge", () => {
  it("emits both timeline and legacy alias events for local subscribers", () => {
    const emit = vi.fn();
    const daemonLike = {
      emit,
      resolveLegacyTaskEventAlias: (AgentDaemon.prototype as Any).resolveLegacyTaskEventAlias,
    } as Any;

    (AgentDaemon.prototype as Any).emitTaskEvent.call(daemonLike, {
      id: "event-1",
      taskId: "task-1",
      timestamp: Date.now(),
      type: "timeline_step_updated",
      payload: {
        message: "Hello from assistant",
        legacyType: "assistant_message",
      },
      schemaVersion: 2,
      legacyType: "assistant_message",
    } as Any);

    expect(emit).toHaveBeenCalledWith(
      "timeline_step_updated",
      expect.objectContaining({
        taskId: "task-1",
        type: "timeline_step_updated",
      }),
    );
    expect(emit).toHaveBeenCalledWith(
      "assistant_message",
      expect.objectContaining({
        taskId: "task-1",
        message: "Hello from assistant",
      }),
    );
  });

  it("skips legacy error aliases when no error listener is registered", () => {
    const emit = vi.fn();
    const daemonLike = {
      emit,
      listenerCount: vi.fn().mockReturnValue(0),
      resolveLegacyTaskEventAlias: (AgentDaemon.prototype as Any).resolveLegacyTaskEventAlias,
    } as Any;

    (AgentDaemon.prototype as Any).emitTaskEvent.call(daemonLike, {
      id: "event-2",
      taskId: "task-1",
      timestamp: Date.now(),
      type: "timeline_task_status",
      payload: {
        message: "Task failed before execution started",
        legacyType: "error",
      },
      schemaVersion: 2,
      legacyType: "error",
    } as Any);

    expect(emit).toHaveBeenCalledTimes(1);
    expect(emit).toHaveBeenCalledWith(
      "timeline_task_status",
      expect.objectContaining({
        taskId: "task-1",
        type: "timeline_task_status",
      }),
    );
  });
});
