/**
 * Box Settings Manager
 *
 * Stores Box integration settings in encrypted database.
 */

import { SecureSettingsRepository } from "../database/SecureSettingsRepository";
import { BoxSettingsData } from "../../shared/types";

const DEFAULT_SETTINGS: BoxSettingsData = {
  enabled: false,
  timeoutMs: 20000,
};

export class BoxSettingsManager {
  private static cachedSettings: BoxSettingsData | null = null;

  static loadSettings(): BoxSettingsData {
    if (this.cachedSettings) {
      return this.cachedSettings;
    }

    let settings: BoxSettingsData = { ...DEFAULT_SETTINGS };

    try {
      if (SecureSettingsRepository.isInitialized()) {
        const repository = SecureSettingsRepository.getInstance();
        const stored = repository.load<BoxSettingsData>("box");
        if (stored) {
          settings = { ...DEFAULT_SETTINGS, ...stored };
        }
      }
    } catch (error) {
      console.error("[BoxSettingsManager] Failed to load settings:", error);
    }

    this.cachedSettings = settings;
    return settings;
  }

  static saveSettings(settings: BoxSettingsData): void {
    try {
      if (!SecureSettingsRepository.isInitialized()) {
        throw new Error("SecureSettingsRepository not initialized");
      }
      const repository = SecureSettingsRepository.getInstance();
      repository.save("box", settings);
      this.cachedSettings = settings;
      console.log("[BoxSettingsManager] Settings saved");
    } catch (error) {
      console.error("[BoxSettingsManager] Failed to save settings:", error);
    }
  }

  static clearCache(): void {
    this.cachedSettings = null;
  }
}
