import { useState, useEffect } from "react";
import { StandupReport } from "../../electron/preload";
import { useAgentContext } from "../hooks/useAgentContext";

interface Task {
  id: string;
  title: string;
  status?: string;
}

interface StandupReportViewerProps {
  workspaceId: string;
  onClose?: () => void;
}

export function StandupReportViewer({ workspaceId, onClose }: StandupReportViewerProps) {
  const [reports, setReports] = useState<StandupReport[]>([]);
  const [selectedReport, setSelectedReport] = useState<StandupReport | null>(null);
  const [taskMap, setTaskMap] = useState<Map<string, Task>>(new Map());
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const agentContext = useAgentContext();

  useEffect(() => {
    loadReports();
  }, [workspaceId]);

  const loadReports = async () => {
    try {
      setLoading(true);
      const loadedReports = await window.electronAPI.listStandupReports(workspaceId, 30);
      setReports(loadedReports);

      // Select the latest report if available
      if (loadedReports.length > 0) {
        setSelectedReport(loadedReports[0]);
        await loadTaskDetails(loadedReports[0]);
      }
    } catch (err) {
      console.error("Failed to load standup reports:", err);
    } finally {
      setLoading(false);
    }
  };

  const loadTaskDetails = async (report: StandupReport) => {
    try {
      // Load task details for all task IDs in the report
      const allTaskIds = [
        ...report.completedTaskIds,
        ...report.inProgressTaskIds,
        ...report.blockedTaskIds,
      ];

      const tasks = await window.electronAPI.listTasks();
      const newTaskMap = new Map<string, Task>();

      for (const task of tasks) {
        if (allTaskIds.includes(task.id)) {
          newTaskMap.set(task.id, {
            id: task.id,
            title: task.title,
            status: task.status,
          });
        }
      }

      setTaskMap(newTaskMap);
    } catch (err) {
      console.error("Failed to load task details:", err);
    }
  };

  const handleSelectReport = async (report: StandupReport) => {
    setSelectedReport(report);
    await loadTaskDetails(report);
  };

  const handleGenerateReport = async () => {
    try {
      setGenerating(true);
      const newReport = await window.electronAPI.generateStandupReport(workspaceId);
      setReports((prev) => [newReport, ...prev.filter((r) => r.id !== newReport.id)]);
      setSelectedReport(newReport);
      await loadTaskDetails(newReport);
    } catch (err) {
      console.error("Failed to generate standup report:", err);
    } finally {
      setGenerating(false);
    }
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    if (dateStr === today.toISOString().split("T")[0]) {
      return "Today";
    } else if (dateStr === yesterday.toISOString().split("T")[0]) {
      return "Yesterday";
    }

    return date.toLocaleDateString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
    });
  };

  const formatCreatedAt = (timestamp: number) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  };

  if (loading) {
    return (
      <div className="standup-viewer">
        <div className="loading-state">{agentContext.getUiCopy("standupLoading")}</div>
        <style>{styles}</style>
      </div>
    );
  }

  return (
    <div className="standup-viewer">
      <div className="viewer-header">
        <div className="header-content">
          <h2>{agentContext.getUiCopy("standupTitle")}</h2>
          <button className="btn-generate" onClick={handleGenerateReport} disabled={generating}>
            {generating
              ? agentContext.getUiCopy("standupGenerating")
              : agentContext.getUiCopy("standupGenerate")}
          </button>
        </div>
        {onClose && (
          <button className="btn-close" onClick={onClose}>
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>

      <div className="viewer-content">
        <div className="report-sidebar">
          <h3>{agentContext.getUiCopy("standupHistoryTitle")}</h3>
          <div className="report-list">
            {reports.length === 0 ? (
              <div className="empty-state">{agentContext.getUiCopy("standupEmpty")}</div>
            ) : (
              reports.map((report) => (
                <button
                  key={report.id}
                  className={`report-item ${selectedReport?.id === report.id ? "selected" : ""}`}
                  onClick={() => handleSelectReport(report)}
                >
                  <span className="report-date">{formatDate(report.reportDate)}</span>
                  <span className="report-summary-mini">
                    {report.completedTaskIds.length} completed, {report.inProgressTaskIds.length} in
                    progress
                  </span>
                </button>
              ))
            )}
          </div>
        </div>

        <div className="report-main">
          {selectedReport ? (
            <>
              <div className="report-header">
                <h3>{formatDate(selectedReport.reportDate)}</h3>
                <span className="report-time">
                  {agentContext.getUiCopy("standupGeneratedAt", {
                    time: formatCreatedAt(selectedReport.createdAt),
                  })}
                </span>
              </div>

              <div className="report-sections">
                {/* Completed Section */}
                <div className="report-section completed">
                  <div className="section-header">
                    <span className="section-icon">✅</span>
                    <h4>{agentContext.getUiCopy("standupCompletedTitle")}</h4>
                    <span className="section-count">{selectedReport.completedTaskIds.length}</span>
                  </div>
                  {selectedReport.completedTaskIds.length === 0 ? (
                    <div className="section-empty">
                      {agentContext.getUiCopy("standupCompletedEmpty")}
                    </div>
                  ) : (
                    <ul className="task-list">
                      {selectedReport.completedTaskIds.map((taskId) => {
                        const task = taskMap.get(taskId);
                        return (
                          <li key={taskId} className="task-item">
                            {task?.title || taskId}
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>

                {/* In Progress Section */}
                <div className="report-section in-progress">
                  <div className="section-header">
                    <span className="section-icon">🔄</span>
                    <h4>{agentContext.getUiCopy("standupInProgressTitle")}</h4>
                    <span className="section-count">{selectedReport.inProgressTaskIds.length}</span>
                  </div>
                  {selectedReport.inProgressTaskIds.length === 0 ? (
                    <div className="section-empty">
                      {agentContext.getUiCopy("standupInProgressEmpty")}
                    </div>
                  ) : (
                    <ul className="task-list">
                      {selectedReport.inProgressTaskIds.map((taskId) => {
                        const task = taskMap.get(taskId);
                        return (
                          <li key={taskId} className="task-item">
                            {task?.title || taskId}
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>

                {/* Blocked Section */}
                <div className="report-section blocked">
                  <div className="section-header">
                    <span className="section-icon">🚫</span>
                    <h4>{agentContext.getUiCopy("standupBlockedTitle")}</h4>
                    <span className="section-count">{selectedReport.blockedTaskIds.length}</span>
                  </div>
                  {selectedReport.blockedTaskIds.length === 0 ? (
                    <div className="section-empty">
                      {agentContext.getUiCopy("standupBlockedEmpty")}
                    </div>
                  ) : (
                    <ul className="task-list">
                      {selectedReport.blockedTaskIds.map((taskId) => {
                        const task = taskMap.get(taskId);
                        return (
                          <li key={taskId} className="task-item blocked">
                            {task?.title || taskId}
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
              </div>

              {/* Summary */}
              <div className="report-summary">
                <h4>Summary</h4>
                <p>{selectedReport.summary}</p>
              </div>

              {selectedReport.deliveredToChannel && (
                <div className="delivery-info">
                  <span className="delivery-icon">📤</span>
                  Delivered to {selectedReport.deliveredToChannel}
                </div>
              )}
            </>
          ) : (
            <div className="no-report">
              <div className="no-report-icon">📋</div>
              <h3>No Report Selected</h3>
              <p>Select a report from the sidebar or generate a new one.</p>
            </div>
          )}
        </div>
      </div>

      <style>{styles}</style>
    </div>
  );
}

const styles = `
  .standup-viewer {
    display: flex;
    flex-direction: column;
    height: 100%;
    background: var(--color-bg-primary);
  }

  .viewer-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 16px 20px;
    border-bottom: 1px solid var(--color-border);
    background: var(--color-bg-secondary);
  }

  .header-content {
    display: flex;
    align-items: center;
    gap: 16px;
  }

  .header-content h2 {
    margin: 0;
    font-size: 18px;
    font-weight: 600;
    color: var(--color-text-primary);
  }

  .btn-generate {
    padding: 8px 16px;
    background: var(--color-accent);
    color: white;
    border: none;
    border-radius: 6px;
    font-size: 13px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .btn-generate:hover:not(:disabled) {
    opacity: 0.9;
  }

  .btn-generate:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .btn-close {
    background: transparent;
    border: none;
    color: var(--color-text-secondary);
    cursor: pointer;
    padding: 8px;
    border-radius: 6px;
  }

  .btn-close:hover {
    background: var(--color-bg-tertiary);
    color: var(--color-text-primary);
  }

  .viewer-content {
    display: flex;
    flex: 1;
    overflow: hidden;
  }

  .report-sidebar {
    width: 240px;
    border-right: 1px solid var(--color-border);
    background: var(--color-bg-secondary);
    display: flex;
    flex-direction: column;
  }

  .report-sidebar h3 {
    font-size: 12px;
    font-weight: 600;
    color: var(--color-text-secondary);
    text-transform: uppercase;
    letter-spacing: 0.5px;
    padding: 12px 16px;
    margin: 0;
    border-bottom: 1px solid var(--color-border);
  }

  .report-list {
    flex: 1;
    overflow-y: auto;
    padding: 8px;
  }

  .report-item {
    display: flex;
    flex-direction: column;
    gap: 4px;
    width: 100%;
    padding: 10px 12px;
    background: transparent;
    border: none;
    border-radius: 6px;
    text-align: left;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .report-item:hover {
    background: var(--color-bg-tertiary);
  }

  .report-item.selected {
    background: var(--color-accent);
  }

  .report-item.selected .report-date,
  .report-item.selected .report-summary-mini {
    color: white;
  }

  .report-date {
    font-size: 13px;
    font-weight: 600;
    color: var(--color-text-primary);
  }

  .report-summary-mini {
    font-size: 11px;
    color: var(--color-text-secondary);
  }

  .report-main {
    flex: 1;
    overflow-y: auto;
    padding: 20px;
  }

  .report-header {
    margin-bottom: 20px;
  }

  .report-header h3 {
    font-size: 20px;
    font-weight: 600;
    color: var(--color-text-primary);
    margin: 0;
  }

  .report-time {
    font-size: 12px;
    color: var(--color-text-secondary);
    margin-top: 4px;
    display: block;
  }

  .report-sections {
    display: flex;
    flex-direction: column;
    gap: 16px;
    margin-bottom: 20px;
  }

  .report-section {
    background: var(--color-bg-secondary);
    border: 1px solid var(--color-border);
    border-radius: 10px;
    padding: 14px;
  }

  .section-header {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-bottom: 12px;
  }

  .section-icon {
    font-size: 16px;
  }

  .section-header h4 {
    flex: 1;
    margin: 0;
    font-size: 14px;
    font-weight: 600;
    color: var(--color-text-primary);
  }

  .section-count {
    font-size: 12px;
    font-weight: 600;
    padding: 2px 8px;
    border-radius: 10px;
    background: var(--color-bg-tertiary);
    color: var(--color-text-secondary);
  }

  .report-section.completed .section-count {
    background: #dcfce7;
    color: #166534;
  }

  .report-section.in-progress .section-count {
    background: #dbeafe;
    color: #1e40af;
  }

  .report-section.blocked .section-count {
    background: #fee2e2;
    color: #991b1b;
  }

  .section-empty {
    font-size: 12px;
    color: var(--color-text-muted);
    font-style: italic;
  }

  .task-list {
    list-style: none;
    margin: 0;
    padding: 0;
  }

  .task-item {
    font-size: 13px;
    color: var(--color-text-primary);
    padding: 6px 0;
    border-bottom: 1px solid var(--color-border);
  }

  .task-item:last-child {
    border-bottom: none;
  }

  .task-item::before {
    content: "•";
    color: var(--color-text-muted);
    margin-right: 8px;
  }

  .task-item.blocked::before {
    content: "⚠";
    color: #ef4444;
  }

  .report-summary {
    background: var(--color-bg-secondary);
    border: 1px solid var(--color-border);
    border-radius: 10px;
    padding: 14px;
  }

  .report-summary h4 {
    margin: 0 0 8px 0;
    font-size: 14px;
    font-weight: 600;
    color: var(--color-text-primary);
  }

  .report-summary p {
    margin: 0;
    font-size: 13px;
    color: var(--color-text-secondary);
    line-height: 1.5;
  }

  .delivery-info {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-top: 12px;
    padding: 10px 14px;
    background: var(--color-bg-tertiary);
    border-radius: 8px;
    font-size: 12px;
    color: var(--color-text-secondary);
  }

  .delivery-icon {
    font-size: 14px;
  }

  .no-report {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 100%;
    text-align: center;
    color: var(--color-text-secondary);
  }

  .no-report-icon {
    font-size: 48px;
    margin-bottom: 16px;
    opacity: 0.5;
  }

  .no-report h3 {
    margin: 0;
    font-size: 18px;
    font-weight: 600;
    color: var(--color-text-primary);
  }

  .no-report p {
    margin: 8px 0 0 0;
    font-size: 14px;
  }

  .empty-state {
    padding: 16px;
    text-align: center;
    font-size: 12px;
    color: var(--color-text-muted);
  }

  .loading-state {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 200px;
    color: var(--color-text-secondary);
    font-size: 14px;
  }
`;
