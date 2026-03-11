import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EventEmitter } from "events";
import fs from "fs";
import os from "os";
import path from "path";
import type { ImprovementCandidate, ImprovementRun, Task, Workspace } from "../../../shared/types";
import { ImprovementLoopService } from "../ImprovementLoopService";

const workspaces = new Map<string, Workspace>();
const tasks = new Map<string, Task>();
const runs = new Map<string, ImprovementRun>();
const candidates = new Map<string, ImprovementCandidate>();
const tempDirs: string[] = [];
let mockSettings = {
  enabled: true,
  autoRun: false,
  includeDevLogs: false,
  intervalMinutes: 1440,
  maxConcurrentExperiments: 1,
  maxOpenCandidatesPerWorkspace: 25,
  requireWorktree: true,
  reviewRequired: true,
  promotionMode: "github_pr" as const,
  evalWindowDays: 14,
};

vi.mock("../ImprovementSettingsManager", () => ({
  ImprovementSettingsManager: {
    loadSettings: () => mockSettings,
    saveSettings: vi.fn(),
  },
}));

vi.mock("../../database/repositories", () => ({
  WorkspaceRepository: class {
    findAll() {
      return [...workspaces.values()];
    }

    findById(id: string) {
      return workspaces.get(id);
    }
  },
  TaskRepository: class {
    findById(id: string) {
      return tasks.get(id);
    }
  },
}));

vi.mock("../ImprovementRepositories", () => ({
  ImprovementCandidateRepository: class {
    list() {
      return [] as ImprovementCandidate[];
    }

    findById(id: string) {
      return candidates.get(id);
    }
  },
  ImprovementRunRepository: class {
    create(input: Any) {
      const run: ImprovementRun = {
        ...input,
        id: `run-${runs.size + 1}`,
        createdAt: input.createdAt ?? Date.now(),
      };
      runs.set(run.id, run);
      return run;
    }

    update(id: string, updates: Partial<ImprovementRun>) {
      const existing = runs.get(id);
      if (!existing) return;
      runs.set(id, { ...existing, ...updates });
    }

    findById(id: string) {
      return runs.get(id);
    }

    findByTaskId(taskId: string) {
      return [...runs.values()].find((run) => run.taskId === taskId);
    }

    list(params?: {
      workspaceId?: string;
      candidateId?: string;
      status?: ImprovementRun["status"] | ImprovementRun["status"][];
      reviewStatus?: ImprovementRun["reviewStatus"] | ImprovementRun["reviewStatus"][];
      limit?: number;
    }) {
      let rows = [...runs.values()];
      if (params?.workspaceId) {
        rows = rows.filter((run) => run.workspaceId === params.workspaceId);
      }
      if (params?.candidateId) {
        rows = rows.filter((run) => run.candidateId === params.candidateId);
      }
      if (params?.status) {
        const statuses = Array.isArray(params.status) ? params.status : [params.status];
        rows = rows.filter((run) => statuses.includes(run.status));
      }
      if (params?.reviewStatus) {
        const statuses = Array.isArray(params.reviewStatus) ? params.reviewStatus : [params.reviewStatus];
        rows = rows.filter((run) => statuses.includes(run.reviewStatus));
      }
      rows = rows.sort((a, b) => b.createdAt - a.createdAt);
      if (typeof params?.limit === "number") {
        rows = rows.slice(0, params.limit);
      }
      return rows;
    }

    countActive() {
      return [...runs.values()].filter((run) => run.status === "queued" || run.status === "running").length;
    }
  },
}));

vi.mock("../ExperimentEvaluationService", () => ({
  ExperimentEvaluationService: class {
    snapshot(windowDays: number) {
      return {
        generatedAt: Date.now(),
        windowDays,
        taskSuccessRate: 0.5,
        approvalDeadEndRate: 0.1,
        verificationPassRate: 0.6,
        retriesPerTask: 1,
        toolFailureRateByTool: [],
      };
    }

    evaluateRun(params: Any) {
      return {
        runId: params.runId,
        passed: true,
        summary: "Experiment passed targeted checks and is ready for review.",
        notes: ["Verification passed."],
        targetedVerificationPassed: true,
        verificationPassed: true,
        baselineMetrics: this.snapshot(params.evalWindowDays),
        outcomeMetrics: this.snapshot(params.evalWindowDays),
      };
    }
  },
}));

