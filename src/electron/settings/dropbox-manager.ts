/**
 * Dropbox Settings Manager
 *
 * Stores Dropbox integration settings in encrypted database.
 */

import { SecureSettingsRepository } from "../database/SecureSettingsRepository";
import { DropboxSettingsData } from "../../shared/types";

const DEFAULT_SETTINGS: DropboxSettingsData = {
  enabled: false,
  timeoutMs: 20000,
};

export class DropboxSettingsManager {
  private static cachedSettings: DropboxSettingsData | null = null;

  static loadSettings(): DropboxSettingsData {
    if (this.cachedSettings) {
      return this.cachedSettings;
    }

    let settings: DropboxSettingsData = { ...DEFAULT_SETTINGS };

    try {
      if (SecureSettingsRepository.isInitialized()) {
        const repository = SecureSettingsRepository.getInstance();
        const stored = repository.load<DropboxSettingsData>("dropbox");
        if (stored) {
          settings = { ...DEFAULT_SETTINGS, ...stored };
        }
      }
    } catch (error) {
      console.error("[DropboxSettingsManager] Failed to load settings:", error);
    }

    this.cachedSettings = settings;
    return settings;
  }

  static saveSettings(settings: DropboxSettingsData): void {
    try {
      if (!SecureSettingsRepository.isInitialized()) {
        throw new Error("SecureSettingsRepository not initialized");
      }
      const repository = SecureSettingsRepository.getInstance();
      repository.save("dropbox", settings);
      this.cachedSettings = settings;
      console.log("[DropboxSettingsManager] Settings saved");
    } catch (error) {
      console.error("[DropboxSettingsManager] Failed to save settings:", error);
    }
  }

  static clearCache(): void {
    this.cachedSettings = null;
  }
}
