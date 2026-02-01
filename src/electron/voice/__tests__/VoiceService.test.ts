/**
 * Tests for VoiceService
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { VoiceService, getVoiceService, resetVoiceService } from '../VoiceService';
import { DEFAULT_VOICE_SETTINGS } from '../../../shared/types';

// Mock fetch for API calls
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Mock window.speechSynthesis for local TTS
const mockSpeechSynthesis = {
  speak: vi.fn((utterance: any) => {
    // Simulate async completion
    setTimeout(() => {
      if (utterance.onend) utterance.onend();
    }, 10);
  }),
  cancel: vi.fn(),
  getVoices: vi.fn().mockReturnValue([]),
};

// Mock SpeechSynthesisUtterance
class MockSpeechSynthesisUtterance {
  text = '';
  lang = '';
  rate = 1;
  volume = 1;
  onend: (() => void) | null = null;
  onerror: ((event: any) => void) | null = null;
  constructor(text?: string) {
    this.text = text || '';
  }
}
// @ts-expect-error Mock class
global.SpeechSynthesisUtterance = MockSpeechSynthesisUtterance;

// @ts-expect-error Mock window for speechSynthesis
global.window = {
  speechSynthesis: mockSpeechSynthesis,
};

// Mock AudioContext instance methods
const mockDecodeAudioData = vi.fn().mockResolvedValue({
  duration: 1,
  numberOfChannels: 1,
  sampleRate: 44100,
});

const mockCreateGain = vi.fn().mockReturnValue({
  gain: { value: 1 },
  connect: vi.fn(),
});

const mockSourceNode = {
  buffer: null,
  connect: vi.fn(),
  start: vi.fn(),
  stop: vi.fn(),
  onended: null as (() => void) | null,
};

const mockCreateBufferSource = vi.fn().mockReturnValue(mockSourceNode);
const mockResume = vi.fn().mockResolvedValue(undefined);
const mockClose = vi.fn();

// Create a proper mock AudioContext class
class MockAudioContext {
  state = 'running';
  destination = {};
  resume = mockResume;
  close = mockClose;
  decodeAudioData = mockDecodeAudioData;
  createGain = mockCreateGain;
  createBufferSource = mockCreateBufferSource;
}

// @ts-expect-error Mock AudioContext
global.AudioContext = MockAudioContext;

// Mock Blob
global.Blob = vi.fn().mockImplementation((parts, options) => ({
  parts,
  type: options?.type || '',
  size: parts.reduce((acc: number, part: any) => acc + (part.byteLength || part.length || 0), 0),
}));

// Mock FormData
class MockFormData {
  private data = new Map<string, any>();
  append(key: string, value: any, _filename?: string) {
    this.data.set(key, value);
  }
  get(key: string) {
    return this.data.get(key);
  }
}
// @ts-expect-error Mock FormData
global.FormData = MockFormData;

describe('VoiceService', () => {
  let service: VoiceService;

  beforeEach(() => {
    vi.clearAllMocks();
    resetVoiceService();
    service = new VoiceService();
  });

  afterEach(() => {
    service.dispose();
  });

  describe('constructor', () => {
    it('should create with default settings', () => {
      expect(service.getSettings()).toEqual(DEFAULT_VOICE_SETTINGS);
    });

    it('should create with custom settings', () => {
      const customService = new VoiceService({
        settings: {
          enabled: true,
          volume: 50,
        },
      });
      const settings = customService.getSettings();
      expect(settings.enabled).toBe(true);
      expect(settings.volume).toBe(50);
      customService.dispose();
    });

    it('should register onStateChange callback', () => {
      const callback = vi.fn();
      const serviceWithCallback = new VoiceService({ onStateChange: callback });

      // Trigger a state change
      serviceWithCallback.updateSettings({ enabled: true });

      expect(callback).toHaveBeenCalled();
      serviceWithCallback.dispose();
    });
  });

  describe('initialize', () => {
    it('should initialize without error', async () => {
      await expect(service.initialize()).resolves.not.toThrow();
    });

    it('should set isActive based on enabled setting', async () => {
      service.updateSettings({ enabled: true });
      await service.initialize();
      expect(service.getState().isActive).toBe(true);
    });

    it('should not be active when disabled', async () => {
      service.updateSettings({ enabled: false });
      await service.initialize();
      expect(service.getState().isActive).toBe(false);
    });
  });

  describe('updateSettings', () => {
    it('should update settings', () => {
      service.updateSettings({ volume: 75 });
      expect(service.getSettings().volume).toBe(75);
    });

    it('should emit settingsChange event', () => {
      const handler = vi.fn();
      service.on('settingsChange', handler);
      service.updateSettings({ speechRate: 1.5 });
      expect(handler).toHaveBeenCalledWith(expect.objectContaining({ speechRate: 1.5 }));
    });

    it('should update isActive when enabled changes', () => {
      service.updateSettings({ enabled: true });
      expect(service.getState().isActive).toBe(true);

      service.updateSettings({ enabled: false });
      expect(service.getState().isActive).toBe(false);
    });
  });

  describe('getState', () => {
    it('should return current state', () => {
      const state = service.getState();
      expect(state).toHaveProperty('isActive');
      expect(state).toHaveProperty('isListening');
      expect(state).toHaveProperty('isSpeaking');
      expect(state).toHaveProperty('isProcessing');
      expect(state).toHaveProperty('audioLevel');
    });

    it('should return a copy of the state', () => {
      const state1 = service.getState();
      const state2 = service.getState();
      expect(state1).not.toBe(state2);
      expect(state1).toEqual(state2);
    });
  });

  describe('speak', () => {
    it('should do nothing when disabled', async () => {
      service.updateSettings({ enabled: false });
      await service.speak('Hello');
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('should do nothing for empty text', async () => {
      service.updateSettings({ enabled: true });
      await service.speak('');
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('should do nothing for whitespace text', async () => {
      service.updateSettings({ enabled: true });
      await service.speak('   ');
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('should call ElevenLabs API when provider is elevenlabs', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        arrayBuffer: vi.fn().mockResolvedValue(new ArrayBuffer(1000)),
      });

      service.updateSettings({
        enabled: true,
        ttsProvider: 'elevenlabs',
        elevenLabsApiKey: 'test-api-key',
      });

      // Mock decodeAudioData to trigger onended
      mockDecodeAudioData.mockImplementation(async () => {
        setTimeout(() => {
          if (mockSourceNode.onended) mockSourceNode.onended();
        }, 10);
        return {
          duration: 1,
          numberOfChannels: 1,
          sampleRate: 44100,
        };
      });

      await service.speak('Hello');

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('api.elevenlabs.io'),
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'xi-api-key': 'test-api-key',
          }),
        })
      );
    });

    it('should throw when ElevenLabs API key is missing', async () => {
      service.updateSettings({
        enabled: true,
        ttsProvider: 'elevenlabs',
        elevenLabsApiKey: undefined,
      });

      await expect(service.speak('Hello')).rejects.toThrow('ElevenLabs API key not configured');
    });

    it('should call OpenAI API when provider is openai', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        arrayBuffer: vi.fn().mockResolvedValue(new ArrayBuffer(1000)),
      });

      service.updateSettings({
        enabled: true,
        ttsProvider: 'openai',
        openaiApiKey: 'test-openai-key',
      });

      mockDecodeAudioData.mockImplementation(async () => {
        setTimeout(() => {
          if (mockSourceNode.onended) mockSourceNode.onended();
        }, 10);
        return {
          duration: 1,
          numberOfChannels: 1,
          sampleRate: 44100,
        };
      });

      await service.speak('Hello');

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('api.openai.com'),
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            Authorization: 'Bearer test-openai-key',
          }),
        })
      );
    });

    it('should emit speakingStart and speakingEnd events', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        arrayBuffer: vi.fn().mockResolvedValue(new ArrayBuffer(1000)),
      });

      const startHandler = vi.fn();
      const endHandler = vi.fn();
      service.on('speakingStart', startHandler);
      service.on('speakingEnd', endHandler);

      service.updateSettings({
        enabled: true,
        ttsProvider: 'openai',
        openaiApiKey: 'test-key',
      });

      mockDecodeAudioData.mockImplementation(async () => {
        setTimeout(() => {
          if (mockSourceNode.onended) mockSourceNode.onended();
        }, 10);
        return {
          duration: 1,
          numberOfChannels: 1,
          sampleRate: 44100,
        };
      });

      await service.speak('Hello');

      expect(startHandler).toHaveBeenCalledWith('Hello');
      expect(endHandler).toHaveBeenCalled();
    });
  });

  describe('stopSpeaking', () => {
    it('should stop current audio', () => {
      service.stopSpeaking();
      expect(service.getState().isSpeaking).toBe(false);
    });

    it('should emit speakingEnd event', () => {
      const handler = vi.fn();
      service.on('speakingEnd', handler);
      service.stopSpeaking();
      expect(handler).toHaveBeenCalled();
    });
  });

  describe('getElevenLabsVoices', () => {
    it('should fetch voices from ElevenLabs API', async () => {
      const mockVoices = [
        { voice_id: 'voice-1', name: 'Voice 1' },
        { voice_id: 'voice-2', name: 'Voice 2' },
      ];

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: vi.fn().mockResolvedValue({ voices: mockVoices }),
      });

      service.updateSettings({ elevenLabsApiKey: 'test-key' });
      const voices = await service.getElevenLabsVoices();

      expect(voices).toEqual(mockVoices);
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('elevenlabs.io/v1/voices'),
        expect.objectContaining({
          headers: expect.objectContaining({
            'xi-api-key': 'test-key',
          }),
        })
      );
    });

    it('should throw when API key is missing', async () => {
      service.updateSettings({ elevenLabsApiKey: undefined });
      await expect(service.getElevenLabsVoices()).rejects.toThrow('ElevenLabs API key not configured');
    });
  });

  describe('testElevenLabsConnection', () => {
    it('should return success when voices are fetched', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: vi.fn().mockResolvedValue({ voices: [{ voice_id: '1' }, { voice_id: '2' }] }),
      });

      service.updateSettings({ elevenLabsApiKey: 'test-key' });
      const result = await service.testElevenLabsConnection();

      expect(result.success).toBe(true);
      expect(result.voiceCount).toBe(2);
    });

    it('should return error on failure', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        text: vi.fn().mockResolvedValue('Invalid API key'),
      });

      service.updateSettings({ elevenLabsApiKey: 'bad-key' });
      const result = await service.testElevenLabsConnection();

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  describe('testOpenAIConnection', () => {
    it('should return success when API responds', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        arrayBuffer: vi.fn().mockResolvedValue(new ArrayBuffer(100)),
      });

      service.updateSettings({ openaiApiKey: 'test-key' });
      const result = await service.testOpenAIConnection();

      expect(result.success).toBe(true);
    });

    it('should return error when API key is missing', async () => {
      service.updateSettings({ openaiApiKey: undefined });
      const result = await service.testOpenAIConnection();

      expect(result.success).toBe(false);
      expect(result.error).toContain('not configured');
    });
  });

  describe('dispose', () => {
    it('should clean up resources', () => {
      service.dispose();
      // Should not throw
    });

    it('should stop speaking when disposed', () => {
      const handler = vi.fn();
      service.on('speakingEnd', handler);
      service.dispose();
      expect(handler).toHaveBeenCalled();
    });
  });

  describe('singleton', () => {
    it('should return the same instance', () => {
      const instance1 = getVoiceService();
      const instance2 = getVoiceService();
      expect(instance1).toBe(instance2);
    });

    it('should create new instance after reset', () => {
      const instance1 = getVoiceService();
      resetVoiceService();
      const instance2 = getVoiceService();
      expect(instance1).not.toBe(instance2);
    });
  });
});

describe('VoiceService events', () => {
  let service: VoiceService;

  beforeEach(() => {
    resetVoiceService();
    service = new VoiceService();
  });

  afterEach(() => {
    service.dispose();
  });

  it('should emit stateChange on state updates', () => {
    const handler = vi.fn();
    service.on('stateChange', handler);

    service.updateSettings({ enabled: true });

    expect(handler).toHaveBeenCalledWith(expect.objectContaining({ isActive: true }));
  });

  it('should emit error event on API errors', async () => {
    const errorHandler = vi.fn();
    service.on('error', errorHandler);

    service.updateSettings({
      enabled: true,
      ttsProvider: 'elevenlabs',
      elevenLabsApiKey: 'test-key',
    });

    mockFetch.mockResolvedValueOnce({
      ok: false,
      text: vi.fn().mockResolvedValue('API Error'),
    });

    await expect(service.speak('Hello')).rejects.toThrow();
    expect(errorHandler).toHaveBeenCalled();
  });

  it('should clear error state on successful speak', async () => {
    service.updateSettings({
      enabled: true,
      ttsProvider: 'openai',
      openaiApiKey: 'test-key',
    });

    // First call fails
    mockFetch.mockResolvedValueOnce({
      ok: false,
      text: vi.fn().mockResolvedValue('API Error'),
    });
    await expect(service.speak('Hello')).rejects.toThrow();
    expect(service.getState().error).toBeDefined();

    // Second call succeeds
    mockFetch.mockResolvedValueOnce({
      ok: true,
      arrayBuffer: vi.fn().mockResolvedValue(new ArrayBuffer(8)),
    });
    mockDecodeAudioData.mockImplementation(async () => {
      setTimeout(() => {
        if (mockSourceNode.onended) mockSourceNode.onended();
      }, 10);
      return { duration: 1, numberOfChannels: 1, sampleRate: 44100 };
    });

    await service.speak('Hello again');
    // Error should be cleared (undefined)
    expect(service.getState().error).toBeUndefined();
  });
});

describe('VoiceService STT edge cases', () => {
  let service: VoiceService;

  // Create a mock blob for testing
  const createMockBlob = () => ({
    type: 'audio/webm',
    size: 100,
    arrayBuffer: vi.fn().mockResolvedValue(new ArrayBuffer(100)),
  } as unknown as Blob);

  beforeEach(() => {
    resetVoiceService();
    service = new VoiceService();
    vi.clearAllMocks();
  });

  afterEach(() => {
    service.dispose();
  });

  it('should throw descriptive error when sttProvider is elevenlabs without OpenAI key', async () => {
    service.updateSettings({
      enabled: true,
      sttProvider: 'elevenlabs',
      openaiApiKey: undefined,
    });

    const blob = createMockBlob();
    await expect(service.transcribe(blob)).rejects.toThrow(
      'ElevenLabs does not provide speech-to-text'
    );
  });

  it('should fallback to OpenAI Whisper when sttProvider is elevenlabs with OpenAI key', async () => {
    service.updateSettings({
      enabled: true,
      sttProvider: 'elevenlabs',
      openaiApiKey: 'test-openai-key',
      language: 'en-US',
    });

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: vi.fn().mockResolvedValue({ text: 'Transcribed text' }),
    });

    const blob = createMockBlob();
    const result = await service.transcribe(blob);

    expect(result).toBe('Transcribed text');
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('transcriptions'),
      expect.any(Object)
    );
  });
});
