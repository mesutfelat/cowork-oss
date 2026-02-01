/**
 * Voice Service - Text-to-Speech and Speech-to-Text
 *
 * Provides voice interaction capabilities using ElevenLabs for TTS
 * and OpenAI Whisper for STT.
 *
 * NOTE: This service runs in the Electron main process.
 * Audio playback must be handled by the renderer process.
 */

import { EventEmitter } from 'events';
import {
  VoiceSettings,
  VoiceState,
  ElevenLabsVoice,
  DEFAULT_VOICE_SETTINGS,
} from '../../shared/types';

// ElevenLabs API configuration
const ELEVENLABS_API_BASE = 'https://api.elevenlabs.io/v1';
const OPENAI_API_BASE = 'https://api.openai.com/v1';

// Default ElevenLabs voice (Rachel - conversational)
const DEFAULT_ELEVENLABS_VOICE_ID = '21m00Tcm4TlvDq8ikWAM';

export interface VoiceServiceOptions {
  settings?: Partial<VoiceSettings>;
  onStateChange?: (state: VoiceState) => void;
}

export class VoiceService extends EventEmitter {
  private settings: VoiceSettings;
  private state: VoiceState;

  constructor(options: VoiceServiceOptions = {}) {
    super();
    this.settings = { ...DEFAULT_VOICE_SETTINGS, ...options.settings };
    this.state = {
      isActive: false,
      isListening: false,
      isSpeaking: false,
      isProcessing: false,
      audioLevel: 0,
    };

    if (options.onStateChange) {
      this.on('stateChange', options.onStateChange);
    }
  }

  /**
   * Initialize the voice service
   */
  async initialize(): Promise<void> {
    console.log('[VoiceService] Initializing...');
    this.updateState({ isActive: this.settings.enabled });
    console.log('[VoiceService] Initialized with settings:', {
      enabled: this.settings.enabled,
      ttsProvider: this.settings.ttsProvider,
      sttProvider: this.settings.sttProvider,
    });
  }

  /**
   * Update settings
   */
  updateSettings(settings: Partial<VoiceSettings>): void {
    this.settings = { ...this.settings, ...settings };
    this.updateState({ isActive: this.settings.enabled });
    this.emit('settingsChange', this.settings);
  }

  /**
   * Get current settings
   */
  getSettings(): VoiceSettings {
    return { ...this.settings };
  }

  /**
   * Get current state
   */
  getState(): VoiceState {
    return { ...this.state };
  }

  /**
   * Text-to-Speech: Convert text to audio data
   * Returns audio data as Buffer for the renderer to play
   */
  async speak(text: string): Promise<Buffer | null> {
    if (!this.settings.enabled) {
      console.log('[VoiceService] Voice mode disabled, skipping TTS');
      return null;
    }

    if (!text || text.trim().length === 0) {
      return null;
    }

    console.log('[VoiceService] Generating TTS:', text.substring(0, 100) + (text.length > 100 ? '...' : ''));

    try {
      // Clear any previous error
      this.updateState({ isSpeaking: true, isProcessing: true, error: undefined });
      this.emit('speakingStart', text);

      let audioBuffer: ArrayBuffer;

      switch (this.settings.ttsProvider) {
        case 'elevenlabs':
          audioBuffer = await this.elevenLabsTTS(text);
          break;
        case 'openai':
          audioBuffer = await this.openaiTTS(text);
          break;
        case 'local':
          // Local TTS requires browser APIs - not available in main process
          throw new Error('Local TTS is not available in the main process. Please use ElevenLabs or OpenAI.');
        default:
          throw new Error(`Unknown TTS provider: ${this.settings.ttsProvider}`);
      }

      this.updateState({ isProcessing: false });

      // Return audio data as Buffer for renderer to play
      return Buffer.from(audioBuffer);
    } catch (error) {
      console.error('[VoiceService] TTS error:', error);
      this.updateState({ error: (error as Error).message, isSpeaking: false, isProcessing: false });
      this.emit('error', error);
      throw error;
    }
  }

  /**
   * Mark speaking as finished (called by renderer after audio playback)
   */
  finishSpeaking(): void {
    this.updateState({ isSpeaking: false });
    this.emit('speakingEnd');
  }

  /**
   * Stop current speech
   */
  stopSpeaking(): void {
    this.updateState({ isSpeaking: false });
    this.emit('speakingEnd');
  }

  /**
   * Speech-to-Text: Transcribe audio to text
   * Accepts audio data as Buffer from the renderer
   */
  async transcribe(audioData: Buffer): Promise<string> {
    if (!this.settings.enabled) {
      throw new Error('Voice mode is disabled');
    }

    console.log('[VoiceService] Transcribing audio...');
    // Clear any previous error
    this.updateState({ isProcessing: true, error: undefined });

    try {
      let transcript: string;

      switch (this.settings.sttProvider) {
        case 'openai':
          transcript = await this.openaiSTT(audioData);
          break;
        case 'local':
          // Local STT requires browser APIs - not available in main process
          throw new Error('Local STT is not available in the main process. Please use OpenAI Whisper.');
        case 'elevenlabs':
          // ElevenLabs doesn't have an STT API - redirect to OpenAI if key available
          if (this.settings.openaiApiKey) {
            transcript = await this.openaiSTT(audioData);
          } else {
            throw new Error('ElevenLabs does not provide speech-to-text. Please use OpenAI Whisper or configure an OpenAI API key.');
          }
          break;
        default:
          throw new Error(`Unknown STT provider: ${this.settings.sttProvider}`);
      }

      this.emit('transcript', transcript);
      return transcript;
    } catch (error) {
      console.error('[VoiceService] STT error:', error);
      this.updateState({ error: (error as Error).message });
      this.emit('error', error);
      throw error;
    } finally {
      this.updateState({ isProcessing: false });
    }
  }

