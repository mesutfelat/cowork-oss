/**
 * Conway Terminal Settings Manager
 *
 * Manages Conway-specific settings with encrypted storage.
 * The Conway MCP server config itself lives in MCPSettings.servers[];
 * this manages the Conway-specific overlay (wallet display, tool categories, etc.).
 */

import { ConwaySettings, DEFAULT_CONWAY_SETTINGS } from "../../shared/types";
import { SecureSettingsRepository } from "../database/SecureSettingsRepository";

const STORAGE_KEY = "conway";

export class ConwaySettingsManager {
  private static cachedSettings: ConwaySettings | null = null;
  private static initialized = false;

  static initialize(): void {
    if (this.initialized) return;
    this.initialized = true;
    console.log("[Conway Settings] Initialized");
  }

  static loadSettings(): ConwaySettings {
    this.ensureInitialized();

    if (this.cachedSettings) {
      return this.cachedSettings;
    }

    try {
      if (SecureSettingsRepository.isInitialized()) {
        const repository = SecureSettingsRepository.getInstance();
        const stored = repository.load<ConwaySettings>(STORAGE_KEY);
        if (stored) {
          this.cachedSettings = {
            ...DEFAULT_CONWAY_SETTINGS,
            ...stored,
            enabledToolCategories: {
              ...DEFAULT_CONWAY_SETTINGS.enabledToolCategories,
              ...(stored.enabledToolCategories || {}),
            },
          };
          return this.cachedSettings;
        }
      }
    } catch (error) {
      console.error("[Conway Settings] Failed to load settings:", error);
    }

    this.cachedSettings = { ...DEFAULT_CONWAY_SETTINGS };
    return this.cachedSettings;
  }

  static saveSettings(settings: ConwaySettings): void {
    this.ensureInitialized();

    this.cachedSettings = settings;

    try {
      if (!SecureSettingsRepository.isInitialized()) {
        throw new Error("SecureSettingsRepository not initialized");
      }

      const repository = SecureSettingsRepository.getInstance();
      repository.save(STORAGE_KEY, settings);
      console.log("[Conway Settings] Saved settings to encrypted database");
    } catch (error) {
      console.error("[Conway Settings] Failed to save settings:", error);
      throw error;
    }
  }

  static clearCache(): void {
    this.cachedSettings = null;
  }

  static getDefaults(): ConwaySettings {
    return { ...DEFAULT_CONWAY_SETTINGS };
  }

  private static ensureInitialized(): void {
    if (!this.initialized) {
      this.initialize();
    }
  }
}
