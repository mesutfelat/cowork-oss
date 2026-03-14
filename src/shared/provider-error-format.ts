import type { Task } from "./types";

/**
 * Returns true for tasks created automatically (cron, improvement, heartbeat, etc.)
 * Used to tailor error messages — automated tasks get shorter copy.
 */
function isAutomatedTask(task: Task | null | undefined): boolean {
  if (!task) return false;
  if (task.source === "manual") return false;
  if (task.source === "cron" || task.source === "improvement") return true;
  if (task.source === "hook") return false;
  if (/^heartbeat:/i.test(String(task.title || "").trim())) return true;
  if (task.source === "api") {
    return Boolean(
      task.companyId || task.goalId || task.projectId || task.issueId || task.heartbeatRunId,
    );
  }
  return !!task.heartbeatRunId;
}

/**
 * Format LLM provider errors for user display.
 * Rate limit errors get actionable guidance for manual tasks; shorter copy for automated/scheduled.
 */
export function formatProviderErrorForDisplay(
  errorMessage: string,
  options?: { task?: Task | null },
): string {
  const msg = String(errorMessage || "").trim();
  if (!msg) return "Provider error";
  if (/429|rate limit|too many requests|free-models-per-min/i.test(msg)) {
    const automated = isAutomatedTask(options?.task);
    if (automated) {
      return "Rate limit exceeded. Will retry automatically.";
    }
    const hint = /free-models-per-min|free.*model/i.test(msg)
      ? " Free tier has strict limits — add an OpenRouter API key in Settings for higher limits, or wait a minute and try again."
      : " Wait a minute and try again, or add an API key in Settings for higher limits.";
    return `Rate limit exceeded.${hint}`;
  }
  return msg;
}
