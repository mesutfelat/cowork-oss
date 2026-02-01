/**
 * Voice Settings Manager
 *
 * Manages persistence of voice settings to disk.
 * API keys are stored securely using Electron's safeStorage.
 */

import { app, safeStorage } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import {
  VoiceSettings,
  VoiceProvider,
  VoiceInputMode,
  VoiceResponseMode,
  DEFAULT_VOICE_SETTINGS,
} from '../../shared/types';

const SETTINGS_FILE = 'voice-settings.json';
const SECURE_KEYS_FILE = 'voice-keys.enc';

// Settings stored in plain JSON (no sensitive data)
interface VoiceSettingsFile {
  enabled: boolean;
  ttsProvider: VoiceProvider;
  sttProvider: VoiceProvider;
  elevenLabsVoiceId?: string;
  openaiVoice?: 'alloy' | 'echo' | 'fable' | 'onyx' | 'nova' | 'shimmer';
  inputMode: VoiceInputMode;
  responseMode: VoiceResponseMode;
  pushToTalkKey: string;
  volume: number;
  speechRate: number;
  language: string;
  wakeWordEnabled: boolean;
  wakeWord?: string;
  silenceTimeout: number;
  audioFeedback: boolean;
}

// Secure storage for API keys
interface SecureKeys {
  elevenLabsApiKey?: string;
  openaiApiKey?: string;
}

export class VoiceSettingsManager {
  private static settingsPath: string;
  private static secureKeysPath: string;
  private static cachedSettings: VoiceSettings | null = null;

  /**
   * Initialize the VoiceSettingsManager with the settings paths
   */
  static initialize(): void {
    const userDataPath = app.getPath('userData');
    this.settingsPath = path.join(userDataPath, SETTINGS_FILE);
    this.secureKeysPath = path.join(userDataPath, SECURE_KEYS_FILE);
    console.log('[VoiceSettingsManager] Initialized with path:', this.settingsPath);
  }

  /**
   * Load voice settings from disk
   */
  static loadSettings(): VoiceSettings {
    if (this.cachedSettings) {
      return this.cachedSettings;
    }

    let settings: VoiceSettings = { ...DEFAULT_VOICE_SETTINGS };

    try {
      // Load non-sensitive settings
      if (fs.existsSync(this.settingsPath)) {
        const data = fs.readFileSync(this.settingsPath, 'utf-8');
        const parsed: VoiceSettingsFile = JSON.parse(data);
        settings = {
          ...DEFAULT_VOICE_SETTINGS,
          ...parsed,
        };

        // Validate values
        settings = this.validateSettings(settings);
      }

      // Load secure API keys
      const secureKeys = this.loadSecureKeys();
      if (secureKeys.elevenLabsApiKey) {
        settings.elevenLabsApiKey = secureKeys.elevenLabsApiKey;
      }
      if (secureKeys.openaiApiKey) {
        settings.openaiApiKey = secureKeys.openaiApiKey;
      }
    } catch (error) {
      console.error('[VoiceSettingsManager] Failed to load settings:', error);
      settings = { ...DEFAULT_VOICE_SETTINGS };
    }

    this.cachedSettings = settings;
    return settings;
  }

  /**
   * Save voice settings to disk
   */
  static saveSettings(settings: VoiceSettings): void {
    try {
      // Validate and prepare settings for storage
      const validatedSettings = this.validateSettings(settings);

      // Separate sensitive data from regular settings
      const { elevenLabsApiKey, openaiApiKey, ...fileSettings } = validatedSettings;

      // Save non-sensitive settings
      const settingsFile: VoiceSettingsFile = {
        enabled: fileSettings.enabled,
        ttsProvider: fileSettings.ttsProvider,
        sttProvider: fileSettings.sttProvider,
        elevenLabsVoiceId: fileSettings.elevenLabsVoiceId,
        openaiVoice: fileSettings.openaiVoice,
        inputMode: fileSettings.inputMode,
        responseMode: fileSettings.responseMode,
        pushToTalkKey: fileSettings.pushToTalkKey,
        volume: fileSettings.volume,
        speechRate: fileSettings.speechRate,
        language: fileSettings.language,
        wakeWordEnabled: fileSettings.wakeWordEnabled,
        wakeWord: fileSettings.wakeWord,
        silenceTimeout: fileSettings.silenceTimeout,
        audioFeedback: fileSettings.audioFeedback,
      };

      fs.writeFileSync(this.settingsPath, JSON.stringify(settingsFile, null, 2));

      // Save API keys securely
      this.saveSecureKeys({
        elevenLabsApiKey,
        openaiApiKey,
      });

      this.cachedSettings = validatedSettings;
      console.log('[VoiceSettingsManager] Settings saved');
    } catch (error) {
      console.error('[VoiceSettingsManager] Failed to save settings:', error);
      throw error;
    }
  }

