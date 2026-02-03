import { ActivityData, ActivityType, ActivityActorType } from '../../electron/preload';

interface ActivityFeedItemProps {
  activity: ActivityData;
  onMarkRead: (id: string) => void;
  onPin: (id: string) => void;
  onDelete: (id: string) => void;
  compact?: boolean;
}

const ACTIVITY_ICONS: Record<ActivityType, string> = {
  task_created: '📋',
  task_started: '▶️',
  task_completed: '✅',
  task_failed: '❌',
  task_paused: '⏸️',
  task_resumed: '▶️',
  comment: '💬',
  file_created: '📄',
  file_modified: '✏️',
  file_deleted: '🗑️',
  command_executed: '💻',
  tool_used: '🔧',
  mention: '@',
  agent_assigned: '🤖',
  error: '⚠️',
  info: 'ℹ️',
};

const ACTIVITY_COLORS: Record<ActivityType, string> = {
  task_created: '#3b82f6',
  task_started: '#22c55e',
  task_completed: '#22c55e',
  task_failed: '#ef4444',
  task_paused: '#f59e0b',
  task_resumed: '#22c55e',
  comment: '#ec4899',
  file_created: '#8b5cf6',
  file_modified: '#f59e0b',
  file_deleted: '#ef4444',
  command_executed: '#06b6d4',
  tool_used: '#6366f1',
  mention: '#ec4899',
  agent_assigned: '#6366f1',
  error: '#ef4444',
  info: '#3b82f6',
};

const ACTOR_LABELS: Record<ActivityActorType, string> = {
  agent: 'Agent',
  user: 'User',
  system: 'System',
};

function formatTimeAgo(timestamp: number): string {
  const seconds = Math.floor((Date.now() - timestamp) / 1000);

  if (seconds < 60) return 'just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;

  return new Date(timestamp).toLocaleDateString();
}

export function ActivityFeedItem({
  activity,
  onMarkRead,
  onPin,
  onDelete,
  compact = false,
}: ActivityFeedItemProps) {
  const icon = ACTIVITY_ICONS[activity.activityType];
  const color = ACTIVITY_COLORS[activity.activityType];

  const handleClick = () => {
    if (!activity.isRead) {
      onMarkRead(activity.id);
    }
  };

  return (
    <div
      className={`activity-feed-item ${!activity.isRead ? 'unread' : ''} ${activity.isPinned ? 'pinned' : ''} ${compact ? 'compact' : ''}`}
      onClick={handleClick}
    >
      <div className="activity-icon" style={{ backgroundColor: color }}>
        {icon}
      </div>

      <div className="activity-content">
        <div className="activity-header">
          <span className="activity-title">{activity.title}</span>
          <span className="activity-time">{formatTimeAgo(activity.createdAt)}</span>
        </div>

        {!compact && activity.description && (
          <p className="activity-description">{activity.description}</p>
        )}

        <div className="activity-meta">
          <span className="activity-actor">{ACTOR_LABELS[activity.actorType]}</span>
          {activity.taskId && (
            <span className="activity-task">Task</span>
          )}
        </div>
      </div>

      <div className="activity-actions">
        <button
          className={`activity-action-btn ${activity.isPinned ? 'active' : ''}`}
          onClick={(e) => {
            e.stopPropagation();
            onPin(activity.id);
          }}
          title={activity.isPinned ? 'Unpin' : 'Pin'}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill={activity.isPinned ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2">
            <path d="M12 2l3 6h6l-5 5 2 9-6-4-6 4 2-9-5-5h6l3-6z" />
          </svg>
        </button>
        <button
          className="activity-action-btn"
          onClick={(e) => {
            e.stopPropagation();
            onDelete(activity.id);
          }}
          title="Delete"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>

      {!activity.isRead && <div className="unread-indicator" />}

      <style>{`
        .activity-feed-item {
          display: flex;
          align-items: flex-start;
          gap: 12px;
          padding: 12px;
          border-radius: 8px;
          background: var(--bg-secondary);
          cursor: pointer;
          transition: all 0.15s ease;
          position: relative;
        }

        .activity-feed-item:hover {
          background: var(--bg-tertiary);
        }

        .activity-feed-item.unread {
          background: color-mix(in srgb, var(--accent-color) 8%, var(--bg-secondary));
        }

        .activity-feed-item.pinned {
          border-left: 3px solid var(--accent-color);
        }

        .activity-feed-item.compact {
          padding: 8px;
        }

        .activity-icon {
          width: 32px;
          height: 32px;
          border-radius: 6px;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 14px;
          flex-shrink: 0;
        }

        .activity-feed-item.compact .activity-icon {
          width: 24px;
          height: 24px;
          font-size: 12px;
        }

        .activity-content {
          flex: 1;
          min-width: 0;
        }

        .activity-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 8px;
        }

        .activity-title {
          font-size: 13px;
          font-weight: 500;
          color: var(--text-primary);
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .activity-time {
          font-size: 11px;
          color: var(--text-tertiary);
          flex-shrink: 0;
        }

        .activity-description {
          font-size: 12px;
          color: var(--text-secondary);
          margin: 4px 0 0 0;
          overflow: hidden;
          text-overflow: ellipsis;
          display: -webkit-box;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
        }

        .activity-meta {
          display: flex;
          gap: 8px;
          margin-top: 6px;
        }

        .activity-actor,
        .activity-task {
          font-size: 10px;
          padding: 2px 6px;
          border-radius: 4px;
          background: var(--bg-tertiary);
          color: var(--text-tertiary);
        }

        .activity-actions {
          display: flex;
          gap: 4px;
          opacity: 0;
          transition: opacity 0.15s ease;
        }

        .activity-feed-item:hover .activity-actions {
          opacity: 1;
        }

        .activity-action-btn {
          width: 24px;
          height: 24px;
          border: none;
          background: transparent;
          color: var(--text-tertiary);
          cursor: pointer;
          border-radius: 4px;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: all 0.15s ease;
        }

        .activity-action-btn:hover {
          background: var(--bg-tertiary);
          color: var(--text-primary);
        }

        .activity-action-btn.active {
          color: var(--accent-color);
        }

        .unread-indicator {
          position: absolute;
          top: 50%;
          left: 4px;
          transform: translateY(-50%);
          width: 6px;
          height: 6px;
          background: var(--accent-color);
          border-radius: 50%;
        }
      `}</style>
    </div>
  );
}
