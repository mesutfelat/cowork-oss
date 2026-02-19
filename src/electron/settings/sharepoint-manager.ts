/**
 * SharePoint Settings Manager
 *
 * Stores SharePoint integration settings in encrypted database.
 */

import { SecureSettingsRepository } from "../database/SecureSettingsRepository";
import { SharePointSettingsData } from "../../shared/types";

const DEFAULT_SETTINGS: SharePointSettingsData = {
  enabled: false,
  timeoutMs: 20000,
};

export class SharePointSettingsManager {
  private static cachedSettings: SharePointSettingsData | null = null;

  static loadSettings(): SharePointSettingsData {
    if (this.cachedSettings) {
      return this.cachedSettings;
    }

    let settings: SharePointSettingsData = { ...DEFAULT_SETTINGS };

    try {
      if (SecureSettingsRepository.isInitialized()) {
        const repository = SecureSettingsRepository.getInstance();
        const stored = repository.load<SharePointSettingsData>("sharepoint");
        if (stored) {
          settings = { ...DEFAULT_SETTINGS, ...stored };
        }
      }
    } catch (error) {
      console.error("[SharePointSettingsManager] Failed to load settings:", error);
    }

    this.cachedSettings = settings;
    return settings;
  }

  static saveSettings(settings: SharePointSettingsData): void {
    try {
      if (!SecureSettingsRepository.isInitialized()) {
        throw new Error("SecureSettingsRepository not initialized");
      }
      const repository = SecureSettingsRepository.getInstance();
      repository.save("sharepoint", settings);
      this.cachedSettings = settings;
      console.log("[SharePointSettingsManager] Settings saved");
    } catch (error) {
      console.error("[SharePointSettingsManager] Failed to save settings:", error);
    }
  }

  static clearCache(): void {
    this.cachedSettings = null;
  }
}