  /**
   * Update partial settings
   */
  static updateSettings(partial: Partial<VoiceSettings>): VoiceSettings {
    const current = this.loadSettings();
    const updated = { ...current, ...partial };
    this.saveSettings(updated);
    return updated;
  }

  /**
   * Clear cached settings
   */
  static clearCache(): void {
    this.cachedSettings = null;
  }

  /**
   * Delete all voice settings (reset to defaults)
   */
  static resetSettings(): void {
    try {
      if (fs.existsSync(this.settingsPath)) {
        fs.unlinkSync(this.settingsPath);
      }
      if (fs.existsSync(this.secureKeysPath)) {
        fs.unlinkSync(this.secureKeysPath);
      }
      this.cachedSettings = null;
      console.log('[VoiceSettingsManager] Settings reset to defaults');
    } catch (error) {
      console.error('[VoiceSettingsManager] Failed to reset settings:', error);
      throw error;
    }
  }

  /**
   * Check if ElevenLabs API key is configured
   */
  static hasElevenLabsKey(): boolean {
    const settings = this.loadSettings();
    return !!settings.elevenLabsApiKey;
  }

  /**
   * Check if OpenAI API key is configured
   */
  static hasOpenAIKey(): boolean {
    const settings = this.loadSettings();
    return !!settings.openaiApiKey;
  }

  // ============ Private Methods ============

  private static validateSettings(settings: VoiceSettings): VoiceSettings {
    const validated = { ...settings };

    // Validate provider
    if (!['elevenlabs', 'openai', 'local'].includes(validated.ttsProvider)) {
      validated.ttsProvider = DEFAULT_VOICE_SETTINGS.ttsProvider;
    }
    if (!['elevenlabs', 'openai', 'local'].includes(validated.sttProvider)) {
      validated.sttProvider = DEFAULT_VOICE_SETTINGS.sttProvider;
    }

    // Validate input mode
    if (!['push_to_talk', 'voice_activity', 'disabled'].includes(validated.inputMode)) {
      validated.inputMode = DEFAULT_VOICE_SETTINGS.inputMode;
    }

    // Validate response mode
    if (!['auto', 'manual', 'smart'].includes(validated.responseMode)) {
      validated.responseMode = DEFAULT_VOICE_SETTINGS.responseMode;
    }

    // Validate OpenAI voice
    const validVoices = ['alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer'];
    if (validated.openaiVoice && !validVoices.includes(validated.openaiVoice)) {
      validated.openaiVoice = undefined;
    }

    // Validate numeric ranges
    validated.volume = Math.max(0, Math.min(100, validated.volume || DEFAULT_VOICE_SETTINGS.volume));
    validated.speechRate = Math.max(0.5, Math.min(2.0, validated.speechRate || DEFAULT_VOICE_SETTINGS.speechRate));
    validated.silenceTimeout = Math.max(1, Math.min(10, validated.silenceTimeout || DEFAULT_VOICE_SETTINGS.silenceTimeout));

    return validated;
  }

  private static loadSecureKeys(): SecureKeys {
    if (!fs.existsSync(this.secureKeysPath)) {
      return {};
    }

    try {
      if (!safeStorage.isEncryptionAvailable()) {
        console.warn('[VoiceSettingsManager] Encryption not available, API keys may not be secure');
        // Fall back to plain text storage if encryption unavailable
        const data = fs.readFileSync(this.secureKeysPath, 'utf-8');
        return JSON.parse(data);
      }

      const encryptedData = fs.readFileSync(this.secureKeysPath);
      const decryptedString = safeStorage.decryptString(encryptedData);
      return JSON.parse(decryptedString);
    } catch (error) {
      console.error('[VoiceSettingsManager] Failed to load secure keys:', error);
      return {};
    }
  }

  private static saveSecureKeys(keys: SecureKeys): void {
    try {
      // Remove undefined keys
      const cleanKeys: SecureKeys = {};
      if (keys.elevenLabsApiKey) cleanKeys.elevenLabsApiKey = keys.elevenLabsApiKey;
      if (keys.openaiApiKey) cleanKeys.openaiApiKey = keys.openaiApiKey;

      // If no keys to save, remove the file
      if (Object.keys(cleanKeys).length === 0) {
        if (fs.existsSync(this.secureKeysPath)) {
          fs.unlinkSync(this.secureKeysPath);
        }
        return;
      }

      const jsonString = JSON.stringify(cleanKeys);

      if (!safeStorage.isEncryptionAvailable()) {
        console.warn('[VoiceSettingsManager] Encryption not available, storing API keys in plain text');
        fs.writeFileSync(this.secureKeysPath, jsonString);
        return;
      }

      const encryptedBuffer = safeStorage.encryptString(jsonString);
      fs.writeFileSync(this.secureKeysPath, encryptedBuffer);
    } catch (error) {
      console.error('[VoiceSettingsManager] Failed to save secure keys:', error);
      throw error;
    }
  }
}
