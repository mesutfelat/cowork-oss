/**
 * Notion Settings Manager
 *
 * Stores Notion integration settings in encrypted database.
 */

import { SecureSettingsRepository } from "../database/SecureSettingsRepository";
import { NotionSettingsData } from "../../shared/types";
import { DEFAULT_NOTION_VERSION } from "../utils/notion-api";

const DEFAULT_SETTINGS: NotionSettingsData = {
  enabled: false,
  notionVersion: DEFAULT_NOTION_VERSION,
  timeoutMs: 20000,
};

export class NotionSettingsManager {
  private static cachedSettings: NotionSettingsData | null = null;

  static loadSettings(): NotionSettingsData {
    if (this.cachedSettings) {
      return this.cachedSettings;
    }

    let settings: NotionSettingsData = { ...DEFAULT_SETTINGS };

    try {
      if (SecureSettingsRepository.isInitialized()) {
        const repository = SecureSettingsRepository.getInstance();
        const stored = repository.load<NotionSettingsData>("notion");
        if (stored) {
          settings = { ...DEFAULT_SETTINGS, ...stored };
        }
      }
    } catch (error) {
      console.error("[NotionSettingsManager] Failed to load settings:", error);
    }

    this.cachedSettings = settings;
    return settings;
  }

  static saveSettings(settings: NotionSettingsData): void {
    try {
      if (!SecureSettingsRepository.isInitialized()) {
        throw new Error("SecureSettingsRepository not initialized");
      }
      const repository = SecureSettingsRepository.getInstance();
      repository.save("notion", settings);
      this.cachedSettings = settings;
      console.log("[NotionSettingsManager] Settings saved");
    } catch (error) {
      console.error("[NotionSettingsManager] Failed to save settings:", error);
    }
  }

  static clearCache(): void {
    this.cachedSettings = null;
  }
}
