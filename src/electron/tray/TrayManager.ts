/**
 * TrayManager - macOS Menu Bar App Integration
 *
 * Provides a native menu bar icon with:
 * - Status indicator (connected/disconnected channels)
 * - Quick actions menu (new task, workspaces, settings)
 * - Show/hide main window on click
 * - Gateway status monitoring
 */

import { app, Tray, Menu, nativeImage, BrowserWindow, shell, NativeImage } from 'electron';
import * as path from 'path';
import { ChannelGateway } from '../gateway';
import { DatabaseManager } from '../database/schema';

export interface TrayManagerOptions {
  showDockIcon?: boolean;
  startMinimized?: boolean;
  closeToTray?: boolean;
}

export interface TraySettings {
  enabled: boolean;
  showDockIcon: boolean;
  startMinimized: boolean;
  closeToTray: boolean;
  showNotifications: boolean;
}

const DEFAULT_SETTINGS: TraySettings = {
  enabled: true,
  showDockIcon: true,
  startMinimized: false,
  closeToTray: true,
  showNotifications: true,
};

export class TrayManager {
  private tray: Tray | null = null;
  private mainWindow: BrowserWindow | null = null;
  private gateway: ChannelGateway | null = null;
  private dbManager: DatabaseManager | null = null;
  private settings: TraySettings = DEFAULT_SETTINGS;
  private connectedChannels: number = 0;
  private activeTaskCount: number = 0;

  private static instance: TrayManager | null = null;

  static getInstance(): TrayManager {
    if (!TrayManager.instance) {
      TrayManager.instance = new TrayManager();
    }
    return TrayManager.instance;
  }

  private constructor() {}

  /**
   * Initialize the tray manager
   */
  async initialize(
    mainWindow: BrowserWindow,
    gateway: ChannelGateway,
    dbManager: DatabaseManager,
    options: TrayManagerOptions = {}
  ): Promise<void> {
    this.mainWindow = mainWindow;
    this.gateway = gateway;
    this.dbManager = dbManager;

    // Load settings
    this.loadSettings();

    // Apply options overrides
    if (options.showDockIcon !== undefined) {
      this.settings.showDockIcon = options.showDockIcon;
    }
    if (options.startMinimized !== undefined) {
      this.settings.startMinimized = options.startMinimized;
    }
    if (options.closeToTray !== undefined) {
      this.settings.closeToTray = options.closeToTray;
    }

    // Create tray if enabled
    if (this.settings.enabled) {
      this.createTray();
    }

    // Apply dock icon setting (macOS only)
    this.applyDockIconSetting();

    // Handle start minimized
    if (this.settings.startMinimized && this.mainWindow) {
      this.mainWindow.hide();
    }

    // Set up window close behavior
    this.setupCloseToTray();

    // Update status periodically
    this.startStatusUpdates();

    console.log('[TrayManager] Initialized');
  }

  /**
   * Create the system tray icon
   */
  private createTray(): void {
    if (this.tray) {
      return;
    }

    try {
      // Create tray icon (use template image for macOS)
      const icon = this.getTrayIcon('idle');

      this.tray = new Tray(icon);
      this.tray.setToolTip('CoWork-OSS');

      // Build and set context menu
      this.updateContextMenu();

      // Handle click events - always show context menu on click
      this.tray.on('click', () => {
        this.tray?.popUpContextMenu();
      });
    } catch (error) {
      console.error('[TrayManager] Failed to create tray:', error);
    }
  }

  /**
   * Get or create tray icon
   */
  private getTrayIcon(state: 'idle' | 'active' | 'error'): NativeImage {
    // Try to load from file first
    const iconPath = this.getIconPath(state === 'active' ? 'trayActiveTemplate' : 'trayTemplate');
    const fs = require('fs');

    if (fs.existsSync(iconPath)) {
      const icon = nativeImage.createFromPath(iconPath);
      if (process.platform === 'darwin') {
        icon.setTemplateImage(true);
      }
      return icon;
    }

    // Create programmatic icon if file doesn't exist
    return this.createProgrammaticIcon(state);
  }