  /**
   * Get available ElevenLabs voices
   */
  async getElevenLabsVoices(): Promise<ElevenLabsVoice[]> {
    const apiKey = this.settings.elevenLabsApiKey;
    if (!apiKey) {
      throw new Error('ElevenLabs API key not configured');
    }

    const response = await fetch(`${ELEVENLABS_API_BASE}/voices`, {
      headers: {
        'xi-api-key': apiKey,
      },
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to fetch voices: ${error}`);
    }

    const data = await response.json() as { voices?: ElevenLabsVoice[] };
    return data.voices || [];
  }

  /**
   * Test ElevenLabs connection
   */
  async testElevenLabsConnection(): Promise<{ success: boolean; voiceCount?: number; error?: string }> {
    try {
      const voices = await this.getElevenLabsVoices();
      return { success: true, voiceCount: voices.length };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  }

  /**
   * Test OpenAI voice connection
   */
  async testOpenAIConnection(): Promise<{ success: boolean; error?: string }> {
    const apiKey = this.settings.openaiApiKey;
    if (!apiKey) {
      return { success: false, error: 'OpenAI API key not configured' };
    }

    try {
      // Test with a minimal TTS request
      const response = await fetch(`${OPENAI_API_BASE}/audio/speech`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'tts-1',
          input: 'Test',
          voice: 'alloy',
        }),
      });

      if (!response.ok) {
        const error = await response.text();
        return { success: false, error };
      }

      return { success: true };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  }

  /**
   * Cleanup resources
   */
  dispose(): void {
    this.stopSpeaking();
    this.removeAllListeners();
  }

  // ============ Private Methods ============

  private updateState(partial: Partial<VoiceState>): void {
    this.state = { ...this.state, ...partial };
    this.emit('stateChange', this.state);
  }

  /**
   * ElevenLabs Text-to-Speech
   */
  private async elevenLabsTTS(text: string): Promise<ArrayBuffer> {
    const apiKey = this.settings.elevenLabsApiKey;
    if (!apiKey) {
      throw new Error('ElevenLabs API key not configured');
    }

    const voiceId = this.settings.elevenLabsVoiceId || DEFAULT_ELEVENLABS_VOICE_ID;

    const response = await fetch(`${ELEVENLABS_API_BASE}/text-to-speech/${voiceId}`, {
      method: 'POST',
      headers: {
        'Accept': 'audio/mpeg',
        'xi-api-key': apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        text,
        model_id: 'eleven_monolingual_v1',
        voice_settings: {
          stability: 0.5,
          similarity_boost: 0.75,
          style: 0.0,
          use_speaker_boost: true,
        },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`ElevenLabs TTS failed: ${errorText}`);
    }

    return response.arrayBuffer();
  }

  /**
   * OpenAI Text-to-Speech
   */
  private async openaiTTS(text: string): Promise<ArrayBuffer> {
    const apiKey = this.settings.openaiApiKey;
    if (!apiKey) {
      throw new Error('OpenAI API key not configured');
    }

    const voice = this.settings.openaiVoice || 'nova';

    const response = await fetch(`${OPENAI_API_BASE}/audio/speech`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'tts-1',
        input: text,
        voice,
        speed: this.settings.speechRate,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`OpenAI TTS failed: ${errorText}`);
    }

    return response.arrayBuffer();
  }

  /**
   * OpenAI Whisper Speech-to-Text
   */
  private async openaiSTT(audioData: Buffer): Promise<string> {
    const apiKey = this.settings.openaiApiKey;
    if (!apiKey) {
      throw new Error('OpenAI API key not configured');
    }

    // Create a Blob-like object for Node.js fetch
    // Convert Buffer to Uint8Array for BlobPart compatibility
    const uint8Array = new Uint8Array(audioData.buffer as ArrayBuffer, audioData.byteOffset, audioData.byteLength);
    const blob = new Blob([uint8Array], { type: 'audio/webm' });

    const formData = new FormData();
    formData.append('file', blob, 'audio.webm');
    formData.append('model', 'whisper-1');
    formData.append('language', this.settings.language.split('-')[0]); // e.g., 'en' from 'en-US'

    const response = await fetch(`${OPENAI_API_BASE}/audio/transcriptions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
      },
      body: formData,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`OpenAI STT failed: ${errorText}`);
    }

    const data = await response.json() as { text: string };
    return data.text;
  }
}

// Singleton instance
let voiceServiceInstance: VoiceService | null = null;

/**
 * Get or create the VoiceService singleton
 */
export function getVoiceService(options?: VoiceServiceOptions): VoiceService {
  if (!voiceServiceInstance) {
    voiceServiceInstance = new VoiceService(options);
  }
  return voiceServiceInstance;
}

/**
 * Reset the VoiceService singleton (for testing)
 */
export function resetVoiceService(): void {
  if (voiceServiceInstance) {
    voiceServiceInstance.dispose();
    voiceServiceInstance = null;
  }
}
