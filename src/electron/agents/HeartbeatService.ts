import { EventEmitter } from 'events';
import {
  AgentRole,
  HeartbeatResult,
  HeartbeatEvent,
  HeartbeatStatus,
  HeartbeatConfig,
  AgentMention,
  Task,
  Activity,
} from '../../shared/types';
import { AgentRoleRepository } from './AgentRoleRepository';
import { MentionRepository } from './MentionRepository';
import { ActivityRepository } from '../activity/ActivityRepository';
import { WorkingStateRepository } from './WorkingStateRepository';

/**
 * Work items found during heartbeat check
 */
interface WorkItems {
  pendingMentions: AgentMention[];
  assignedTasks: Task[];
  relevantActivities: Activity[];
}

/**
 * Dependencies for HeartbeatService
 */
export interface HeartbeatServiceDeps {
  agentRoleRepo: AgentRoleRepository;
  mentionRepo: MentionRepository;
  activityRepo: ActivityRepository;
  workingStateRepo: WorkingStateRepository;
  createTask: (workspaceId: string, prompt: string, title: string, agentRoleId?: string) => Promise<Task>;
  getTasksForAgent: (agentRoleId: string, workspaceId?: string) => Task[];
  getDefaultWorkspaceId: () => string | undefined;
}

/**
 * HeartbeatService manages periodic agent wake-ups
 *
 * Each agent with heartbeat enabled wakes up at configured intervals
 * to check for:
 * - Pending @mentions directed at them
 * - Tasks assigned to them
 * - Relevant activity feed discussions
 *
 * If work is found, a task is created. Otherwise, HEARTBEAT_OK is logged.
 */
export class HeartbeatService extends EventEmitter {
  private timers: Map<string, NodeJS.Timeout> = new Map();
  private running: Map<string, boolean> = new Map();
  private started = false;

  constructor(private deps: HeartbeatServiceDeps) {
    super();
  }

  /**
   * Start the heartbeat service
   * Schedules heartbeats for all enabled agents
   */
  async start(): Promise<void> {
    if (this.started) {
      return;
    }

    this.started = true;
    const agents = this.deps.agentRoleRepo.findHeartbeatEnabled();

    for (const agent of agents) {
      this.scheduleHeartbeat(agent);
    }

    console.log(`[HeartbeatService] Started with ${agents.length} agents enabled`);
  }

  /**
   * Stop the heartbeat service
   * Clears all scheduled heartbeats
   */
  async stop(): Promise<void> {
    this.started = false;

    for (const [agentId, timer] of this.timers) {
      clearTimeout(timer);
    }

    this.timers.clear();
    this.running.clear();

    console.log('[HeartbeatService] Stopped');
  }

  /**
   * Manually trigger a heartbeat for a specific agent
   */
  async triggerHeartbeat(agentRoleId: string): Promise<HeartbeatResult> {
    const agent = this.deps.agentRoleRepo.findById(agentRoleId);
    if (!agent) {
      return {
        agentRoleId,
        status: 'error',
        pendingMentions: 0,
        assignedTasks: 0,
        relevantActivities: 0,
        error: 'Agent role not found',
      };
    }

    return this.executeHeartbeat(agent);
  }

  /**
   * Update heartbeat configuration for an agent
   */
  updateAgentConfig(agentRoleId: string, config: HeartbeatConfig): void {
    // Cancel existing timer
    this.cancelHeartbeat(agentRoleId);

    // Get updated agent
    const agent = this.deps.agentRoleRepo.findById(agentRoleId);
    if (!agent) {
      return;
    }

    // Schedule new heartbeat if enabled
    if (config.heartbeatEnabled && agent.heartbeatEnabled) {
      this.scheduleHeartbeat(agent);
    }
  }

  /**
   * Cancel heartbeat for an agent
   */
  cancelHeartbeat(agentRoleId: string): void {
    const timer = this.timers.get(agentRoleId);
    if (timer) {
      clearTimeout(timer);
      this.timers.delete(agentRoleId);
    }
    this.running.delete(agentRoleId);
  }

  /**
   * Get status of all heartbeat-enabled agents
   */
  getAllStatus(): Array<{
    agentRoleId: string;
    agentName: string;
    heartbeatEnabled: boolean;
    heartbeatStatus: HeartbeatStatus;
    lastHeartbeatAt?: number;
    nextHeartbeatAt?: number;
  }> {
    const agents = this.deps.agentRoleRepo.findAll(true);

    return agents.map(agent => ({
      agentRoleId: agent.id,
      agentName: agent.displayName,
      heartbeatEnabled: agent.heartbeatEnabled || false,
      heartbeatStatus: agent.heartbeatStatus || 'idle',
      lastHeartbeatAt: agent.lastHeartbeatAt,
      nextHeartbeatAt: this.getNextHeartbeatTime(agent),
    }));
  }

