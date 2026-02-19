/**
 * OneDrive Settings Manager
 *
 * Stores OneDrive integration settings in encrypted database.
 */

import { SecureSettingsRepository } from "../database/SecureSettingsRepository";
import { OneDriveSettingsData } from "../../shared/types";

const DEFAULT_SETTINGS: OneDriveSettingsData = {
  enabled: false,
  timeoutMs: 20000,
};

export class OneDriveSettingsManager {
  private static cachedSettings: OneDriveSettingsData | null = null;

  static loadSettings(): OneDriveSettingsData {
    if (this.cachedSettings) {
      return this.cachedSettings;
    }

    let settings: OneDriveSettingsData = { ...DEFAULT_SETTINGS };

    try {
      if (SecureSettingsRepository.isInitialized()) {
        const repository = SecureSettingsRepository.getInstance();
        const stored = repository.load<OneDriveSettingsData>("onedrive");
        if (stored) {
          settings = { ...DEFAULT_SETTINGS, ...stored };
        }
      }
    } catch (error) {
      console.error("[OneDriveSettingsManager] Failed to load settings:", error);
    }

    this.cachedSettings = settings;
    return settings;
  }

  static saveSettings(settings: OneDriveSettingsData): void {
    try {
      if (!SecureSettingsRepository.isInitialized()) {
        throw new Error("SecureSettingsRepository not initialized");
      }
      const repository = SecureSettingsRepository.getInstance();
      repository.save("onedrive", settings);
      this.cachedSettings = settings;
      console.log("[OneDriveSettingsManager] Settings saved");
    } catch (error) {
      console.error("[OneDriveSettingsManager] Failed to save settings:", error);
    }
  }

  static clearCache(): void {
    this.cachedSettings = null;
  }
}
