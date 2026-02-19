/**
 * Google Workspace Settings Manager
 *
 * Stores Google Workspace integration settings in encrypted database.
 */

import { SecureSettingsRepository } from "../database/SecureSettingsRepository";
import { GoogleWorkspaceSettingsData } from "../../shared/types";

const DEFAULT_SETTINGS: GoogleWorkspaceSettingsData = {
  enabled: false,
  timeoutMs: 20000,
};

export class GoogleWorkspaceSettingsManager {
  private static cachedSettings: GoogleWorkspaceSettingsData | null = null;

  static loadSettings(): GoogleWorkspaceSettingsData {
    if (this.cachedSettings) {
      return this.cachedSettings;
    }

    let settings: GoogleWorkspaceSettingsData = { ...DEFAULT_SETTINGS };

    try {
      if (SecureSettingsRepository.isInitialized()) {
        const repository = SecureSettingsRepository.getInstance();
        // Keep legacy category key for backwards compatibility with existing Google Drive settings.
        const stored = repository.load<GoogleWorkspaceSettingsData>("google-drive");
        if (stored) {
          settings = { ...DEFAULT_SETTINGS, ...stored };
        }
      }
    } catch (error) {
      console.error("[GoogleWorkspaceSettingsManager] Failed to load settings:", error);
    }

    this.cachedSettings = settings;
    return settings;
  }

  static saveSettings(settings: GoogleWorkspaceSettingsData): void {
    try {
      if (!SecureSettingsRepository.isInitialized()) {
        throw new Error("SecureSettingsRepository not initialized");
      }
      const repository = SecureSettingsRepository.getInstance();
      repository.save("google-drive", settings);
      this.cachedSettings = settings;
      console.log("[GoogleWorkspaceSettingsManager] Settings saved");
    } catch (error) {
      console.error("[GoogleWorkspaceSettingsManager] Failed to save settings:", error);
    }
  }

  static clearCache(): void {
    this.cachedSettings = null;
  }
}