  /**
   * Get status of a specific agent
   */
  getStatus(agentRoleId: string): {
    heartbeatEnabled: boolean;
    heartbeatStatus: HeartbeatStatus;
    lastHeartbeatAt?: number;
    nextHeartbeatAt?: number;
    isRunning: boolean;
  } | undefined {
    const agent = this.deps.agentRoleRepo.findById(agentRoleId);
    if (!agent) {
      return undefined;
    }

    return {
      heartbeatEnabled: agent.heartbeatEnabled || false,
      heartbeatStatus: agent.heartbeatStatus || 'idle',
      lastHeartbeatAt: agent.lastHeartbeatAt,
      nextHeartbeatAt: this.getNextHeartbeatTime(agent),
      isRunning: this.running.get(agentRoleId) || false,
    };
  }

  /**
   * Schedule a heartbeat for an agent
   */
  private scheduleHeartbeat(agent: AgentRole): void {
    if (!this.started || !agent.heartbeatEnabled) {
      return;
    }

    // Cancel any existing timer
    const existingTimer = this.timers.get(agent.id);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }

    // Calculate delay with stagger offset
    const intervalMs = (agent.heartbeatIntervalMinutes || 15) * 60 * 1000;
    const staggerMs = (agent.heartbeatStaggerOffset || 0) * 60 * 1000;

    // Calculate time until next heartbeat
    const now = Date.now();
    const lastHeartbeat = agent.lastHeartbeatAt || 0;
    const nextHeartbeat = lastHeartbeat + intervalMs + staggerMs;
    const delayMs = Math.max(0, nextHeartbeat - now);

    // Schedule the heartbeat
    const timer = setTimeout(async () => {
      const currentAgent = this.deps.agentRoleRepo.findById(agent.id);
      if (currentAgent && currentAgent.heartbeatEnabled) {
        await this.executeHeartbeat(currentAgent);
        // Reschedule for next interval
        this.scheduleHeartbeat(currentAgent);
      }
    }, delayMs);

    this.timers.set(agent.id, timer);

