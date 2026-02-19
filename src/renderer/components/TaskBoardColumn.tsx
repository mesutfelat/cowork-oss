import { useState } from "react";
import {
  TaskBoardColumn as ColumnType,
  TaskLabelData,
  AgentRoleData,
} from "../../electron/preload";
import { TaskBoardCard } from "./TaskBoardCard";
import { useAgentContext } from "../hooks/useAgentContext";

interface Task {
  id: string;
  title: string;
  status: string;
  boardColumn?: string;
  priority?: number;
  labels?: string[];
  dueDate?: number;
  estimatedMinutes?: number;
  assignedAgentRoleId?: string;
  createdAt: number;
}

interface TaskBoardColumnProps {
  column: ColumnType;
  title: string;
  tasks: Task[];
  labels: TaskLabelData[];
  agents: Record<string, AgentRoleData>;
  onTaskMove: (taskId: string, column: ColumnType) => void;
  onTaskPriorityChange: (taskId: string, priority: number) => void;
  onTaskSelect: (task: Task) => void;
  color: string;
}

const COLUMN_LIMITS: Record<ColumnType, number | null> = {
  backlog: null,
  todo: 10,
  in_progress: 5,
  review: 3,
  done: null,
};

export function TaskBoardColumn({
  column,
  title,
  tasks,
  labels,
  agents,
  onTaskMove,
  onTaskPriorityChange,
  onTaskSelect,
  color,
}: TaskBoardColumnProps) {
  const [isDragOver, setIsDragOver] = useState(false);
  const agentContext = useAgentContext();

  const limit = COLUMN_LIMITS[column];
  const isOverLimit = limit !== null && tasks.length > limit;

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setIsDragOver(true);
  };

  const handleDragLeave = () => {
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const taskId = e.dataTransfer.getData("text/plain");
    if (taskId) {
      onTaskMove(taskId, column);
    }
  };

  // Sort tasks by priority (higher first), then by creation date
  const sortedTasks = [...tasks].sort((a, b) => {
    const priorityDiff = (b.priority || 0) - (a.priority || 0);
    if (priorityDiff !== 0) return priorityDiff;
    return b.createdAt - a.createdAt;
  });

  return (
    <div
      className={`task-board-column ${isDragOver ? "drag-over" : ""}`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <div className="column-header">
        <div className="column-title">
          <span className="column-indicator" style={{ backgroundColor: color }} />
          <span className="column-name">{title}</span>
          <span className={`column-count ${isOverLimit ? "over-limit" : ""}`}>
            {tasks.length}
            {limit !== null && `/${limit}`}
          </span>
        </div>
      </div>

      <div className="column-content">
        {sortedTasks.map((task) => (
          <TaskBoardCard
            key={task.id}
            task={task}
            labels={labels}
            agents={agents}
            onPriorityChange={onTaskPriorityChange}
            onSelect={onTaskSelect}
          />
        ))}
        {tasks.length === 0 && (
          <div className="column-empty">
            <p>{agentContext.getUiCopy("taskBoardEmptyTitle")}</p>
            <p className="hint">{agentContext.getUiCopy("taskBoardEmptyHint")}</p>
          </div>
        )}
      </div>

      <style>{`
        .task-board-column {
          flex: 1;
          min-width: 280px;
          max-width: 350px;
          background: var(--color-bg-secondary);
          border-radius: 12px;
          display: flex;
          flex-direction: column;
          overflow: hidden;
          transition: all 0.15s ease;
        }

        .task-board-column.drag-over {
          background: var(--color-bg-tertiary);
          box-shadow: inset 0 0 0 2px var(--color-accent);
        }

        .column-header {
          padding: 12px 16px;
          border-bottom: 1px solid var(--color-border);
        }

        .column-title {
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .column-indicator {
          width: 8px;
          height: 8px;
          border-radius: 50%;
        }

        .column-name {
          font-size: 13px;
          font-weight: 600;
          color: var(--color-text-primary);
          flex: 1;
        }

        .column-count {
          font-size: 12px;
          color: var(--color-text-muted);
          background: var(--color-bg-primary);
          padding: 2px 8px;
          border-radius: 10px;
        }

        .column-count.over-limit {
          background: var(--color-error-subtle);
          color: var(--color-error);
          font-weight: 500;
        }

        .column-content {
          flex: 1;
          padding: 12px;
          display: flex;
          flex-direction: column;
          gap: 8px;
          overflow-y: auto;
          min-height: 200px;
        }

        .column-empty {
          flex: 1;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          color: var(--color-text-muted);
          padding: 40px 20px;
          text-align: center;
        }

        .column-empty p {
          margin: 0;
          font-size: 13px;
        }

        .column-empty .hint {
          font-size: 12px;
          opacity: 0.6;
          margin-top: 4px;
        }
      `}</style>
    </div>
  );
}
