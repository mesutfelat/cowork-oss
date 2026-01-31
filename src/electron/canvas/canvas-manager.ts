/**
 * Canvas Manager
 *
 * Manages Live Canvas sessions - agent-driven visual workspaces that render
 * HTML/CSS/JS content in dedicated Electron BrowserWindows.
 *
 * Features:
 * - Session lifecycle management (create, show, hide, close)
 * - Content pushing with auto-reload via file watching
 * - JavaScript execution in canvas context
 * - Screenshot capture
 * - A2UI (Agent-to-UI) action handling
 */

import { app, BrowserWindow, screen, shell } from 'electron';
import * as path from 'path';
import * as fs from 'fs/promises';
import { existsSync, readdirSync } from 'fs';
import { randomUUID } from 'crypto';
import chokidar, { type FSWatcher } from 'chokidar';
import type {
  CanvasSession,
  CanvasEvent,
  CanvasA2UIAction,
  CanvasSnapshot,
} from '../../shared/types';
import { loadCanvasStore, saveCanvasStore } from './canvas-store';

// Default HTML scaffold for new canvas sessions
const DEFAULT_HTML = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Live Canvas</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      margin: 0;
      padding: 20px;
      background: #1a1a2e;
      color: #eee;
      min-height: 100vh;
    }
    .loading {
      display: flex;
      align-items: center;
      justify-content: center;
      height: 80vh;
      font-size: 1.2em;
      color: #888;
    }
  </style>
</head>
<body>
  <div class="loading">Waiting for content...</div>