    console.log(
      `[HeartbeatService] Scheduled ${agent.displayName} in ${Math.round(delayMs / 1000)}s`
    );
  }

  /**
   * Execute a heartbeat for an agent
   */
  private async executeHeartbeat(agent: AgentRole): Promise<HeartbeatResult> {
    // Prevent concurrent execution
    if (this.running.get(agent.id)) {
      return {
        agentRoleId: agent.id,
        status: 'error',
        pendingMentions: 0,
        assignedTasks: 0,
        relevantActivities: 0,
        error: 'Heartbeat already running',
      };
    }

    this.running.set(agent.id, true);
    this.updateHeartbeatStatus(agent.id, 'running');

    // Emit started event
    this.emitHeartbeatEvent({
      type: 'started',
      agentRoleId: agent.id,
      agentName: agent.displayName,
      timestamp: Date.now(),
    });

    try {
      // Check for pending work
      const workItems = await this.checkForWork(agent);

      const result: HeartbeatResult = {
        agentRoleId: agent.id,
        status: 'ok',
        pendingMentions: workItems.pendingMentions.length,
        assignedTasks: workItems.assignedTasks.length,
        relevantActivities: workItems.relevantActivities.length,
      };

      // If work is found, create a task or process it
      const hasWork =
        workItems.pendingMentions.length > 0 ||
        workItems.assignedTasks.length > 0;

      if (hasWork) {
        result.status = 'work_done';

        // Build prompt for agent to handle the work
        const prompt = this.buildHeartbeatPrompt(agent, workItems);
        const workspaceId = this.deps.getDefaultWorkspaceId();

        if (workspaceId) {
          const task = await this.deps.createTask(
            workspaceId,
            prompt,
            `Heartbeat: ${agent.displayName}`,
            agent.id
          );
          result.taskCreated = task.id;
        }

        this.emitHeartbeatEvent({
          type: 'work_found',
          agentRoleId: agent.id,
          agentName: agent.displayName,
          timestamp: Date.now(),
          result,
        });
      } else {
        this.emitHeartbeatEvent({
          type: 'no_work',
          agentRoleId: agent.id,
          agentName: agent.displayName,
          timestamp: Date.now(),
          result,
        });
      }

      // Update status
      this.updateHeartbeatStatus(agent.id, 'sleeping', Date.now());

      // Emit completed event
      this.emitHeartbeatEvent({
        type: 'completed',
        agentRoleId: agent.id,
        agentName: agent.displayName,
        timestamp: Date.now(),
        result,
      });

      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      this.updateHeartbeatStatus(agent.id, 'error');

      const result: HeartbeatResult = {
        agentRoleId: agent.id,
        status: 'error',
        pendingMentions: 0,
        assignedTasks: 0,
        relevantActivities: 0,
        error: errorMessage,
      };

      this.emitHeartbeatEvent({
        type: 'error',
        agentRoleId: agent.id,
        agentName: agent.displayName,
        timestamp: Date.now(),
        result,
        error: errorMessage,
      });

      return result;
    } finally {
      this.running.set(agent.id, false);
    }
  }

  /**
   * Check for pending work for an agent
   */
  private async checkForWork(agent: AgentRole): Promise<WorkItems> {
    // Get pending mentions
    const pendingMentions = this.deps.mentionRepo.getPendingForAgent(agent.id);

    // Get assigned tasks (in progress or pending)
    const assignedTasks = this.deps.getTasksForAgent(agent.id);

    // Get recent relevant activities (last hour)
    // Could be enhanced to filter by agent capabilities
    const relevantActivities: Activity[] = [];

    return {
      pendingMentions,
      assignedTasks,
      relevantActivities,
    };
  }

  /**
   * Build a prompt for the agent to handle pending work
   */
  private buildHeartbeatPrompt(agent: AgentRole, work: WorkItems): string {
    const lines: string[] = [
      `You are ${agent.displayName}, waking up for a scheduled heartbeat check.`,
      '',
    ];

    // Add agent soul if available
    if (agent.soul) {
      try {
        const soul = JSON.parse(agent.soul);
        if (soul.communicationStyle) {
          lines.push(`Communication style: ${soul.communicationStyle}`);
        }
        if (soul.focusAreas?.length) {
          lines.push(`Focus areas: ${soul.focusAreas.join(', ')}`);
        }
        lines.push('');
      } catch {
        // Invalid JSON, skip
      }
    }

    // Add pending mentions
    if (work.pendingMentions.length > 0) {
      lines.push('## Pending @Mentions');
      for (const mention of work.pendingMentions) {
        lines.push(`- Type: ${mention.mentionType}`);
        if (mention.context) {
          lines.push(`  Context: ${mention.context}`);
        }
      }
      lines.push('');
    }

    // Add assigned tasks
    if (work.assignedTasks.length > 0) {
      lines.push('## Assigned Tasks');
      for (const task of work.assignedTasks) {
        lines.push(`- [${task.status}] ${task.title}`);
      }
      lines.push('');
    }

    // Add instructions
    lines.push('## Instructions');
    if (work.pendingMentions.length > 0 || work.assignedTasks.length > 0) {
      lines.push('Please review the above items and take appropriate action.');
      lines.push('For mentions, acknowledge them and respond as needed.');
      lines.push('For assigned tasks, continue working on them or report any blockers.');
    } else {
      lines.push('No pending work found. HEARTBEAT_OK.');
    }

    return lines.join('\n');
  }

  /**
   * Update heartbeat status in the database
   */
  private updateHeartbeatStatus(
    agentRoleId: string,
    status: HeartbeatStatus,
    lastHeartbeatAt?: number
  ): void {
    this.deps.agentRoleRepo.updateHeartbeatStatus(agentRoleId, status, lastHeartbeatAt);
  }

  /**
   * Calculate next heartbeat time for an agent
   */
  private getNextHeartbeatTime(agent: AgentRole): number | undefined {
    if (!agent.heartbeatEnabled) {
      return undefined;
    }

    const intervalMs = (agent.heartbeatIntervalMinutes || 15) * 60 * 1000;
    const staggerMs = (agent.heartbeatStaggerOffset || 0) * 60 * 1000;
    const lastHeartbeat = agent.lastHeartbeatAt || Date.now();

    return lastHeartbeat + intervalMs + staggerMs;
  }

  /**
   * Emit a heartbeat event
   */
  private emitHeartbeatEvent(event: HeartbeatEvent): void {
    this.emit('heartbeat', event);
    console.log(
      `[HeartbeatService] ${event.agentName}: ${event.type}`,
      event.result ? `(mentions: ${event.result.pendingMentions}, tasks: ${event.result.assignedTasks})` : ''
    );
  }
}
