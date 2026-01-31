/**
 * Canvas Tools - Stub Implementation
 *
 * This is a placeholder while the Live Canvas feature is in development.
 * The full implementation is stored in /tmp/cowork-canvas-wip/
 */

import { LLMTool } from '../llm/types';

export class CanvasTools {
  constructor(_workspace: unknown, _daemon: unknown, _taskId: string) {
    // Stub constructor
  }

  static getToolDefinitions(): LLMTool[] {
    // Canvas tools are WIP - return empty array
    return [];
  }

  async createCanvas(_title?: string): Promise<string> {
    return JSON.stringify({ error: 'Canvas feature is not yet available' });
  }

  async pushContent(_sessionId: string, _content: string, _filename?: string): Promise<string> {
    return JSON.stringify({ error: 'Canvas feature is not yet available' });
  }

  async showCanvas(_sessionId: string): Promise<string> {
    return JSON.stringify({ error: 'Canvas feature is not yet available' });
  }

  hideCanvas(_sessionId: string): string {
    return JSON.stringify({ error: 'Canvas feature is not yet available' });
  }

  async closeCanvas(_sessionId: string): Promise<string> {
    return JSON.stringify({ error: 'Canvas feature is not yet available' });
  }

  async evalScript(_sessionId: string, _script: string): Promise<string> {
    return JSON.stringify({ error: 'Canvas feature is not yet available' });
  }

  async takeSnapshot(_sessionId: string): Promise<string> {
    return JSON.stringify({ error: 'Canvas feature is not yet available' });
  }

  listSessions(): string {
    return JSON.stringify({ sessions: [] });
  }
}
