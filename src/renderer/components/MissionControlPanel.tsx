import { useState, useEffect, useCallback } from 'react';
import { AgentRoleData, HeartbeatEvent, HeartbeatStatus, AgentCapability } from '../../electron/preload';
import { AgentRoleEditor } from './AgentRoleEditor';

type AgentRole = AgentRoleData;

interface Task {
  id: string;
  title: string;
  status: string;
  boardColumn?: string;
  assignedAgentRoleId?: string;
  createdAt: number;
  updatedAt: number;
}

interface Activity {
  id: string;
  type: string;
  content: string;
  agentRoleId?: string;
  taskId?: string;
  timestamp: number;
}

interface HeartbeatStatusInfo {
  agentRoleId: string;
  agentName: string;
  heartbeatEnabled: boolean;
  heartbeatStatus: HeartbeatStatus;
  lastHeartbeatAt?: number;
  nextHeartbeatAt?: number;
}

const BOARD_COLUMNS = [
  { id: 'inbox', label: 'INBOX', color: '#6b7280' },
  { id: 'assigned', label: 'ASSIGNED', color: '#f59e0b' },
  { id: 'in_progress', label: 'IN PROGRESS', color: '#3b82f6' },
  { id: 'review', label: 'REVIEW', color: '#8b5cf6' },
  { id: 'done', label: 'DONE', color: '#22c55e' },
];

const AUTONOMY_BADGES: Record<string, { label: string; color: string }> = {
  lead: { label: 'LEAD', color: '#f59e0b' },
  specialist: { label: 'SPC', color: '#3b82f6' },
  intern: { label: 'INT', color: '#6b7280' },
};

interface MissionControlPanelProps {
  onClose?: () => void;
}