  /**
   * Create a programmatic tray icon using raw RGBA bitmap
   * More reliable than SVG data URLs for Electron tray icons
   */
  private createProgrammaticIcon(state: 'idle' | 'active' | 'error'): NativeImage {
    // Standard macOS menu bar icon size (16x16 for 1x, 32x32 for 2x retina)
    const size = 16;
    const scale = 2; // Create at 2x for retina
    const actualSize = size * scale;

    // Create RGBA buffer (4 bytes per pixel)
    const buffer = Buffer.alloc(actualSize * actualSize * 4);

    // Get color based on state
    const [r, g, b] = state === 'error' ? [255, 59, 48] :      // Red
                       state === 'active' ? [0, 122, 255] :     // Blue
                       [255, 255, 255];                          // White

    // Draw a simple filled circle
    const centerX = actualSize / 2;
    const centerY = actualSize / 2;
    const outerRadius = actualSize / 2 - 2;
    const innerRadius = outerRadius - 4;

    for (let y = 0; y < actualSize; y++) {
      for (let x = 0; x < actualSize; x++) {
        const dx = x - centerX;
        const dy = y - centerY;
        const distance = Math.sqrt(dx * dx + dy * dy);

        const idx = (y * actualSize + x) * 4;

        // Draw ring (between inner and outer radius)
        if (distance <= outerRadius && distance >= innerRadius) {
          // Anti-aliasing at edges
          let alpha = 255;
          if (distance > outerRadius - 1) {
            alpha = Math.round(255 * (outerRadius - distance));
          } else if (distance < innerRadius + 1) {
            alpha = Math.round(255 * (distance - innerRadius));
          }
          alpha = Math.max(0, Math.min(255, alpha));

          buffer[idx] = r;
          buffer[idx + 1] = g;
          buffer[idx + 2] = b;
          buffer[idx + 3] = alpha;
        } else {
          // Transparent
          buffer[idx] = 0;
          buffer[idx + 1] = 0;
          buffer[idx + 2] = 0;
          buffer[idx + 3] = 0;
        }
      }
    }

    return nativeImage.createFromBuffer(buffer, {
      width: actualSize,
      height: actualSize,
      scaleFactor: scale,
    });
  }

  /**
   * Get the path to a tray icon
   */
  private getIconPath(name: string): string {
    const isDev = process.env.NODE_ENV === 'development';
    const basePath = isDev
      ? path.join(__dirname, '../../../assets/tray')
      : path.join(process.resourcesPath, 'assets/tray');

    // Use PNG for cross-platform compatibility
    const extension = process.platform === 'darwin' ? 'png' : 'png';
    return path.join(basePath, `${name}.${extension}`);
  }

  /**
   * Update the tray context menu
   */
  private updateContextMenu(): void {
    if (!this.tray) return;

    const statusText = this.getStatusText();
    const workspaces = this.getWorkspaces();

    const menuTemplate: Electron.MenuItemConstructorOptions[] = [
      // Status section
      {
        label: statusText,
        enabled: false,
        icon: this.getStatusIcon(),
      },
      { type: 'separator' },

      // Quick actions
      {
        label: 'New Task...',
        accelerator: 'CmdOrCtrl+N',
        click: () => {
          this.showMainWindow();
          this.mainWindow?.webContents.send('tray:new-task');
        },
      },
      { type: 'separator' },

      // Workspaces submenu
      {
        label: 'Workspaces',
        submenu: workspaces.length > 0
          ? workspaces.map((ws) => ({
              label: ws.name,
              click: () => {
                this.showMainWindow();
                this.mainWindow?.webContents.send('tray:select-workspace', ws.id);
              },
            }))
          : [{ label: 'No workspaces', enabled: false }],
      },

      // Channels submenu
      {
        label: 'Channels',
        submenu: this.buildChannelsSubmenu(),
      },
      { type: 'separator' },

      // Window controls
      {
        label: this.mainWindow?.isVisible() ? 'Hide Window' : 'Show Window',
        accelerator: 'CmdOrCtrl+H',
        click: () => this.toggleMainWindow(),
      },
      {
        label: 'Settings...',
        accelerator: 'CmdOrCtrl+,',
        click: () => {
          this.showMainWindow();
          this.mainWindow?.webContents.send('tray:open-settings');
        },
      },
      { type: 'separator' },

      // App controls
      {
        label: 'About CoWork-OSS',
        click: () => {
          this.showMainWindow();
          this.mainWindow?.webContents.send('tray:open-about');
        },
      },
      {
        label: 'Check for Updates...',
        click: () => {
          this.showMainWindow();
          this.mainWindow?.webContents.send('tray:check-updates');
        },
      },
      { type: 'separator' },
      {
        label: 'Quit CoWork-OSS',
        accelerator: 'CmdOrCtrl+Q',
        click: () => {
          // Force quit (bypass close-to-tray)
          this.settings.closeToTray = false;
          app.quit();
        },
      },
    ];

    const contextMenu = Menu.buildFromTemplate(menuTemplate);
    this.tray.setContextMenu(contextMenu);
  }

  /**
   * Build the channels submenu
   */
  private buildChannelsSubmenu(): Electron.MenuItemConstructorOptions[] {
    const channels = this.gateway?.getChannels() || [];

    if (channels.length === 0) {
      return [{ label: 'No channels configured', enabled: false }];
    }

    return channels.map((channel) => {
      const statusIcon = channel.status === 'connected' ? '🟢' :
                         channel.status === 'connecting' ? '🟡' :
                         channel.status === 'error' ? '🔴' : '⚪';
      return {
        label: `${statusIcon} ${channel.name} (${channel.type})`,
        enabled: false,
      };
    });
  }

  /**
   * Get status text for the menu
   */
  private getStatusText(): string {
    const channels = this.gateway?.getChannels() || [];
    this.connectedChannels = channels.filter((c) => c.status === 'connected').length;

    if (this.activeTaskCount > 0) {
      return `Working on ${this.activeTaskCount} task${this.activeTaskCount > 1 ? 's' : ''}`;
    }

    if (this.connectedChannels > 0) {
      return `${this.connectedChannels} channel${this.connectedChannels > 1 ? 's' : ''} connected`;
    }

    return 'Ready';
  }