</body>
</html>`;

/**
 * Canvas Manager Singleton
 */
export class CanvasManager {
  private static instance: CanvasManager;

  private sessions: Map<string, CanvasSession> = new Map();
  private windows: Map<string, BrowserWindow> = new Map();
  private watchers: Map<string, FSWatcher> = new Map();
  private windowToSession: Map<number, string> = new Map();
  private mainWindow: BrowserWindow | null = null;
  private eventCallback: ((event: CanvasEvent) => void) | null = null;
  private a2uiCallback: ((action: CanvasA2UIAction) => void) | null = null;

  private constructor() {}

  /**
   * Get the singleton instance
   */
  static getInstance(): CanvasManager {
    if (!CanvasManager.instance) {
      CanvasManager.instance = new CanvasManager();
    }
    return CanvasManager.instance;
  }

  /**
   * Set the main window reference for event broadcasting
   */
  setMainWindow(window: BrowserWindow): void {
    this.mainWindow = window;
  }

  /**
   * Set callback for canvas events (used for IPC broadcasting)
   */
  setEventCallback(callback: (event: CanvasEvent) => void): void {
    this.eventCallback = callback;
  }

  /**
   * Set callback for A2UI actions
   */
  setA2UICallback(callback: (action: CanvasA2UIAction) => void): void {
    this.a2uiCallback = callback;
  }

  /**
   * Restore sessions from disk storage
   * Called on app startup to reload persisted sessions
   */
  async restoreSessions(): Promise<void> {
    try {
      const store = await loadCanvasStore();

      for (const session of store.sessions) {
        // Only restore active sessions with valid directories
        if (session.status === 'active' && existsSync(session.sessionDir)) {
          this.sessions.set(session.id, session);
          console.log(`[CanvasManager] Restored session ${session.id} for task ${session.taskId}`);
        }
      }

      console.log(`[CanvasManager] Restored ${this.sessions.size} sessions from disk`);
    } catch (error) {
      console.error('[CanvasManager] Failed to restore sessions:', error);
    }
  }

  /**
   * Persist all sessions to disk
   */
  async persistSessions(): Promise<void> {
    try {
      const sessions = Array.from(this.sessions.values());
      await saveCanvasStore({ version: 1, sessions });
      console.log(`[CanvasManager] Persisted ${sessions.length} sessions to disk`);
    } catch (error) {
      console.error('[CanvasManager] Failed to persist sessions:', error);
    }
  }

  /**
   * Create a new canvas session
   */
  async createSession(
    taskId: string,
    workspaceId: string,
    title?: string
  ): Promise<CanvasSession> {
    const sessionId = randomUUID();
    const sessionDir = path.join(
      app.getPath('userData'),
      'canvas',
      sessionId
    );

    // Create session directory
    await fs.mkdir(sessionDir, { recursive: true });

    // Write default HTML scaffold
    await fs.writeFile(
      path.join(sessionDir, 'index.html'),
      DEFAULT_HTML,
      'utf-8'
    );

    const session: CanvasSession = {
      id: sessionId,
      taskId,
      workspaceId,
      sessionDir,
      status: 'active',
      title: title || `Canvas ${new Date().toLocaleTimeString()}`,
      createdAt: Date.now(),
      lastUpdatedAt: Date.now(),
    };

    this.sessions.set(sessionId, session);

    // Persist sessions to disk
    await this.persistSessions();

    // Emit event
    this.emitEvent({
      type: 'session_created',
      sessionId,
      taskId,
      timestamp: Date.now(),
      session,
    });

    console.log(`[CanvasManager] Created session ${sessionId} for task ${taskId}`);
    return session;
  }

  /**
   * Get a session by ID
   */
  getSession(sessionId: string): CanvasSession | undefined {
    return this.sessions.get(sessionId);
  }

  /**
   * Get session ID from a BrowserWindow
   */
  getSessionFromWindow(window: BrowserWindow): string | undefined {
    return this.windowToSession.get(window.id);
  }

  /**
   * List all sessions for a task
   */
  listSessionsForTask(taskId: string): CanvasSession[] {
    return Array.from(this.sessions.values()).filter(
      (s) => s.taskId === taskId
    );
  }

  /**
   * List all active sessions
   */
  listAllSessions(): CanvasSession[] {
    return Array.from(this.sessions.values());
  }

  /**
   * Push content to a canvas session
   */
  async pushContent(
    sessionId: string,
    content: string,
    filename: string = 'index.html'
  ): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      const existingSessions = Array.from(this.sessions.keys());
      console.error(`[CanvasManager] Session not found: "${sessionId}"`);
      console.error(`[CanvasManager] Existing sessions: ${existingSessions.length > 0 ? existingSessions.join(', ') : 'none'}`);
      throw new Error(`Canvas session not found: "${sessionId}". Available sessions: ${existingSessions.join(', ') || 'none'}`);
    }

    // Sanitize filename to prevent path traversal
    const safeFilename = path.basename(filename);
    const filePath = path.join(session.sessionDir, safeFilename);

    await fs.writeFile(filePath, content, 'utf-8');

    // Update session timestamp
    session.lastUpdatedAt = Date.now();

    // Persist sessions to disk (in background, don't await to avoid blocking)
    this.persistSessions().catch(err => console.error('[CanvasManager] Failed to persist after push:', err));

    // Ensure a hidden window exists for snapshots (NOT shown to user)
    // The window will only be shown when user explicitly requests via showCanvas()
    await this.ensureWindowForSnapshots(sessionId);

    // Emit event
    this.emitEvent({
      type: 'content_pushed',
      sessionId,
      taskId: session.taskId,
      timestamp: Date.now(),
    });

    console.log(`[CanvasManager] Pushed ${safeFilename} to session ${sessionId}`);
  }

  /**
   * Ensure a window exists for taking snapshots (hidden by default)
   * This creates a hidden window that can be used for previews without
   * showing a separate window to the user
   */
  private async ensureWindowForSnapshots(sessionId: string): Promise<BrowserWindow> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error('Canvas session not found');
    }

    let window = this.windows.get(sessionId);

    if (!window || window.isDestroyed()) {
      // Calculate initial position - to the right of main window or right side of screen
      let initialX: number | undefined;
      let initialY: number | undefined;
      let initialHeight = 700;

      if (this.mainWindow && !this.mainWindow.isDestroyed()) {
        const mainBounds = this.mainWindow.getBounds();
        initialX = mainBounds.x + mainBounds.width + 20;
        initialY = mainBounds.y;
        initialHeight = mainBounds.height;
      } else {
        // Fallback: position on right side of primary display
        const primaryDisplay = screen.getPrimaryDisplay();
        const { width: screenWidth, height: screenHeight } = primaryDisplay.workAreaSize;
        initialX = screenWidth - 920; // 900 width + 20 margin
        initialY = 50;
        initialHeight = screenHeight - 100;
      }

      // Create new HIDDEN window for snapshots
      // NOT a child window - will be positioned to the side when shown
      window = new BrowserWindow({
        x: initialX,
        y: initialY,
        width: 900,
        height: initialHeight,
        title: session.title || 'Live Canvas',
        show: false, // Start hidden - only show when user explicitly requests
        // No parent - independent window that won't overlap main app
        webPreferences: {
          preload: path.join(__dirname, 'canvas-preload.js'),
          contextIsolation: true,
          nodeIntegration: false,
          sandbox: false,
        },
        backgroundColor: '#1a1a2e',
      });

      this.windows.set(sessionId, window);
      this.windowToSession.set(window.id, sessionId);

      // Handle window close
      window.on('closed', () => {
        this.windows.delete(sessionId);
        this.windowToSession.delete(window!.id);
        this.stopWatcher(sessionId);
      });

      // Load the canvas URL
      await window.loadURL(`canvas://${sessionId}/index.html`);

      // Start file watcher for auto-reload
      this.startWatcher(sessionId, session.sessionDir, window);
    }

    return window;
  }

  /**
   * Show the canvas window (opens it visibly to the user)
   */
  async showCanvas(sessionId: string): Promise<void> {
    // Ensure window exists (may be hidden)
    const window = await this.ensureWindowForSnapshots(sessionId);

    let bounds: { x: number; y: number; width: number; height: number };

    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      const mainBounds = this.mainWindow.getBounds();
      console.log(`[CanvasManager] Main window bounds:`, mainBounds);

      // Position canvas window completely to the RIGHT of the main window
      // This ensures it never overlaps with the main app
      bounds = {
        x: mainBounds.x + mainBounds.width + 20, // 20px gap to the right
        y: mainBounds.y,
        width: 900,
        height: mainBounds.height,
      };
    } else {
      console.log(`[CanvasManager] WARNING: mainWindow not available, using fallback position`);
      // Fallback: position on right side of primary display
      const primaryDisplay = screen.getPrimaryDisplay();
      const { width: screenWidth, height: screenHeight } = primaryDisplay.workAreaSize;
      bounds = {
        x: screenWidth - 920, // 900 width + 20 margin
        y: 50,
        width: 900,
        height: screenHeight - 100,
      };
    }

    console.log(`[CanvasManager] Setting canvas window bounds:`, bounds);

    // Always set position first to ensure correct placement
    window.setPosition(bounds.x, bounds.y);
    window.setSize(bounds.width, bounds.height);

    // Show the window without stealing focus (using setVisibleOnAllWorkspaces to ensure visibility)
    if (!window.isVisible()) {
      window.showInactive();
    }

    // Ensure bounds are applied after show (some systems need this)
    window.setBounds(bounds);

    this.emitEvent({
      type: 'window_opened',
      sessionId,
      taskId: this.sessions.get(sessionId)!.taskId,
      timestamp: Date.now(),
    });
  }

  /**
   * Hide the canvas window
   */
  hideCanvas(sessionId: string): void {
    const window = this.windows.get(sessionId);
    if (window && !window.isDestroyed()) {
      window.hide();
    }
  }

  /**
   * Close a canvas session
   */
  async closeSession(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return;
    }

    // Close window if open
    const window = this.windows.get(sessionId);
    if (window && !window.isDestroyed()) {
      window.close();
    }

    // Stop watcher
    this.stopWatcher(sessionId);

    // Update session status
    session.status = 'closed';

    // Persist sessions to disk (removes closed sessions)
    await this.persistSessions();

    // Emit event
    this.emitEvent({
      type: 'session_closed',
      sessionId,
      taskId: session.taskId,
      timestamp: Date.now(),
    });

    console.log(`[CanvasManager] Closed session ${sessionId}`);
  }

  /**
   * Execute JavaScript in the canvas context
   */
  async evalScript(sessionId: string, script: string): Promise<unknown> {
    // Ensure window exists (create hidden one if needed)
    const window = await this.ensureWindowForSnapshots(sessionId);
    if (!window || window.isDestroyed()) {
      throw new Error('Canvas window could not be created');
    }

    return window.webContents.executeJavaScript(script);
  }

  /**
   * Take a screenshot of the canvas
   */
  async takeSnapshot(sessionId: string): Promise<CanvasSnapshot> {
    // Ensure window exists (create hidden one if needed)
    const window = await this.ensureWindowForSnapshots(sessionId);
    if (!window || window.isDestroyed()) {
      throw new Error('Canvas window could not be created');
    }

    const image = await window.webContents.capturePage();
    const size = image.getSize();

    return {
      sessionId,
      imageBase64: image.toPNG().toString('base64'),
      width: size.width,
      height: size.height,
    };
  }

  /**
   * Export canvas content as a standalone HTML file
   * Returns the HTML content with all assets inlined if possible
   */
  async exportAsHTML(sessionId: string): Promise<{ content: string; filename: string }> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Canvas session not found: ${sessionId}`);
    }

    const htmlPath = path.join(session.sessionDir, 'index.html');
    if (!existsSync(htmlPath)) {
      throw new Error('Canvas index.html not found');
    }

    const content = await fs.readFile(htmlPath, 'utf-8');
    const filename = `canvas-${session.title?.replace(/[^a-z0-9]/gi, '-') || sessionId.slice(0, 8)}.html`;

    console.log(`[CanvasManager] Exported HTML for session ${sessionId}`);
    return { content, filename };
  }

  /**
   * Export all canvas files to a target directory
   */
  async exportToFolder(sessionId: string, targetDir: string): Promise<{ files: string[]; targetDir: string }> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Canvas session not found: ${sessionId}`);
    }

    if (!existsSync(session.sessionDir)) {
      throw new Error('Canvas session directory not found');
    }

    // Create target directory if it doesn't exist
    await fs.mkdir(targetDir, { recursive: true });

    // Get all files in the session directory
    const files = readdirSync(session.sessionDir);
    const copiedFiles: string[] = [];

    for (const file of files) {
      const srcPath = path.join(session.sessionDir, file);
      const destPath = path.join(targetDir, file);
      await fs.copyFile(srcPath, destPath);
      copiedFiles.push(file);
    }

    console.log(`[CanvasManager] Exported ${copiedFiles.length} files for session ${sessionId} to ${targetDir}`);
    return { files: copiedFiles, targetDir };
  }

  /**
   * Open canvas content in the default system browser
   */
  async openInBrowser(sessionId: string): Promise<{ success: boolean; path: string }> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Canvas session not found: ${sessionId}`);
    }

    const htmlPath = path.join(session.sessionDir, 'index.html');
    if (!existsSync(htmlPath)) {
      throw new Error('Canvas index.html not found');
    }

    // Open in default browser
    await shell.openPath(htmlPath);

    console.log(`[CanvasManager] Opened session ${sessionId} in browser: ${htmlPath}`);
    return { success: true, path: htmlPath };
  }

  /**
   * Get the session directory path for external access
   */
  getSessionDir(sessionId: string): string | null {
    const session = this.sessions.get(sessionId);
    return session?.sessionDir || null;
  }

  /**
   * Handle A2UI action from canvas window
   */
  handleA2UIAction(
    windowId: number,
    action: { actionName: string; componentId?: string; context?: Record<string, unknown> }
  ): void {
    const sessionId = this.windowToSession.get(windowId);
    if (!sessionId) return;

    const session = this.sessions.get(sessionId);
    if (!session) return;

    const a2uiAction: CanvasA2UIAction = {
      actionName: action.actionName,
      sessionId,
      componentId: action.componentId,
      context: action.context,
      timestamp: Date.now(),
    };

    // Emit event for UI
    this.emitEvent({
      type: 'a2ui_action',
      sessionId,
      taskId: session.taskId,
      timestamp: Date.now(),
      action: a2uiAction,
    });

    // Call A2UI callback if set
    if (this.a2uiCallback) {
      this.a2uiCallback(a2uiAction);
    }
  }

  /**
   * Start file watcher for a session
   */
  private startWatcher(
    sessionId: string,
    sessionDir: string,
    window: BrowserWindow
  ): void {
    if (this.watchers.has(sessionId)) {
      return;
    }

    const watcher = chokidar.watch(sessionDir, {
      ignoreInitial: true,
      awaitWriteFinish: {
        stabilityThreshold: 100,
        pollInterval: 50,
      },
    });

    watcher.on('change', () => {
      if (!window.isDestroyed()) {
        window.webContents.reload();
      }
    });

    this.watchers.set(sessionId, watcher);
  }

  /**
   * Stop file watcher for a session
   */
  private stopWatcher(sessionId: string): void {
    const watcher = this.watchers.get(sessionId);
    if (watcher) {
      watcher.close();
      this.watchers.delete(sessionId);
    }
  }

  /**
   * Emit a canvas event
   */
  private emitEvent(event: CanvasEvent): void {
    // Call event callback
    if (this.eventCallback) {
      this.eventCallback(event);
    }

    // Broadcast to main window
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send('canvas:event', event);
    }
  }

  /**
   * Cleanup all sessions and resources
   */
  async cleanup(): Promise<void> {
    // Close all windows
    for (const [sessionId, window] of this.windows) {
      if (!window.isDestroyed()) {
        window.close();
      }
      this.stopWatcher(sessionId);
    }

    this.sessions.clear();
    this.windows.clear();
    this.windowToSession.clear();

    console.log('[CanvasManager] Cleanup complete');
  }
}