export function MissionControlPanel({ onClose: _onClose }: MissionControlPanelProps) {
  const [agents, setAgents] = useState<AgentRole[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [heartbeatStatuses, setHeartbeatStatuses] = useState<HeartbeatStatusInfo[]>([]);
  const [events, setEvents] = useState<HeartbeatEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingAgent, setEditingAgent] = useState<AgentRole | null>(null);
  const [isCreatingAgent, setIsCreatingAgent] = useState(false);
  const [agentError, setAgentError] = useState<string | null>(null);
  const [selectedAgent, setSelectedAgent] = useState<string | null>(null);
  const [feedFilter, setFeedFilter] = useState<'all' | 'tasks' | 'comments' | 'status'>('all');
  const [currentTime, setCurrentTime] = useState(new Date());

  // Update clock every second
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    loadData();

    // Subscribe to heartbeat events
    const unsubscribe = window.electronAPI.onHeartbeatEvent((event: HeartbeatEvent) => {
      setEvents((prev) => [event, ...prev].slice(0, 100));

      // Update status when event is received
      setHeartbeatStatuses((prev) => prev.map((status) => {
        if (status.agentRoleId === event.agentRoleId) {
          return {
            ...status,
            heartbeatStatus: event.type === 'started' ? 'running' :
                            event.type === 'error' ? 'error' : 'sleeping',
            lastHeartbeatAt: ['completed', 'no_work', 'work_found'].includes(event.type)
              ? event.timestamp
              : status.lastHeartbeatAt,
          };
        }
        return status;
      }));
    });

    return () => unsubscribe();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      const [loadedAgents, statuses, loadedTasks] = await Promise.all([
        window.electronAPI.getAgentRoles(true),
        window.electronAPI.getAllHeartbeatStatus(),
        window.electronAPI.listTasks().catch(() => []),
      ]);
      setAgents(loadedAgents);
      setHeartbeatStatuses(statuses);
      setTasks(loadedTasks);
      // Activities would require workspace context - leaving empty for now
      setActivities([]);
    } catch (err) {
      console.error('Failed to load mission control data:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateAgent = () => {
    setEditingAgent({
      id: '',
      name: '',
      displayName: '',
      description: '',
      icon: '🤖',
      color: '#6366f1',
      capabilities: ['code'] as AgentCapability[],
      isSystem: false,
      isActive: true,
      sortOrder: 100,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    setIsCreatingAgent(true);
  };

  const handleEditAgent = (agent: AgentRole) => {
    setEditingAgent({ ...agent });
    setIsCreatingAgent(false);
  };

  const handleSaveAgent = async (agent: AgentRole) => {
    try {
      setAgentError(null);
      if (isCreatingAgent) {
        const created = await window.electronAPI.createAgentRole({
          name: agent.name,
          displayName: agent.displayName,
          description: agent.description,
          icon: agent.icon,
          color: agent.color,
          personalityId: agent.personalityId,
          modelKey: agent.modelKey,
          providerType: agent.providerType,
          systemPrompt: agent.systemPrompt,
          capabilities: agent.capabilities,
          toolRestrictions: agent.toolRestrictions,
          autonomyLevel: agent.autonomyLevel,
          soul: agent.soul,
          heartbeatEnabled: agent.heartbeatEnabled,
          heartbeatIntervalMinutes: agent.heartbeatIntervalMinutes,
          heartbeatStaggerOffset: agent.heartbeatStaggerOffset,
        });
        setAgents((prev) => [...prev, created]);
      } else {
        const updated = await window.electronAPI.updateAgentRole({
          id: agent.id,
          displayName: agent.displayName,
          description: agent.description,
          icon: agent.icon,
          color: agent.color,
          personalityId: agent.personalityId,
          modelKey: agent.modelKey,
          providerType: agent.providerType,
          systemPrompt: agent.systemPrompt,
          capabilities: agent.capabilities,
          toolRestrictions: agent.toolRestrictions,
          isActive: agent.isActive,
          sortOrder: agent.sortOrder,
          autonomyLevel: agent.autonomyLevel,
          soul: agent.soul,
          heartbeatEnabled: agent.heartbeatEnabled,
          heartbeatIntervalMinutes: agent.heartbeatIntervalMinutes,
          heartbeatStaggerOffset: agent.heartbeatStaggerOffset,
        });
        if (updated) {
          setAgents((prev) => prev.map((a) => (a.id === updated.id ? updated : a)));
        }
      }
      setEditingAgent(null);
      setIsCreatingAgent(false);
      // Refresh heartbeat statuses
      const statuses = await window.electronAPI.getAllHeartbeatStatus();
      setHeartbeatStatuses(statuses);
    } catch (err: any) {
      setAgentError(err.message || 'Failed to save agent');
    }
  };

  const formatRelativeTime = (timestamp?: number) => {
    if (!timestamp) return '';
    const now = Date.now();
    const diff = now - timestamp;
    if (diff < 60000) return 'just now';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
    return `${Math.floor(diff / 86400000)}d ago`;
  };

  const getAgentStatus = (agentId: string): 'working' | 'idle' | 'offline' => {
    const status = heartbeatStatuses.find(s => s.agentRoleId === agentId);
    if (!status?.heartbeatEnabled) return 'offline';
    if (status.heartbeatStatus === 'running') return 'working';
    return 'idle';
  };

  const activeAgentsCount = agents.filter(a => a.isActive && a.heartbeatEnabled).length;
  const totalTasksInQueue = tasks.filter(t => t.boardColumn !== 'done').length;

  // Get tasks by column
  const getTasksByColumn = useCallback((columnId: string) => {
    return tasks.filter(t => {
      const col = t.boardColumn || (t.status === 'done' ? 'done' : 'inbox');
      return col === columnId;
    });
  }, [tasks]);

  // Get agent by ID
  const getAgent = useCallback((agentId?: string) => {
    if (!agentId) return null;
    return agents.find(a => a.id === agentId);
  }, [agents]);

  // Build combined feed items with filtering
  const feedItems = [
    ...events.map(e => ({
      id: `event-${e.timestamp}`,
      type: 'status' as const,
      agentId: e.agentRoleId,
      agentName: e.agentName,
      content: e.type === 'work_found'
        ? `found ${e.result?.pendingMentions || 0} mentions, ${e.result?.assignedTasks || 0} tasks`
        : e.type,
      timestamp: e.timestamp,
      taskId: undefined as string | undefined,
    })),
    ...activities.map(a => ({
      id: a.id,
      type: (a.type === 'comment' ? 'comments' : 'tasks') as 'comments' | 'tasks',
      agentId: a.agentRoleId,
      agentName: getAgent(a.agentRoleId)?.displayName || 'System',
      content: a.content,
      taskId: a.taskId,
      timestamp: a.timestamp,
    })),
  ]
    .filter(item => {
      // Filter by type
      if (feedFilter !== 'all' && item.type !== feedFilter) return false;
      // Filter by selected agent
      if (selectedAgent && item.agentId !== selectedAgent) return false;
      return true;
    })
    .sort((a, b) => b.timestamp - a.timestamp)
    .slice(0, 50);

  if (loading) {
    return (
      <div className="mission-control">
        <div className="mc-loading">Loading Mission Control...</div>
        <style>{styles}</style>
      </div>
    );
  }

  // Show agent editor modal if editing
  if (editingAgent) {
    return (
      <div className="mission-control">
        <div className="mc-editor-overlay">
          <div className="mc-editor-modal">
            <AgentRoleEditor
              role={editingAgent}
              isCreating={isCreatingAgent}
              onSave={handleSaveAgent}
              onCancel={() => { setEditingAgent(null); setIsCreatingAgent(false); setAgentError(null); }}
              error={agentError}
            />
          </div>
        </div>
        <style>{styles}</style>
      </div>
    );
  }

  return (
    <div className="mission-control">
      {/* Header */}
      <header className="mc-header">
        <div className="mc-header-left">
          <h1>MISSION CONTROL</h1>
        </div>
        <div className="mc-header-stats">
          <div className="mc-stat">
            <span className="mc-stat-value">{activeAgentsCount}</span>
            <span className="mc-stat-label">AGENTS ACTIVE</span>
          </div>
          <div className="mc-stat">
            <span className="mc-stat-value">{totalTasksInQueue}</span>
            <span className="mc-stat-label">TASKS IN QUEUE</span>
          </div>
        </div>
        <div className="mc-header-right">
          <span className="mc-time">{currentTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
          <span className="mc-status-badge online">ONLINE</span>
        </div>
      </header>

      {/* Main Content */}
      <div className="mc-content">
        {/* Left Panel - Agents */}
        <aside className="mc-agents-panel">
          <div className="mc-panel-header">
            <h2>AGENTS</h2>
            <span className="mc-count">{agents.filter(a => a.isActive).length}</span>
          </div>
          <div className="mc-agents-list">
            {agents.filter(a => a.isActive).map((agent) => {
              const status = getAgentStatus(agent.id);
              const badge = AUTONOMY_BADGES[agent.autonomyLevel || 'specialist'];

              return (
                <button
                  key={agent.id}
                  className={`mc-agent-item ${selectedAgent === agent.id ? 'selected' : ''}`}
                  onClick={() => setSelectedAgent(selectedAgent === agent.id ? null : agent.id)}
                  onDoubleClick={() => handleEditAgent(agent)}
                >
                  <div className="mc-agent-avatar" style={{ backgroundColor: agent.color }}>
                    {agent.icon}
                  </div>
                  <div className="mc-agent-info">
                    <div className="mc-agent-name-row">
                      <span className="mc-agent-name">{agent.displayName}</span>
                      <span className="mc-autonomy-badge" style={{ backgroundColor: badge.color }}>
                        {badge.label}
                      </span>
                    </div>
                    <span className="mc-agent-role">{agent.description?.slice(0, 30) || agent.name}</span>
                  </div>
                  <div className={`mc-agent-status ${status}`}>
                    <span className="mc-status-dot"></span>
                    <span className="mc-status-text">{status.toUpperCase()}</span>
                  </div>
                </button>
              );
            })}
          </div>
          <button className="mc-add-agent-btn" onClick={handleCreateAgent}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            Add Agent
          </button>
        </aside>

        {/* Center - Mission Queue */}
        <main className="mc-queue-panel">
          <div className="mc-panel-header">
            <h2>MISSION QUEUE</h2>
          </div>
          <div className="mc-kanban">
            {BOARD_COLUMNS.map((column) => {
              const columnTasks = getTasksByColumn(column.id);
              return (
                <div key={column.id} className="mc-kanban-column">
                  <div className="mc-column-header">
                    <span className="mc-column-dot" style={{ backgroundColor: column.color }}></span>
                    <span className="mc-column-label">{column.label}</span>
                    <span className="mc-column-count">{columnTasks.length}</span>
                  </div>
                  <div className="mc-column-tasks">
                    {columnTasks.slice(0, 5).map((task) => {
                      const assignedAgent = getAgent(task.assignedAgentRoleId);
                      return (
                        <div key={task.id} className="mc-task-card">
                          <div className="mc-task-title">{task.title}</div>
                          {assignedAgent && (
                            <div className="mc-task-assignee">
                              <span className="mc-task-assignee-avatar" style={{ backgroundColor: assignedAgent.color }}>
                                {assignedAgent.icon}
                              </span>
                              <span className="mc-task-assignee-name">{assignedAgent.displayName}</span>
                            </div>
                          )}
                          <div className="mc-task-meta">
                            <span className="mc-task-time">{formatRelativeTime(task.updatedAt)}</span>
                          </div>
                        </div>
                      );
                    })}
                    {columnTasks.length > 5 && (
                      <div className="mc-column-more">+{columnTasks.length - 5} more</div>
                    )}
                    {columnTasks.length === 0 && (
                      <div className="mc-column-empty">No tasks</div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </main>

        {/* Right Panel - Live Feed */}
        <aside className="mc-feed-panel">
          <div className="mc-panel-header">
            <h2>LIVE FEED</h2>
          </div>
          <div className="mc-feed-filters">
            {(['all', 'tasks', 'comments', 'status'] as const).map((filter) => (
              <button
                key={filter}
                className={`mc-filter-btn ${feedFilter === filter ? 'active' : ''}`}
                onClick={() => setFeedFilter(filter)}
              >
                {filter.charAt(0).toUpperCase() + filter.slice(1)}
              </button>
            ))}
          </div>
          <div className="mc-feed-agents">
            <span className="mc-feed-agents-label">All Agents</span>
            <div className="mc-feed-agent-chips">
              {agents.filter(a => a.isActive).slice(0, 6).map((agent) => (
                <span key={agent.id} className="mc-agent-chip" style={{ borderColor: agent.color }}>
                  {agent.icon} {agent.displayName.split(' ')[0]}
                </span>
              ))}
            </div>
          </div>
          <div className="mc-feed-list">
            {feedItems.length === 0 ? (
              <div className="mc-feed-empty">No recent activity</div>
            ) : (
              feedItems.map((item) => {
                const agent = getAgent(item.agentId);
                return (
                  <div key={item.id} className="mc-feed-item">
                    <div className="mc-feed-item-header">
                      {agent && (
                        <span className="mc-feed-agent" style={{ color: agent.color }}>
                          {agent.icon} {agent.displayName}
                        </span>
                      )}
                      <span className="mc-feed-time">{formatRelativeTime(item.timestamp)}</span>
                    </div>
                    <div className="mc-feed-content">{item.content}</div>
                  </div>
                );
              })
            )}
          </div>
        </aside>
      </div>

      <style>{styles}</style>
    </div>
  );
}

const styles = `
  .mission-control {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    background: var(--color-bg-primary);
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  }

  .mc-loading {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 100%;
    color: var(--color-text-secondary);
  }

  /* Header */
  .mc-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px 20px;
    background: var(--color-bg-secondary);
    border-bottom: 1px solid var(--color-border);
  }

  .mc-header h1 {
    font-size: 14px;
    font-weight: 600;
    letter-spacing: 1px;
    color: var(--color-text-primary);
    margin: 0;
  }

  .mc-header-stats {
    display: flex;
    gap: 40px;
  }

  .mc-stat {
    display: flex;
    flex-direction: column;
    align-items: center;
  }

  .mc-stat-value {
    font-size: 24px;
    font-weight: 600;
    color: var(--color-text-primary);
  }

  .mc-stat-label {
    font-size: 10px;
    color: var(--color-text-secondary);
    letter-spacing: 0.5px;
  }

  .mc-header-right {
    display: flex;
    align-items: center;
    gap: 16px;
  }

  .mc-time {
    font-size: 14px;
    font-weight: 500;
    color: var(--color-text-primary);
    font-family: 'SF Mono', Monaco, monospace;
  }

  .mc-status-badge {
    padding: 4px 12px;
    border-radius: 4px;
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.5px;
  }

  .mc-status-badge.online {
    background: var(--color-success-subtle);
    color: var(--color-success);
  }

  /* Main Content Layout */
  .mc-content {
    display: flex;
    flex: 1;
    overflow: hidden;
  }

  .mc-panel-header {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 12px 16px;
    border-bottom: 1px solid var(--color-border);
  }

  .mc-panel-header h2 {
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.5px;
    color: var(--color-text-secondary);
    margin: 0;
  }

  .mc-count {
    font-size: 11px;
    color: var(--color-text-muted);
  }

  /* Agents Panel */
  .mc-agents-panel {
    width: 240px;
    background: var(--color-bg-secondary);
    border-right: 1px solid var(--color-border);
    display: flex;
    flex-direction: column;
    flex-shrink: 0;
  }

  .mc-agents-list {
    flex: 1;
    overflow-y: auto;
    padding: 8px;
  }

  .mc-agent-item {
    display: flex;
    align-items: center;
    gap: 10px;
    width: 100%;
    padding: 10px;
    background: transparent;
    border: none;
    border-radius: 8px;
    cursor: pointer;
    text-align: left;
    transition: background 0.15s;
  }

  .mc-agent-item:hover {
    background: var(--color-bg-tertiary);
  }

  .mc-agent-item.selected {
    background: var(--color-accent-subtle);
  }

  .mc-agent-avatar {
    width: 36px;
    height: 36px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 16px;
    flex-shrink: 0;
  }

  .mc-agent-info {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .mc-agent-name-row {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .mc-agent-name {
    font-size: 13px;
    font-weight: 600;
    color: var(--color-text-primary);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .mc-autonomy-badge {
    padding: 1px 5px;
    border-radius: 3px;
    font-size: 9px;
    font-weight: 600;
    color: white;
    letter-spacing: 0.3px;
  }

  .mc-agent-role {
    font-size: 11px;
    color: var(--color-text-secondary);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .mc-agent-status {
    display: flex;
    align-items: center;
    gap: 4px;
    flex-shrink: 0;
  }

  .mc-status-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
  }

  .mc-agent-status.working .mc-status-dot {
    background: var(--color-success);
  }

  .mc-agent-status.idle .mc-status-dot {
    background: var(--color-text-muted);
  }

  .mc-agent-status.offline .mc-status-dot {
    background: var(--color-border);
  }

  .mc-status-text {
    font-size: 9px;
    font-weight: 500;
    color: var(--color-text-secondary);
  }

  .mc-add-agent-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    margin: 8px;
    padding: 10px;
    background: var(--color-bg-tertiary);
    border: 1px dashed var(--color-border);
    border-radius: 8px;
    font-size: 12px;
    color: var(--color-text-secondary);
    cursor: pointer;
    transition: all 0.15s;
  }

  .mc-add-agent-btn:hover {
    background: var(--color-bg-hover);
    border-color: var(--color-text-muted);
  }

  /* Queue Panel (Kanban) */
  .mc-queue-panel {
    flex: 1;
    background: var(--color-bg-primary);
    display: flex;
    flex-direction: column;
    min-width: 0;
  }

  .mc-kanban {
    display: flex;
    flex-wrap: wrap;
    gap: 16px;
    padding: 16px;
    flex: 1;
    overflow-y: auto;
    align-content: flex-start;
  }

  .mc-kanban-column {
    flex: 1 1 200px;
    min-width: 180px;
    max-width: 300px;
    display: flex;
    flex-direction: column;
  }

  .mc-column-header {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 0;
    margin-bottom: 8px;
  }

  .mc-column-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
  }

  .mc-column-label {
    font-size: 11px;
    font-weight: 600;
    color: var(--color-text-secondary);
    letter-spacing: 0.5px;
  }

  .mc-column-count {
    font-size: 11px;
    color: var(--color-text-muted);
    margin-left: auto;
  }

  .mc-column-tasks {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .mc-task-card {
    background: var(--color-bg-secondary);
    border: 1px solid var(--color-border);
    border-radius: 8px;
    padding: 12px;
    cursor: pointer;
    transition: all 0.15s;
  }

  .mc-task-card:hover {
    box-shadow: var(--shadow-sm);
    transform: translateY(-1px);
  }

  .mc-task-title {
    font-size: 13px;
    font-weight: 500;
    color: var(--color-text-primary);
    margin-bottom: 8px;
    line-height: 1.4;
  }

  .mc-task-assignee {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-bottom: 6px;
  }

  .mc-task-assignee-avatar {
    width: 20px;
    height: 20px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 10px;
  }

  .mc-task-assignee-name {
    font-size: 11px;
    color: var(--color-text-secondary);
  }

  .mc-task-meta {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .mc-task-time {
    font-size: 10px;
    color: var(--color-text-muted);
  }

  .mc-column-more {
    font-size: 11px;
    color: var(--color-text-secondary);
    text-align: center;
    padding: 8px;
  }

  .mc-column-empty {
    font-size: 11px;
    color: var(--color-text-muted);
    text-align: center;
    padding: 20px 8px;
    background: var(--color-bg-secondary);
    border: 1px dashed var(--color-border);
    border-radius: 8px;
  }

  /* Feed Panel */
  .mc-feed-panel {
    width: 300px;
    background: var(--color-bg-secondary);
    border-left: 1px solid var(--color-border);
    display: flex;
    flex-direction: column;
    flex-shrink: 0;
  }

  .mc-feed-filters {
    display: flex;
    gap: 4px;
    padding: 8px 12px;
    border-bottom: 1px solid var(--color-border-subtle);
  }

  .mc-filter-btn {
    padding: 4px 10px;
    background: transparent;
    border: 1px solid var(--color-border);
    border-radius: 12px;
    font-size: 11px;
    color: var(--color-text-secondary);
    cursor: pointer;
    transition: all 0.15s;
  }

  .mc-filter-btn:hover {
    background: var(--color-bg-tertiary);
  }

  .mc-filter-btn.active {
    background: var(--color-accent);
    border-color: var(--color-accent);
    color: white;
  }

  .mc-feed-agents {
    padding: 12px;
    border-bottom: 1px solid var(--color-border-subtle);
  }

  .mc-feed-agents-label {
    font-size: 11px;
    font-weight: 500;
    color: var(--color-text-secondary);
    display: block;
    margin-bottom: 8px;
  }

  .mc-feed-agent-chips {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }

  .mc-agent-chip {
    padding: 3px 8px;
    background: var(--color-bg-primary);
    border: 1px solid var(--color-border);
    border-radius: 12px;
    font-size: 10px;
    color: var(--color-text-secondary);
  }

  .mc-feed-list {
    flex: 1;
    overflow-y: auto;
    padding: 8px;
  }

  .mc-feed-item {
    padding: 10px;
    border-radius: 6px;
    transition: background 0.15s;
  }

  .mc-feed-item:hover {
    background: var(--color-bg-tertiary);
  }

  .mc-feed-item-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 4px;
  }

  .mc-feed-agent {
    font-size: 12px;
    font-weight: 600;
  }

  .mc-feed-time {
    font-size: 10px;
    color: var(--color-text-muted);
  }

  .mc-feed-content {
    font-size: 12px;
    color: var(--color-text-secondary);
    line-height: 1.4;
  }

  .mc-feed-empty {
    padding: 40px 16px;
    text-align: center;
    color: var(--color-text-muted);
    font-size: 12px;
  }

  /* Editor Modal */
  .mc-editor-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.5);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
  }

  .mc-editor-modal {
    background: var(--color-bg-elevated);
    border-radius: 12px;
    width: 90%;
    max-width: 600px;
    max-height: 90%;
    overflow: auto;
    box-shadow: var(--shadow-lg);
  }

  /* Responsive breakpoints */
  @media (max-width: 1200px) {
    .mc-feed-panel {
      width: 240px;
    }
  }

  @media (max-width: 1000px) {
    .mc-content {
      flex-direction: column;
    }

    .mc-agents-panel {
      width: 100%;
      max-height: 200px;
      border-right: none;
      border-bottom: 1px solid var(--color-border);
    }

    .mc-agents-list {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      padding: 8px;
    }

    .mc-agent-item {
      flex: 0 0 auto;
      width: auto;
      padding: 8px 12px;
    }

    .mc-add-agent-btn {
      flex: 0 0 auto;
      margin: 0;
      padding: 8px 12px;
    }

    .mc-feed-panel {
      width: 100%;
      max-height: 250px;
      border-left: none;
      border-top: 1px solid var(--color-border);
    }
  }

  @media (max-width: 700px) {
    .mc-header {
      flex-wrap: wrap;
      gap: 12px;
      padding: 12px 16px;
    }

    .mc-header-stats {
      gap: 24px;
    }

    .mc-stat-value {
      font-size: 18px;
    }

    .mc-kanban-column {
      flex: 1 1 100%;
      max-width: none;
    }
  }
`;