  /**
   * Get status icon for the menu
   */
  private getStatusIcon(): NativeImage | undefined {
    // Return undefined for now - icons in menu items can be complex
    return undefined;
  }

  /**
   * Get workspaces from database
   */
  private getWorkspaces(): Array<{ id: string; name: string; path: string }> {
    if (!this.dbManager) return [];

    try {
      const db = this.dbManager.getDatabase();
      const stmt = db.prepare('SELECT id, name, path FROM workspaces ORDER BY name');
      return stmt.all() as Array<{ id: string; name: string; path: string }>;
    } catch (error) {
      console.error('[TrayManager] Failed to get workspaces:', error);
      return [];
    }
  }

  /**
   * Toggle main window visibility
   */
  private toggleMainWindow(): void {
    if (!this.mainWindow) return;

    if (this.mainWindow.isVisible()) {
      this.mainWindow.hide();
    } else {
      this.showMainWindow();
    }

    // Update menu to reflect new state
    this.updateContextMenu();
  }

  /**
   * Show and focus the main window
   */
  private showMainWindow(): void {
    if (!this.mainWindow) return;

    this.mainWindow.show();
    this.mainWindow.focus();

    // On macOS, also bring app to foreground
    if (process.platform === 'darwin') {
      app.dock?.show();
    }
  }

  /**
   * Set up close-to-tray behavior
   */
  private setupCloseToTray(): void {
    if (!this.mainWindow) return;

    this.mainWindow.on('close', (event) => {
      if (this.settings.closeToTray && this.tray) {
        event.preventDefault();
        this.mainWindow?.hide();

        // On macOS, hide from dock when minimized to tray
        if (process.platform === 'darwin' && !this.settings.showDockIcon) {
          app.dock?.hide();
        }
      }
    });
  }

  /**
   * Apply dock icon visibility setting (macOS only)
   */
  private applyDockIconSetting(): void {
    if (process.platform !== 'darwin') return;

    if (this.settings.showDockIcon) {
      app.dock?.show();
    } else {
      app.dock?.hide();
    }
  }

  /**
   * Start periodic status updates
   */
  private startStatusUpdates(): void {
    // Update every 5 seconds
    setInterval(() => {
      this.updateContextMenu();
      this.updateTrayIcon();
    }, 5000);
  }

  /**
   * Update tray icon based on status
   */
  private updateTrayIcon(): void {
    if (!this.tray) return;

    // Determine icon state based on app status
    const state: 'idle' | 'active' | 'error' = this.activeTaskCount > 0 ? 'active' : 'idle';
    const icon = this.getTrayIcon(state);
    this.tray.setImage(icon);
  }

  /**
   * Update active task count
   */
  setActiveTaskCount(count: number): void {
    this.activeTaskCount = count;
    this.updateContextMenu();
    this.updateTrayIcon();
  }

  /**
   * Load settings from storage
   */
  private loadSettings(): void {
    try {
      const settingsPath = path.join(app.getPath('userData'), 'tray-settings.json');
      const fs = require('fs');
      if (fs.existsSync(settingsPath)) {
        const data = fs.readFileSync(settingsPath, 'utf-8');
        this.settings = { ...DEFAULT_SETTINGS, ...JSON.parse(data) };
      }
    } catch (error) {
      console.error('[TrayManager] Failed to load settings:', error);
    }
  }

  /**
   * Save settings to storage
   */
  saveSettings(settings: Partial<TraySettings>): void {
    this.settings = { ...this.settings, ...settings };

    try {
      const settingsPath = path.join(app.getPath('userData'), 'tray-settings.json');
      const fs = require('fs');
      fs.writeFileSync(settingsPath, JSON.stringify(this.settings, null, 2));

      // Apply settings immediately
      this.applyDockIconSetting();

      // Recreate tray if enabled status changed
      if (settings.enabled !== undefined) {
        if (settings.enabled && !this.tray) {
          this.createTray();
        } else if (!settings.enabled && this.tray) {
          this.destroy();
        }
      }
    } catch (error) {
      console.error('[TrayManager] Failed to save settings:', error);
    }
  }

  /**
   * Get current settings
   */
  getSettings(): TraySettings {
    return { ...this.settings };
  }

  /**
   * Show a notification from the tray
   */
  showNotification(title: string, body: string): void {
    if (!this.settings.showNotifications) return;

    const { Notification } = require('electron');
    if (Notification.isSupported()) {
      const notification = new Notification({
        title,
        body,
        silent: false,
      });
      notification.on('click', () => {
        this.showMainWindow();
      });
      notification.show();
    }
  }

  /**
   * Destroy the tray
   */
  destroy(): void {
    if (this.tray) {
      this.tray.destroy();
      this.tray = null;
    }
  }
}

export const trayManager = TrayManager.getInstance();