describe("ImprovementLoopService", () => {
  beforeEach(() => {
    workspaces.clear();
    tasks.clear();
    runs.clear();
    candidates.clear();
    mockSettings = {
      enabled: true,
      autoRun: false,
      includeDevLogs: false,
      intervalMinutes: 1440,
      maxConcurrentExperiments: 1,
      maxOpenCandidatesPerWorkspace: 25,
      requireWorktree: true,
      reviewRequired: true,
      promotionMode: "github_pr",
      evalWindowDays: 14,
    };
  });

  afterEach(() => {
    vi.clearAllMocks();
    for (const dir of tempDirs.splice(0)) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("launches a branch-scoped improvement task and opens a PR for an accepted review", async () => {
    workspaces.set("workspace-1", {
      id: "workspace-1",
      name: "Workspace",
      path: "/tmp/workspace-1",
      createdAt: Date.now(),
      permissions: {
        read: true,
        write: true,
        delete: false,
        network: true,
        shell: true,
      },
    });

    const candidate: ImprovementCandidate = {
      id: "candidate-1",
      workspaceId: "workspace-1",
      fingerprint: "candidate-fingerprint",
      source: "verification_failure",
      status: "open",
      title: "Fix verifier-detected regressions",
      summary: "Verifier fails because completion artifacts are missing.",
      severity: 0.95,
      recurrenceCount: 2,
      fixabilityScore: 0.9,
      priorityScore: 0.92,
      evidence: [
        {
          type: "verification_failure",
          taskId: "task-old",
          summary: "Verifier still fails after task completion.",
          createdAt: Date.now(),
        },
      ],
      firstSeenAt: Date.now(),
      lastSeenAt: Date.now(),
    };
    candidates.set(candidate.id, candidate);

    const candidateService = {
      refresh: vi.fn().mockResolvedValue({ candidateCount: 1 }),
      listCandidates: vi.fn().mockReturnValue([candidate]),
      dismissCandidate: vi.fn(),
      markCandidateRunning: vi.fn(),
      markCandidateReview: vi.fn(),
      markCandidateResolved: vi.fn(),
      reopenCandidate: vi.fn(),
      getTopCandidateForWorkspace: vi.fn().mockReturnValue(candidate),
    } as Any;
    const notify = vi.fn();
    const loopService = new ImprovementLoopService({} as Any, candidateService, { notify });

    const daemon = new EventEmitter() as Any;
    const openPullRequest = vi
      .fn()
      .mockResolvedValue({ success: true, number: 42, url: "https://github.com/test/repo/pull/42" });
    daemon.createTask = vi.fn().mockImplementation(async (params: Any) => {
      const task: Task = {
        id: "task-improvement-1",
        title: params.title,
        prompt: params.prompt,
        status: "executing",
        workspaceId: params.workspaceId,
        agentConfig: params.agentConfig,
        source: params.source,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      tasks.set(task.id, task);
      return task;
    });
    daemon.getWorktreeManager = vi.fn(() => ({
      shouldUseWorktree: vi.fn().mockResolvedValue(true),
      mergeToBase: vi.fn(),
      openPullRequest,
    }));

    await loopService.start(daemon);
    const run = await loopService.runNextExperiment();

    expect(run?.status).toBe("running");
    expect(notify).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "info",
        title: "Improvement run started",
      }),
    );
    expect(daemon.createTask).toHaveBeenCalledWith(
      expect.objectContaining({
        source: "improvement",
        agentConfig: expect.objectContaining({
          autonomousMode: true,
          allowUserInput: false,
          requireWorktree: true,
          autoApproveTypes: ["run_command"],
          executionMode: "verified",
        }),
      }),
    );

    const createdTaskId = run?.taskId;
    expect(createdTaskId).toBeTruthy();
    tasks.set(createdTaskId!, {
      ...(tasks.get(createdTaskId!) as Task),
      worktreePath: "/tmp/worktree-1",
      worktreeBranch: "codex/fix-candidate-1",
    });
    daemon.emit("worktree_created", {
      taskId: createdTaskId,
      branch: "codex/fix-candidate-1",
    });
    tasks.set(createdTaskId!, {
      ...(tasks.get(createdTaskId!) as Task),
      status: "completed",
      completedAt: Date.now(),
      terminalStatus: "ok",
      resultSummary: "Added the missing artifact write and verified the regression is fixed.",
    });

    daemon.emit("task_completed", { taskId: createdTaskId });

    await vi.waitFor(() => {
      const updatedRun = runs.get(run!.id);
      expect(updatedRun?.status).toBe("passed");
      expect(updatedRun?.reviewStatus).toBe("pending");
    });
    expect(notify).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "task_completed",
        title: "Improvement ready for review",
      }),
    );

    const promoted = await loopService.reviewRun(run!.id, "accepted");
    expect(openPullRequest).toHaveBeenCalledWith(
      createdTaskId,
      expect.objectContaining({
        title: expect.stringContaining(candidate.title),
        body: expect.stringContaining(candidate.summary),
      }),
    );
    expect(promoted?.reviewStatus).toBe("accepted");
    expect(promoted?.promotionStatus).toBe("pr_opened");
    expect(promoted?.pullRequest?.success).toBe(true);
    expect(promoted?.pullRequest?.number).toBe(42);
    expect(notify).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "task_completed",
        title: "Improvement PR created",
      }),
    );

    expect(candidateService.markCandidateRunning).toHaveBeenCalledWith(candidate.id);
    expect(candidateService.markCandidateReview).toHaveBeenCalledWith(candidate.id);
    expect(candidateService.markCandidateResolved).toHaveBeenCalledWith(candidate.id);
  });

  it("merges accepted reviews when promotion mode is set to merge", async () => {
    mockSettings = {
      ...mockSettings,
      promotionMode: "merge",
    };
    workspaces.set("workspace-1", {
      id: "workspace-1",
      name: "Workspace",
      path: "/tmp/workspace-1",
      createdAt: Date.now(),
      permissions: {
        read: true,
        write: true,
        delete: false,
        network: true,
        shell: true,
      },
    });

    const candidate: ImprovementCandidate = {
      id: "candidate-1",
      workspaceId: "workspace-1",
      fingerprint: "candidate-fingerprint",
      source: "verification_failure",
      status: "open",
      title: "Fix verifier-detected regressions",
      summary: "Verifier fails because completion artifacts are missing.",
      severity: 0.95,
      recurrenceCount: 2,
      fixabilityScore: 0.9,
      priorityScore: 0.92,
      evidence: [
        {
          type: "verification_failure",
          taskId: "task-old",
          summary: "Verifier still fails after task completion.",
          createdAt: Date.now(),
        },
      ],
      firstSeenAt: Date.now(),
      lastSeenAt: Date.now(),
    };
    candidates.set(candidate.id, candidate);

    const candidateService = {
      refresh: vi.fn().mockResolvedValue({ candidateCount: 1 }),
      listCandidates: vi.fn().mockReturnValue([candidate]),
      dismissCandidate: vi.fn(),
      markCandidateRunning: vi.fn(),
      markCandidateReview: vi.fn(),
      markCandidateResolved: vi.fn(),
      reopenCandidate: vi.fn(),
      getTopCandidateForWorkspace: vi.fn().mockReturnValue(candidate),
    } as Any;
    const notify = vi.fn();
    const loopService = new ImprovementLoopService({} as Any, candidateService, { notify });

    const daemon = new EventEmitter() as Any;
    const mergeToBase = vi.fn().mockResolvedValue({ success: true, mergeSha: "abc123" });
    daemon.createTask = vi.fn().mockImplementation(async (params: Any) => {
      const task: Task = {
        id: "task-improvement-1",
        title: params.title,
        prompt: params.prompt,
        status: "executing",
        workspaceId: params.workspaceId,
        agentConfig: params.agentConfig,
        source: params.source,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      tasks.set(task.id, task);
      return task;
    });
    daemon.getWorktreeManager = vi.fn(() => ({
      shouldUseWorktree: vi.fn().mockResolvedValue(true),
      mergeToBase,
      openPullRequest: vi.fn(),
    }));

    await loopService.start(daemon);
    const run = await loopService.runNextExperiment();
    const createdTaskId = run?.taskId;
    tasks.set(createdTaskId!, {
      ...(tasks.get(createdTaskId!) as Task),
      status: "completed",
      completedAt: Date.now(),
      terminalStatus: "ok",
      worktreePath: "/tmp/worktree-merge",
    });

    daemon.emit("task_completed", { taskId: createdTaskId });

    await vi.waitFor(() => {
      expect(runs.get(run!.id)?.status).toBe("passed");
    });

    const promoted = await loopService.reviewRun(run!.id, "accepted");
    expect(mergeToBase).toHaveBeenCalledWith(createdTaskId);
    expect(promoted?.promotionStatus).toBe("merged");
    expect(promoted?.mergeResult?.success).toBe(true);
    expect(notify).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "task_completed",
        title: "Improvement merged",
      }),
    );
  });

  it("removes daemon listeners when stopped", async () => {
    const candidateService = {
      refresh: vi.fn().mockResolvedValue({ candidateCount: 0 }),
      dismissCandidate: vi.fn(),
      markCandidateRunning: vi.fn(),
      markCandidateReview: vi.fn(),
      markCandidateResolved: vi.fn(),
      reopenCandidate: vi.fn(),
      getTopCandidateForWorkspace: vi.fn(),
    } as Any;
    const loopService = new ImprovementLoopService({} as Any, candidateService);
    const daemon = new EventEmitter() as Any;

    await loopService.start(daemon);

    expect(daemon.listenerCount("worktree_created")).toBe(1);
    expect(daemon.listenerCount("task_completed")).toBe(1);
    expect(daemon.listenerCount("task_status")).toBe(1);

    loopService.stop();

    expect(daemon.listenerCount("worktree_created")).toBe(0);
    expect(daemon.listenerCount("task_completed")).toBe(0);
    expect(daemon.listenerCount("task_status")).toBe(0);
  });

  it("falls back to direct-apply execution when worktrees are unavailable", async () => {
    workspaces.set("workspace-1", {
      id: "workspace-1",
      name: "Workspace",
      path: "/tmp/non-git-workspace",
      createdAt: Date.now(),
      permissions: {
        read: true,
        write: true,
        delete: false,
        network: true,
        shell: true,
      },
    });

    const candidate: ImprovementCandidate = {
      id: "candidate-1",
      workspaceId: "workspace-1",
      fingerprint: "candidate-fingerprint",
      source: "verification_failure",
      status: "open",
      title: "Fix verifier-detected regressions",
      summary: "Verifier fails because completion artifacts are missing.",
      severity: 0.95,
      recurrenceCount: 2,
      fixabilityScore: 0.9,
      priorityScore: 0.92,
      evidence: [
        {
          type: "verification_failure",
          taskId: "task-old",
          summary: "Verifier still fails after task completion.",
          createdAt: Date.now(),
        },
      ],
      firstSeenAt: Date.now(),
      lastSeenAt: Date.now(),
    };
    candidates.set(candidate.id, candidate);

    const candidateService = {
      refresh: vi.fn().mockResolvedValue({ candidateCount: 1 }),
      dismissCandidate: vi.fn(),
      markCandidateRunning: vi.fn(),
      markCandidateReview: vi.fn(),
      markCandidateResolved: vi.fn(),
      reopenCandidate: vi.fn(),
      getTopCandidateForWorkspace: vi.fn().mockReturnValue(candidate),
    } as Any;
    const loopService = new ImprovementLoopService({} as Any, candidateService);

    const daemon = new EventEmitter() as Any;
    daemon.createTask = vi.fn().mockImplementation(async (params: Any) => {
      const task: Task = {
        id: "task-improvement-1",
        title: params.title,
        prompt: params.prompt,
        status: "executing",
        workspaceId: params.workspaceId,
        agentConfig: params.agentConfig,
        source: params.source,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      tasks.set(task.id, task);
      return task;
    });
    daemon.getWorktreeManager = vi.fn(() => ({
      shouldUseWorktree: vi.fn().mockResolvedValue(false),
      mergeToBase: vi.fn(),
      openPullRequest: vi.fn(),
    }));

    await loopService.start(daemon);
    const run = await loopService.runNextExperiment();
    expect(run?.status).toBe("running");
    expect(daemon.createTask).toHaveBeenCalledWith(
      expect.objectContaining({
        agentConfig: expect.objectContaining({
          requireWorktree: false,
        }),
      }),
    );
    expect(candidateService.markCandidateRunning).toHaveBeenCalledWith(candidate.id);
  });

  it("prefers promotable git-backed candidates over direct-apply candidates", async () => {
    workspaces.set("workspace-git", {
      id: "workspace-git",
      name: "Git Workspace",
      path: "/tmp/git-workspace",
      createdAt: Date.now(),
      permissions: {
        read: true,
        write: true,
        delete: false,
        network: true,
        shell: true,
      },
    });
    workspaces.set("workspace-temp", {
      id: "workspace-temp",
      name: "Temporary Workspace",
      path: "/tmp/temp-workspace",
      createdAt: Date.now(),
      isTemp: true,
      permissions: {
        read: true,
        write: true,
        delete: false,
        network: true,
        shell: true,
      },
    });

    const gitCandidate: ImprovementCandidate = {
      id: "candidate-git",
      workspaceId: "workspace-git",
      fingerprint: "candidate-git",
      source: "verification_failure",
      status: "open",
      title: "Fix verifier-detected regressions",
      summary: "Verifier fails because completion artifacts are missing.",
      severity: 0.95,
      recurrenceCount: 2,
      fixabilityScore: 0.9,
      priorityScore: 0.8,
      evidence: [{ type: "verification_failure", taskId: "task-git", summary: "Verifier failed.", createdAt: Date.now() }],
      firstSeenAt: Date.now(),
      lastSeenAt: Date.now(),
    };
    const tempCandidate: ImprovementCandidate = {
      id: "candidate-temp",
      workspaceId: "workspace-temp",
      fingerprint: "candidate-temp",
      source: "task_failure",
      status: "open",
      title: "Fix repeated contract error failures",
      summary: "Completion blocked: unresolved failed step(s): 4",
      severity: 0.95,
      recurrenceCount: 4,
      fixabilityScore: 0.9,
      priorityScore: 0.95,
      evidence: [{ type: "task_failure", taskId: "task-temp", summary: "Completion blocked.", createdAt: Date.now() }],
      firstSeenAt: Date.now(),
      lastSeenAt: Date.now(),
    };

    const candidateService = {
      refresh: vi.fn().mockResolvedValue({ candidateCount: 2 }),
      dismissCandidate: vi.fn(),
      markCandidateRunning: vi.fn(),
      markCandidateReview: vi.fn(),
      markCandidateResolved: vi.fn(),
      reopenCandidate: vi.fn(),
      getTopCandidateForWorkspace: vi.fn((workspaceId: string) =>
        workspaceId === "workspace-git" ? gitCandidate : workspaceId === "workspace-temp" ? tempCandidate : undefined,
      ),
    } as Any;
    const loopService = new ImprovementLoopService({} as Any, candidateService);

    const daemon = new EventEmitter() as Any;
    daemon.createTask = vi.fn().mockImplementation(async (params: Any) => {
      const task: Task = {
        id: `task-${params.workspaceId}`,
        title: params.title,
        prompt: params.prompt,
        status: "executing",
        workspaceId: params.workspaceId,
        agentConfig: params.agentConfig,
        source: params.source,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      tasks.set(task.id, task);
      return task;
    });
    daemon.getWorktreeManager = vi.fn(() => ({
      shouldUseWorktree: vi.fn().mockImplementation(async (workspacePath: string, isTemp?: boolean) =>
        workspacePath === "/tmp/git-workspace" && !isTemp,
      ),
      mergeToBase: vi.fn(),
      openPullRequest: vi.fn(),
    }));

    await loopService.start(daemon);
    await loopService.runNextExperiment();

    expect(daemon.createTask).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: "workspace-git",
        agentConfig: expect.objectContaining({
          requireWorktree: true,
        }),
      }),
    );
    expect(candidateService.markCandidateRunning).toHaveBeenCalledWith("candidate-git");
  });

  it("reconciles stale active runs before starting a new experiment", async () => {
    workspaces.set("workspace-1", {
      id: "workspace-1",
      name: "Workspace",
      path: "/tmp/workspace-1",
      createdAt: Date.now(),
      permissions: {
        read: true,
        write: true,
        delete: false,
        network: true,
        shell: true,
      },
    });

    const candidate: ImprovementCandidate = {
      id: "candidate-1",
      workspaceId: "workspace-1",
      fingerprint: "candidate-fingerprint",
      source: "task_failure",
      status: "open",
      title: "Fix repeated unknown failures",
      summary: "Task interrupted - application crashed before any progress was saved.",
      severity: 0.82,
      recurrenceCount: 2,
      fixabilityScore: 0.5,
      priorityScore: 0.72,
      evidence: [{ type: "task_failure", taskId: "task-old", summary: "Task interrupted.", createdAt: Date.now() }],
      firstSeenAt: Date.now(),
      lastSeenAt: Date.now(),
    };
    candidates.set(candidate.id, candidate);

    runs.set("run-stale", {
      id: "run-stale",
      candidateId: "candidate-1",
      workspaceId: "workspace-1",
      status: "running",
      reviewStatus: "pending",
      taskId: "task-stale",
      createdAt: Date.now() - 1000,
    });
    tasks.set("task-stale", {
      id: "task-stale",
      title: "Improve: Fix repeated unknown failures",
      prompt: "repair",
      status: "failed",
      workspaceId: "workspace-1",
      source: "improvement",
      createdAt: Date.now() - 1000,
      updatedAt: Date.now(),
      terminalStatus: "failed",
      completedAt: Date.now(),
      resultSummary: "Task requires git worktree isolation, but worktrees are unavailable for this workspace.",
    });

    const candidateService = {
      refresh: vi.fn().mockResolvedValue({ candidateCount: 1 }),
      dismissCandidate: vi.fn(),
      markCandidateRunning: vi.fn(),
      markCandidateReview: vi.fn(),
      markCandidateResolved: vi.fn(),
      reopenCandidate: vi.fn(),
      getTopCandidateForWorkspace: vi.fn().mockReturnValue(candidate),
    } as Any;
    const loopService = new ImprovementLoopService({} as Any, candidateService);

    const daemon = new EventEmitter() as Any;
    daemon.createTask = vi.fn().mockImplementation(async (params: Any) => {
      const task: Task = {
        id: "task-new",
        title: params.title,
        prompt: params.prompt,
        status: "executing",
        workspaceId: params.workspaceId,
        agentConfig: params.agentConfig,
        source: params.source,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      tasks.set(task.id, task);
      return task;
    });
    daemon.getWorktreeManager = vi.fn(() => ({
      shouldUseWorktree: vi.fn().mockResolvedValue(false),
      mergeToBase: vi.fn(),
      openPullRequest: vi.fn(),
    }));

    await loopService.start(daemon);
    const run = await loopService.runNextExperiment();

    expect(runs.get("run-stale")?.status).not.toBe("running");
    expect(runs.get("run-stale")?.status).not.toBe("queued");
    expect(run?.status).toBe("running");
    expect(daemon.createTask).toHaveBeenCalled();
  });

  it("auto-applies successful runs when the workspace cannot promote through a worktree", async () => {
    mockSettings.reviewRequired = false;
    workspaces.set("workspace-1", {
      id: "workspace-1",
      name: "Temporary Workspace",
      path: "/tmp/temp-workspace",
      createdAt: Date.now(),
      isTemp: true,
      permissions: {
        read: true,
        write: true,
        delete: false,
        network: true,
        shell: true,
      },
    });

    const candidate: ImprovementCandidate = {
      id: "candidate-1",
      workspaceId: "workspace-1",
      fingerprint: "candidate-fingerprint",
      source: "task_failure",
      status: "open",
      title: "Fix repeated contract error failures",
      summary: "Completion blocked: unresolved failed step(s): 4",
      severity: 0.9,
      recurrenceCount: 2,
      fixabilityScore: 0.85,
      priorityScore: 0.77,
      evidence: [
        {
          type: "task_failure",
          taskId: "task-old",
          summary: "Completion blocked: unresolved failed step(s): 4",
          createdAt: Date.now(),
        },
      ],
      firstSeenAt: Date.now(),
      lastSeenAt: Date.now(),
    };
    candidates.set(candidate.id, candidate);

    const candidateService = {
      refresh: vi.fn().mockResolvedValue({ candidateCount: 1 }),
      dismissCandidate: vi.fn(),
      markCandidateRunning: vi.fn(),
      markCandidateReview: vi.fn(),
      markCandidateResolved: vi.fn(),
      reopenCandidate: vi.fn(),
      getTopCandidateForWorkspace: vi.fn().mockReturnValue(candidate),
    } as Any;
    const notify = vi.fn();
    const loopService = new ImprovementLoopService({} as Any, candidateService, { notify });

    const daemon = new EventEmitter() as Any;
    daemon.createTask = vi.fn().mockImplementation(async (params: Any) => {
      const task: Task = {
        id: "task-improvement-1",
        title: params.title,
        prompt: params.prompt,
        status: "executing",
        workspaceId: params.workspaceId,
        agentConfig: params.agentConfig,
        source: params.source,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      tasks.set(task.id, task);
      return task;
    });
    daemon.getWorktreeManager = vi.fn(() => ({
      shouldUseWorktree: vi.fn().mockResolvedValue(false),
      mergeToBase: vi.fn(),
      openPullRequest: vi.fn(),
    }));

    await loopService.start(daemon);
    const run = await loopService.runNextExperiment();
    expect(run?.status).toBe("running");

    tasks.set(run!.taskId!, {
      ...(tasks.get(run!.taskId!) as Task),
      status: "completed",
      completedAt: Date.now(),
      terminalStatus: "ok",
      resultSummary: "Applied the requested fix directly in the temp workspace.",
    });

    daemon.emit("task_completed", { taskId: run!.taskId });

    await vi.waitFor(() => {
      const updatedRun = runs.get(run!.id);
      expect(updatedRun?.status).toBe("passed");
      expect(updatedRun?.reviewStatus).toBe("accepted");
      expect(updatedRun?.promotionStatus).toBe("applied");
    });
    expect(candidateService.markCandidateResolved).toHaveBeenCalledWith(candidate.id);
    expect(candidateService.markCandidateReview).not.toHaveBeenCalled();
    expect(notify).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "task_completed",
        title: "Improvement applied",
      }),
    );
  });

  it("keeps direct-apply runs in review when reviewRequired is enabled, then applies on accept", async () => {
    workspaces.set("workspace-1", {
      id: "workspace-1",
      name: "Temporary Workspace",
      path: "/tmp/temp-workspace",
      createdAt: Date.now(),
      isTemp: true,
      permissions: {
        read: true,
        write: true,
        delete: false,
        network: true,
        shell: true,
      },
    });

    const candidate: ImprovementCandidate = {
      id: "candidate-1",
      workspaceId: "workspace-1",
      fingerprint: "candidate-fingerprint",
      source: "task_failure",
      status: "open",
      title: "Fix repeated contract error failures",
      summary: "Completion blocked: unresolved failed step(s): 4",
      severity: 0.9,
      recurrenceCount: 2,
      fixabilityScore: 0.85,
      priorityScore: 0.77,
      evidence: [
        {
          type: "task_failure",
          taskId: "task-old",
          summary: "Completion blocked: unresolved failed step(s): 4",
          createdAt: Date.now(),
        },
      ],
      firstSeenAt: Date.now(),
      lastSeenAt: Date.now(),
    };
    candidates.set(candidate.id, candidate);

    const candidateService = {
      refresh: vi.fn().mockResolvedValue({ candidateCount: 1 }),
      dismissCandidate: vi.fn(),
      markCandidateRunning: vi.fn(),
      markCandidateReview: vi.fn(),
      markCandidateResolved: vi.fn(),
      reopenCandidate: vi.fn(),
      getTopCandidateForWorkspace: vi.fn().mockReturnValue(candidate),
    } as Any;
    const notify = vi.fn();
    const loopService = new ImprovementLoopService({} as Any, candidateService, { notify });

    const daemon = new EventEmitter() as Any;
    daemon.createTask = vi.fn().mockImplementation(async (params: Any) => {
      const task: Task = {
        id: "task-improvement-review",
        title: params.title,
        prompt: params.prompt,
        status: "executing",
        workspaceId: params.workspaceId,
        agentConfig: params.agentConfig,
        source: params.source,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      tasks.set(task.id, task);
      return task;
    });
    daemon.getWorktreeManager = vi.fn(() => ({
      shouldUseWorktree: vi.fn().mockResolvedValue(false),
      mergeToBase: vi.fn(),
      openPullRequest: vi.fn(),
    }));

    await loopService.start(daemon);
    const run = await loopService.runNextExperiment();
    tasks.set(run!.taskId!, {
      ...(tasks.get(run!.taskId!) as Task),
      status: "completed",
      completedAt: Date.now(),
      terminalStatus: "ok",
      resultSummary: "Applied the requested fix directly in the temp workspace.",
    });

    daemon.emit("task_completed", { taskId: run!.taskId });

    await vi.waitFor(() => {
      const updatedRun = runs.get(run!.id);
      expect(updatedRun?.status).toBe("passed");
      expect(updatedRun?.reviewStatus).toBe("pending");
      expect(updatedRun?.promotionStatus).toBeUndefined();
    });

    await loopService.reviewRun(run!.id, "accepted");

    expect(runs.get(run!.id)?.promotionStatus).toBe("applied");
    expect(runs.get(run!.id)?.reviewStatus).toBe("accepted");
    expect(candidateService.markCandidateReview).toHaveBeenCalledWith(candidate.id);
    expect(candidateService.markCandidateResolved).toHaveBeenCalledWith(candidate.id);
    expect(notify).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Improvement applied",
      }),
    );
  });

  it("runs product investigations in the cowork code workspace and includes relevant logs", async () => {
    const researchDir = fs.mkdtempSync(path.join(os.tmpdir(), "cowork-research-"));
    const codeDir = fs.mkdtempSync(path.join(os.tmpdir(), "cowork-code-"));
    tempDirs.push(researchDir, codeDir);

    fs.mkdirSync(path.join(codeDir, "src", "electron"), { recursive: true });
    fs.mkdirSync(path.join(codeDir, "src", "renderer"), { recursive: true });
    fs.mkdirSync(path.join(codeDir, "logs"), { recursive: true });
    fs.writeFileSync(path.join(codeDir, "package.json"), JSON.stringify({ name: "cowork-os" }));
    fs.writeFileSync(path.join(codeDir, "logs", "dev-latest.log"), "log");

    workspaces.set("workspace-research", {
      id: "workspace-research",
      name: "new",
      path: researchDir,
      createdAt: Date.now(),
      permissions: {
        read: true,
        write: true,
        delete: false,
        network: true,
        shell: true,
      },
    });
    workspaces.set("workspace-code", {
      id: "workspace-code",
      name: "cowork",
      path: codeDir,
      createdAt: Date.now(),
      permissions: {
        read: true,
        write: true,
        delete: false,
        network: true,
        shell: true,
      },
    });

    const candidate: ImprovementCandidate = {
      id: "candidate-1",
      workspaceId: "workspace-research",
      fingerprint: "candidate-fingerprint",
      source: "task_failure",
      status: "open",
      title: "Fix repeated Cowork renderer failures",
      summary: "Cowork task failed in src/renderer with unresolved failed step(s): 1, 4",
      severity: 0.9,
      recurrenceCount: 3,
      fixabilityScore: 0.8,
      priorityScore: 0.88,
      evidence: [
        {
          type: "task_failure",
          taskId: "task-old",
          summary: "Failure observed in a research workspace while testing the Cowork Electron app.",
          createdAt: Date.now(),
        },
      ],
      firstSeenAt: Date.now(),
      lastSeenAt: Date.now(),
    };

    const candidateService = {
      refresh: vi.fn().mockResolvedValue({ candidateCount: 1 }),
      dismissCandidate: vi.fn(),
      markCandidateRunning: vi.fn(),
      markCandidateReview: vi.fn(),
      markCandidateResolved: vi.fn(),
      reopenCandidate: vi.fn(),
      getTopCandidateForWorkspace: vi.fn((workspaceId: string) =>
        workspaceId === "workspace-research" ? candidate : undefined,
      ),
    } as Any;
    const loopService = new ImprovementLoopService({} as Any, candidateService);

    const daemon = new EventEmitter() as Any;
    daemon.createTask = vi.fn().mockImplementation(async (params: Any) => {
      const task: Task = {
        id: "task-improvement-1",
        title: params.title,
        prompt: params.prompt,
        status: "executing",
        workspaceId: params.workspaceId,
        agentConfig: params.agentConfig,
        source: params.source,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      tasks.set(task.id, task);
      return task;
    });
    daemon.getWorktreeManager = vi.fn(() => ({
      shouldUseWorktree: vi.fn().mockImplementation(async (workspacePath: string) => workspacePath === codeDir),
      mergeToBase: vi.fn(),
      openPullRequest: vi.fn(),
    }));

    await loopService.start(daemon);
    await loopService.runNextExperiment();

    expect(daemon.createTask).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: "workspace-code",
        prompt: expect.stringContaining("Run this investigation in workspace: cowork"),
      }),
    );
    expect(daemon.createTask).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: expect.stringContaining(path.join(codeDir, "logs", "dev-latest.log")),
      }),
    );
    const listedRuns = await loopService.listRunsFresh("workspace-research");
    expect(listedRuns[0]?.executionWorkspaceId).toBe("workspace-code");
  });

  it("keeps unrelated improvement candidates in their original workspace", async () => {
    const productDir = fs.mkdtempSync(path.join(os.tmpdir(), "product-workspace-"));
    const codeDir = fs.mkdtempSync(path.join(os.tmpdir(), "cowork-code-"));
    tempDirs.push(productDir, codeDir);

    fs.mkdirSync(path.join(codeDir, "src", "electron"), { recursive: true });
    fs.mkdirSync(path.join(codeDir, "src", "renderer"), { recursive: true });
    fs.writeFileSync(path.join(codeDir, "package.json"), JSON.stringify({ name: "cowork-os" }));

    workspaces.set("workspace-product", {
      id: "workspace-product",
      name: "customer-site",
      path: productDir,
      createdAt: Date.now(),
      permissions: {
        read: true,
        write: true,
        delete: false,
        network: true,
        shell: true,
      },
    });
    workspaces.set("workspace-code", {
      id: "workspace-code",
      name: "cowork",
      path: codeDir,
      createdAt: Date.now(),
      permissions: {
        read: true,
        write: true,
        delete: false,
        network: true,
        shell: true,
      },
    });

    const candidate: ImprovementCandidate = {
      id: "candidate-product",
      workspaceId: "workspace-product",
      fingerprint: "candidate-product",
      source: "task_failure",
      status: "open",
      title: "Fix recurring checkout validation failures",
      summary: "Customer storefront checkout is failing validation on draft orders.",
      severity: 0.85,
      recurrenceCount: 2,
      fixabilityScore: 0.8,
      priorityScore: 0.86,
      evidence: [
        {
          type: "task_failure",
          taskId: "task-product",
          summary: "Failure observed in the customer storefront workspace.",
          createdAt: Date.now(),
        },
      ],
      firstSeenAt: Date.now(),
      lastSeenAt: Date.now(),
    };

    const candidateService = {
      refresh: vi.fn().mockResolvedValue({ candidateCount: 1 }),
      dismissCandidate: vi.fn(),
      markCandidateRunning: vi.fn(),
      markCandidateReview: vi.fn(),
      markCandidateResolved: vi.fn(),
      reopenCandidate: vi.fn(),
      getTopCandidateForWorkspace: vi.fn((workspaceId: string) =>
        workspaceId === "workspace-product" ? candidate : undefined,
      ),
    } as Any;
    const loopService = new ImprovementLoopService({} as Any, candidateService);

    const daemon = new EventEmitter() as Any;
    daemon.createTask = vi.fn().mockImplementation(async (params: Any) => {
      const task: Task = {
        id: "task-product-fix",
        title: params.title,
        prompt: params.prompt,
        status: "executing",
        workspaceId: params.workspaceId,
        agentConfig: params.agentConfig,
        source: params.source,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      tasks.set(task.id, task);
      return task;
    });
    daemon.getWorktreeManager = vi.fn(() => ({
      shouldUseWorktree: vi.fn().mockResolvedValue(false),
      mergeToBase: vi.fn(),
      openPullRequest: vi.fn(),
    }));

    await loopService.start(daemon);
    await loopService.runNextExperiment();

    expect(daemon.createTask).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: "workspace-product",
      }),
    );
  });

  it("retries failed runs for the same candidate", async () => {
    workspaces.set("workspace-1", {
      id: "workspace-1",
      name: "Workspace",
      path: "/tmp/workspace-1",
      createdAt: Date.now(),
      permissions: {
        read: true,
        write: true,
        delete: false,
        network: true,
        shell: true,
      },
    });

    const candidate: ImprovementCandidate = {
      id: "candidate-1",
      workspaceId: "workspace-1",
      fingerprint: "candidate-fingerprint",
      source: "task_failure",
      status: "open",
      title: "Fix repeated unknown failures",
      summary: "Task failed repeatedly.",
      severity: 0.8,
      recurrenceCount: 2,
      fixabilityScore: 0.7,
      priorityScore: 0.8,
      evidence: [{ type: "task_failure", taskId: "task-old", summary: "Failure observed.", createdAt: Date.now() }],
      firstSeenAt: Date.now(),
      lastSeenAt: Date.now(),
    };
    candidates.set(candidate.id, candidate);
    runs.set("run-failed", {
      id: "run-failed",
      candidateId: "candidate-1",
      workspaceId: "workspace-1",
      status: "failed",
      reviewStatus: "pending",
      taskId: "task-failed",
      createdAt: Date.now() - 1000,
      completedAt: Date.now() - 500,
    });
    tasks.set("task-failed", {
      id: "task-failed",
      title: "Improve: Fix repeated unknown failures",
      prompt: "repair",
      status: "failed",
      workspaceId: "workspace-1",
      source: "improvement",
      createdAt: Date.now() - 1000,
      updatedAt: Date.now() - 500,
      terminalStatus: "failed",
      completedAt: Date.now() - 500,
    });

    const candidateService = {
      refresh: vi.fn().mockResolvedValue({ candidateCount: 1 }),
      dismissCandidate: vi.fn(),
      markCandidateRunning: vi.fn(),
      markCandidateReview: vi.fn(),
      markCandidateResolved: vi.fn(),
      reopenCandidate: vi.fn(),
      getTopCandidateForWorkspace: vi.fn().mockReturnValue(candidate),
    } as Any;
    const loopService = new ImprovementLoopService({} as Any, candidateService);

    const daemon = new EventEmitter() as Any;
    daemon.createTask = vi.fn().mockImplementation(async (params: Any) => {
      const task: Task = {
        id: `task-${Date.now()}`,
        title: params.title,
        prompt: params.prompt,
        status: "executing",
        workspaceId: params.workspaceId,
        agentConfig: params.agentConfig,
        source: params.source,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      tasks.set(task.id, task);
      return task;
    });
    daemon.getWorktreeManager = vi.fn(() => ({
      shouldUseWorktree: vi.fn().mockResolvedValue(false),
      mergeToBase: vi.fn(),
      openPullRequest: vi.fn(),
    }));

    await loopService.start(daemon);
    const retried = await loopService.retryRun("run-failed");

    expect(retried?.status).toBe("running");
    expect(daemon.createTask).toHaveBeenCalled();
  });

  it("does not retry runs whose candidate is no longer open", async () => {
    workspaces.set("workspace-1", {
      id: "workspace-1",
      name: "Workspace",
      path: "/tmp/workspace-1",
      createdAt: Date.now(),
      permissions: {
        read: true,
        write: true,
        delete: false,
        network: true,
        shell: true,
      },
    });

    candidates.set("candidate-closed", {
      id: "candidate-closed",
      workspaceId: "workspace-1",
      fingerprint: "candidate-closed",
      source: "task_failure",
      status: "resolved",
      title: "Already fixed",
      summary: "Resolved previously.",
      severity: 0.5,
      recurrenceCount: 1,
      fixabilityScore: 0.6,
      priorityScore: 0.4,
      evidence: [],
      firstSeenAt: Date.now(),
      lastSeenAt: Date.now(),
    });
    runs.set("run-failed", {
      id: "run-failed",
      candidateId: "candidate-closed",
      workspaceId: "workspace-1",
      status: "failed",
      reviewStatus: "pending",
      taskId: "task-failed",
      createdAt: Date.now() - 1000,
      completedAt: Date.now() - 500,
    });

    const candidateService = {
      refresh: vi.fn().mockResolvedValue({ candidateCount: 1 }),
      dismissCandidate: vi.fn(),
      markCandidateRunning: vi.fn(),
      markCandidateReview: vi.fn(),
      markCandidateResolved: vi.fn(),
      reopenCandidate: vi.fn(),
      getTopCandidateForWorkspace: vi.fn(),
    } as Any;
    const loopService = new ImprovementLoopService({} as Any, candidateService);

    const daemon = new EventEmitter() as Any;
    daemon.createTask = vi.fn();
    daemon.getWorktreeManager = vi.fn(() => ({
      shouldUseWorktree: vi.fn().mockResolvedValue(false),
      mergeToBase: vi.fn(),
      openPullRequest: vi.fn(),
    }));

    await loopService.start(daemon);
    await expect(loopService.retryRun("run-failed")).rejects.toThrow(
      "Retry could not start because the candidate is now resolved.",
    );
    expect(daemon.createTask).not.toHaveBeenCalled();
  });

  it("finalizes a completed run only once when both task events fire", async () => {
    workspaces.set("workspace-1", {
      id: "workspace-1",
      name: "Workspace",
      path: "/tmp/workspace-1",
      createdAt: Date.now(),
      permissions: {
        read: true,
        write: true,
        delete: false,
        network: true,
        shell: true,
      },
    });

    const candidate: ImprovementCandidate = {
      id: "candidate-1",
      workspaceId: "workspace-1",
      fingerprint: "candidate-fingerprint",
      source: "task_failure",
      status: "open",
      title: "Fix repeated unknown failures",
      summary: "Task failed repeatedly.",
      severity: 0.8,
      recurrenceCount: 2,
      fixabilityScore: 0.7,
      priorityScore: 0.8,
      evidence: [{ type: "task_failure", taskId: "task-old", summary: "Failure observed.", createdAt: Date.now() }],
      firstSeenAt: Date.now(),
      lastSeenAt: Date.now(),
    };
    candidates.set(candidate.id, candidate);

    const candidateService = {
      refresh: vi.fn().mockResolvedValue({ candidateCount: 1 }),
      dismissCandidate: vi.fn(),
      markCandidateRunning: vi.fn(),
      markCandidateReview: vi.fn(),
      markCandidateResolved: vi.fn(),
      reopenCandidate: vi.fn(),
      getTopCandidateForWorkspace: vi.fn().mockReturnValue(candidate),
    } as Any;
    const notify = vi.fn();
    const loopService = new ImprovementLoopService({} as Any, candidateService, { notify });

    const daemon = new EventEmitter() as Any;
    daemon.createTask = vi.fn().mockImplementation(async (params: Any) => {
      const task: Task = {
        id: "task-finalize-once",
        title: params.title,
        prompt: params.prompt,
        status: "executing",
        workspaceId: params.workspaceId,
        agentConfig: params.agentConfig,
        source: params.source,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      tasks.set(task.id, task);
      return task;
    });
    daemon.getWorktreeManager = vi.fn(() => ({
      shouldUseWorktree: vi.fn().mockResolvedValue(true),
      mergeToBase: vi.fn(),
      openPullRequest: vi.fn(),
    }));

    await loopService.start(daemon);
    const run = await loopService.runNextExperiment();
    tasks.set(run!.taskId!, {
      ...(tasks.get(run!.taskId!) as Task),
      status: "completed",
      completedAt: Date.now(),
      terminalStatus: "ok",
      worktreePath: "/tmp/worktree-1",
      resultSummary: "Verified fix.",
    });

    daemon.emit("task_completed", { taskId: run!.taskId });
    daemon.emit("task_status", { taskId: run!.taskId });

    await vi.waitFor(() => {
      expect(candidateService.markCandidateReview).toHaveBeenCalledTimes(1);
      expect(
        notify.mock.calls.filter(
          ([payload]: Any[]) => payload?.title === "Improvement ready for review",
        ),
      ).toHaveLength(1);
    });
  });
});
