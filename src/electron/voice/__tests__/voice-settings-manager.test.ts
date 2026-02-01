/**
 * Tests for VoiceSettingsManager
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { app, safeStorage } from 'electron';
import { VoiceSettingsManager } from '../voice-settings-manager';
import { DEFAULT_VOICE_SETTINGS, VoiceSettings } from '../../../shared/types';

// Mock electron modules
vi.mock('electron', () => ({
  app: {
    getPath: vi.fn().mockReturnValue('/mock/user/data'),
  },
  safeStorage: {
    isEncryptionAvailable: vi.fn().mockReturnValue(true),
    encryptString: vi.fn((str: string) => Buffer.from(`encrypted:${str}`)),
    decryptString: vi.fn((buffer: Buffer) => {
      const str = buffer.toString();
      return str.replace('encrypted:', '');
    }),
  },
}));

// Mock fs module
vi.mock('fs', () => ({
  existsSync: vi.fn(),
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
  unlinkSync: vi.fn(),
}));

describe('VoiceSettingsManager', () => {
  const mockUserDataPath = '/mock/user/data';
  const settingsPath = path.join(mockUserDataPath, 'voice-settings.json');
  const secureKeysPath = path.join(mockUserDataPath, 'voice-keys.enc');

  beforeEach(() => {
    vi.clearAllMocks();
    // Reset cached settings
    VoiceSettingsManager.clearCache();
    // Initialize the manager
    VoiceSettingsManager.initialize();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('initialize', () => {
    it('should set the settings path', () => {
      VoiceSettingsManager.initialize();
      expect(app.getPath).toHaveBeenCalledWith('userData');
    });
  });

  describe('loadSettings', () => {
    it('should return default settings when no file exists', () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);

      const settings = VoiceSettingsManager.loadSettings();

      expect(settings).toEqual(DEFAULT_VOICE_SETTINGS);
    });

    it('should load settings from file', () => {
      vi.mocked(fs.existsSync).mockImplementation((p) => {
        return p === settingsPath;
      });
      vi.mocked(fs.readFileSync).mockReturnValue(
        JSON.stringify({
          enabled: true,
          ttsProvider: 'openai',
          volume: 75,
        })
      );

      const settings = VoiceSettingsManager.loadSettings();

      expect(settings.enabled).toBe(true);
      expect(settings.ttsProvider).toBe('openai');
      expect(settings.volume).toBe(75);
    });

    it('should merge with defaults for missing fields', () => {
      vi.mocked(fs.existsSync).mockImplementation((p) => p === settingsPath);
      vi.mocked(fs.readFileSync).mockReturnValue(
        JSON.stringify({
          enabled: true,
        })
      );

      const settings = VoiceSettingsManager.loadSettings();

      expect(settings.enabled).toBe(true);
      // Should have default values for missing fields
      expect(settings.ttsProvider).toBe(DEFAULT_VOICE_SETTINGS.ttsProvider);
      expect(settings.volume).toBe(DEFAULT_VOICE_SETTINGS.volume);
    });

    it('should load secure API keys', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockImplementation((p) => {
        if (p === settingsPath) {
          return JSON.stringify({ enabled: true });
        }
        if (p === secureKeysPath) {
          return Buffer.from('encrypted:{"elevenLabsApiKey":"secret-key"}');
        }
        return '';
      });

      const settings = VoiceSettingsManager.loadSettings();

      expect(settings.elevenLabsApiKey).toBe('secret-key');
    });

    it('should cache loaded settings', () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);

      VoiceSettingsManager.loadSettings();
      const callsBefore = vi.mocked(fs.existsSync).mock.calls.length;
      VoiceSettingsManager.loadSettings();
      const callsAfter = vi.mocked(fs.existsSync).mock.calls.length;

      // Should not call existsSync again (cached)
      expect(callsAfter).toBe(callsBefore);
    });

    it('should return defaults on read error', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockImplementation(() => {
        throw new Error('Read error');
      });

      const settings = VoiceSettingsManager.loadSettings();

      expect(settings).toEqual(DEFAULT_VOICE_SETTINGS);
    });
  });

  describe('saveSettings', () => {
    it('should save settings to file', () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);

      const settings: VoiceSettings = {
        ...DEFAULT_VOICE_SETTINGS,
        enabled: true,
        volume: 80,
      };

      VoiceSettingsManager.saveSettings(settings);

      expect(fs.writeFileSync).toHaveBeenCalled();
      const writtenContent = vi.mocked(fs.writeFileSync).mock.calls[0][1];
      const parsed = JSON.parse(writtenContent as string);
      expect(parsed.enabled).toBe(true);
      expect(parsed.volume).toBe(80);
    });

    it('should validate settings before saving', () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);

      const invalidSettings = {
        ...DEFAULT_VOICE_SETTINGS,
        volume: 200, // Invalid - should be clamped to 100
        speechRate: 5, // Invalid - should be clamped to 2.0
      };

      VoiceSettingsManager.saveSettings(invalidSettings);

      const writtenContent = vi.mocked(fs.writeFileSync).mock.calls[0][1];
      const parsed = JSON.parse(writtenContent as string);
      expect(parsed.volume).toBe(100);
      expect(parsed.speechRate).toBe(2.0);
    });

    it('should store API keys securely', () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);

      const settings: VoiceSettings = {
        ...DEFAULT_VOICE_SETTINGS,
        elevenLabsApiKey: 'secret-api-key',
      };

      VoiceSettingsManager.saveSettings(settings);

      // API key should not be in the main settings file
      const mainContent = vi.mocked(fs.writeFileSync).mock.calls[0][1];
      expect(mainContent).not.toContain('secret-api-key');

      // API key should be in secure storage
      expect(safeStorage.encryptString).toHaveBeenCalled();
    });

    it('should update cache after saving', () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);

      const settings: VoiceSettings = {
        ...DEFAULT_VOICE_SETTINGS,
        enabled: true,
      };

      VoiceSettingsManager.saveSettings(settings);
      VoiceSettingsManager.clearCache();
      vi.mocked(fs.existsSync).mockImplementation((p) => p === settingsPath);
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({ enabled: true }));

      const loaded = VoiceSettingsManager.loadSettings();
      expect(loaded.enabled).toBe(true);
    });
  });

  describe('updateSettings', () => {
    it('should merge partial settings with existing', () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);

      VoiceSettingsManager.updateSettings({ enabled: true });

      const writtenContent = vi.mocked(fs.writeFileSync).mock.calls[0][1];
      const parsed = JSON.parse(writtenContent as string);
      expect(parsed.enabled).toBe(true);
      // Should preserve default values
      expect(parsed.ttsProvider).toBe(DEFAULT_VOICE_SETTINGS.ttsProvider);
    });

    it('should return updated settings', () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);

      const updated = VoiceSettingsManager.updateSettings({ volume: 90 });

      expect(updated.volume).toBe(90);
    });
  });

  describe('clearCache', () => {
    it('should clear the cached settings', () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);

      VoiceSettingsManager.loadSettings();
      const callsBeforeClear = vi.mocked(fs.existsSync).mock.calls.length;
      VoiceSettingsManager.clearCache();
      VoiceSettingsManager.loadSettings();
      const callsAfterReload = vi.mocked(fs.existsSync).mock.calls.length;

      // Should have more calls after clearing cache and reloading
      expect(callsAfterReload).toBeGreaterThan(callsBeforeClear);
    });
  });

  describe('resetSettings', () => {
    it('should delete settings files', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);

      VoiceSettingsManager.resetSettings();

      expect(fs.unlinkSync).toHaveBeenCalledTimes(2);
    });

    it('should clear cache', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);

      VoiceSettingsManager.loadSettings();
      const callsAfterFirstLoad = vi.mocked(fs.existsSync).mock.calls.length;
      VoiceSettingsManager.resetSettings();
      vi.mocked(fs.existsSync).mockReturnValue(false);
      VoiceSettingsManager.loadSettings();
      const callsAfterReload = vi.mocked(fs.existsSync).mock.calls.length;

      // Cache was cleared, so there should be more calls
      expect(callsAfterReload).toBeGreaterThan(callsAfterFirstLoad);
    });
  });

  describe('hasElevenLabsKey', () => {
    it('should return true when key is configured', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockImplementation((p) => {
        if (p === secureKeysPath) {
          return Buffer.from('encrypted:{"elevenLabsApiKey":"key"}');
        }
        return JSON.stringify({});
      });

      expect(VoiceSettingsManager.hasElevenLabsKey()).toBe(true);
    });

    it('should return false when key is not configured', () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);

      expect(VoiceSettingsManager.hasElevenLabsKey()).toBe(false);
    });
  });

  describe('hasOpenAIKey', () => {
    it('should return true when key is configured', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockImplementation((p) => {
        if (p === secureKeysPath) {
          return Buffer.from('encrypted:{"openaiApiKey":"key"}');
        }
        return JSON.stringify({});
      });

      expect(VoiceSettingsManager.hasOpenAIKey()).toBe(true);
    });

    it('should return false when key is not configured', () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);

      expect(VoiceSettingsManager.hasOpenAIKey()).toBe(false);
    });
  });

  describe('validation', () => {
    it('should validate ttsProvider', () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);

      const settings = {
        ...DEFAULT_VOICE_SETTINGS,
        ttsProvider: 'invalid' as any,
      };

      VoiceSettingsManager.saveSettings(settings);

      const writtenContent = vi.mocked(fs.writeFileSync).mock.calls[0][1];
      const parsed = JSON.parse(writtenContent as string);
      expect(parsed.ttsProvider).toBe(DEFAULT_VOICE_SETTINGS.ttsProvider);
    });

    it('should validate inputMode', () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);

      const settings = {
        ...DEFAULT_VOICE_SETTINGS,
        inputMode: 'invalid' as any,
      };

      VoiceSettingsManager.saveSettings(settings);

      const writtenContent = vi.mocked(fs.writeFileSync).mock.calls[0][1];
      const parsed = JSON.parse(writtenContent as string);
      expect(parsed.inputMode).toBe(DEFAULT_VOICE_SETTINGS.inputMode);
    });

    it('should clamp volume to 0-100', () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);

      VoiceSettingsManager.saveSettings({
        ...DEFAULT_VOICE_SETTINGS,
        volume: -10,
      });

      let parsed = JSON.parse(vi.mocked(fs.writeFileSync).mock.calls[0][1] as string);
      expect(parsed.volume).toBe(0);

      vi.mocked(fs.writeFileSync).mockClear();

      VoiceSettingsManager.saveSettings({
        ...DEFAULT_VOICE_SETTINGS,
        volume: 150,
      });

      parsed = JSON.parse(vi.mocked(fs.writeFileSync).mock.calls[0][1] as string);
      expect(parsed.volume).toBe(100);
    });

    it('should clamp speechRate to 0.5-2.0', () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);

      VoiceSettingsManager.saveSettings({
        ...DEFAULT_VOICE_SETTINGS,
        speechRate: 0.1,
      });

      let parsed = JSON.parse(vi.mocked(fs.writeFileSync).mock.calls[0][1] as string);
      expect(parsed.speechRate).toBe(0.5);

      vi.mocked(fs.writeFileSync).mockClear();

      VoiceSettingsManager.saveSettings({
        ...DEFAULT_VOICE_SETTINGS,
        speechRate: 3.0,
      });

      parsed = JSON.parse(vi.mocked(fs.writeFileSync).mock.calls[0][1] as string);
      expect(parsed.speechRate).toBe(2.0);
    });
  });

  describe('encryption fallback', () => {
    it('should fall back to plain text when encryption unavailable', () => {
      vi.mocked(safeStorage.isEncryptionAvailable).mockReturnValue(false);
      vi.mocked(fs.existsSync).mockReturnValue(false);

      const settings: VoiceSettings = {
        ...DEFAULT_VOICE_SETTINGS,
        elevenLabsApiKey: 'test-key',
      };

      VoiceSettingsManager.saveSettings(settings);

      // Should still save the secure keys file
      expect(fs.writeFileSync).toHaveBeenCalledTimes(2);
    });
  });
});
