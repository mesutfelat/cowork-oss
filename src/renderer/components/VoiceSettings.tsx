import { useState, useEffect } from 'react';
import {
  VoiceSettings as VoiceSettingsType,
  VoiceProvider,
  VoiceInputMode,
  VoiceResponseMode,
  VoiceState,
  ElevenLabsVoice,
  OPENAI_VOICES,
  VOICE_LANGUAGES,
  DEFAULT_VOICE_SETTINGS,
} from '../../shared/types';

interface VoiceSettingsProps {
  onStateChange?: (state: VoiceState) => void;
}

export function VoiceSettings({ onStateChange }: VoiceSettingsProps) {
  const [settings, setSettings] = useState<VoiceSettingsType>(DEFAULT_VOICE_SETTINGS);
  const [voiceState, setVoiceState] = useState<VoiceState>({
    isActive: false,
    isListening: false,
    isSpeaking: false,
    isProcessing: false,
    audioLevel: 0,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [elevenLabsVoices, setElevenLabsVoices] = useState<ElevenLabsVoice[]>([]);
  const [loadingVoices, setLoadingVoices] = useState(false);

  // Test connection states
  const [testingElevenLabs, setTestingElevenLabs] = useState(false);
  const [elevenLabsTestResult, setElevenLabsTestResult] = useState<{
    success: boolean;
    message: string;
  } | null>(null);
  const [testingOpenAI, setTestingOpenAI] = useState(false);
  const [openAITestResult, setOpenAITestResult] = useState<{
    success: boolean;
    message: string;
  } | null>(null);

  // Test speech state
  const [testingSpeech, setTestingSpeech] = useState(false);

  useEffect(() => {
    loadSettings();

    // Subscribe to voice events
    const unsubscribe = window.electronAPI.onVoiceEvent((event) => {
      if (event.type === 'voice:state-changed') {
        const newState = event.data as VoiceState;
        setVoiceState(newState);
        onStateChange?.(newState);
      }
    });

    return () => {
      unsubscribe();
    };
  }, [onStateChange]);

  const loadSettings = async () => {
    try {
      setLoading(true);
      const loaded = await window.electronAPI.getVoiceSettings();
      setSettings(loaded);

      // Load ElevenLabs voices if API key is configured
      if (loaded.elevenLabsApiKey) {
        await loadElevenLabsVoices();
      }
    } catch (error) {
      console.error('Failed to load voice settings:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadElevenLabsVoices = async () => {
    try {
      setLoadingVoices(true);
      const voices = await window.electronAPI.getElevenLabsVoices();
      setElevenLabsVoices(voices);
    } catch (error) {
      console.error('Failed to load ElevenLabs voices:', error);
    } finally {
      setLoadingVoices(false);
    }
  };

  const saveSettings = async (newSettings: Partial<VoiceSettingsType>) => {
    try {
      setSaving(true);
      const updated = await window.electronAPI.saveVoiceSettings(newSettings);
      setSettings(updated);
    } catch (error) {
      console.error('Failed to save voice settings:', error);
    } finally {
      setSaving(false);
    }
  };

  const handleToggleEnabled = async () => {
    await saveSettings({ enabled: !settings.enabled });
  };

  const handleTTSProviderChange = async (provider: VoiceProvider) => {
    await saveSettings({ ttsProvider: provider });
  };

  const handleSTTProviderChange = async (provider: VoiceProvider) => {
    await saveSettings({ sttProvider: provider });
  };

  const handleElevenLabsApiKeyChange = async (apiKey: string) => {
    await saveSettings({ elevenLabsApiKey: apiKey });
    if (apiKey) {
      await loadElevenLabsVoices();
    } else {
      setElevenLabsVoices([]);
    }
  };

  const handleOpenAIApiKeyChange = async (apiKey: string) => {
    await saveSettings({ openaiApiKey: apiKey });
  };

  const handleVoiceChange = async (voiceId: string) => {
    if (settings.ttsProvider === 'elevenlabs') {
      await saveSettings({ elevenLabsVoiceId: voiceId });
    } else if (settings.ttsProvider === 'openai') {
      await saveSettings({
        openaiVoice: voiceId as 'alloy' | 'echo' | 'fable' | 'onyx' | 'nova' | 'shimmer',
      });
    }
  };

  const handleInputModeChange = async (mode: VoiceInputMode) => {
    await saveSettings({ inputMode: mode });
  };

  const handleResponseModeChange = async (mode: VoiceResponseMode) => {
    await saveSettings({ responseMode: mode });
  };

  const handleVolumeChange = async (volume: number) => {
    await saveSettings({ volume });
  };

  const handleSpeechRateChange = async (rate: number) => {
    await saveSettings({ speechRate: rate });
  };

  const handleLanguageChange = async (language: string) => {
    await saveSettings({ language });
  };

  const handleTestElevenLabs = async () => {
    setTestingElevenLabs(true);
    setElevenLabsTestResult(null);
    try {
      const result = await window.electronAPI.testElevenLabsConnection();
      setElevenLabsTestResult({
        success: result.success,
        message: result.success
          ? `Connected! Found ${result.voiceCount} voices.`
          : result.error || 'Connection failed',
      });
    } catch (error: any) {
      setElevenLabsTestResult({
        success: false,
        message: error.message || 'Connection failed',
      });
    } finally {
      setTestingElevenLabs(false);
    }
  };

  const handleTestOpenAI = async () => {
    setTestingOpenAI(true);
    setOpenAITestResult(null);
    try {
      const result = await window.electronAPI.testOpenAIVoiceConnection();
      setOpenAITestResult({
        success: result.success,
        message: result.success ? 'Connected!' : result.error || 'Connection failed',
      });
    } catch (error: any) {
      setOpenAITestResult({
        success: false,
        message: error.message || 'Connection failed',
      });
    } finally {
      setTestingOpenAI(false);
    }
  };

  const handleTestSpeech = async () => {
    setTestingSpeech(true);
    try {
      await window.electronAPI.voiceSpeak('Hello! This is a test of the text to speech system.');
    } catch (error) {
      console.error('Test speech failed:', error);
    } finally {
      setTestingSpeech(false);
    }
  };

  const handleStopSpeaking = async () => {
    await window.electronAPI.voiceStopSpeaking();
    setTestingSpeech(false);
  };

  if (loading) {
    return <div className="settings-loading">Loading voice settings...</div>;
  }

  return (
    <div className="voice-settings">
      {/* Enable/Disable */}
      <div className="settings-section">
        <div className="settings-header-row">
          <div>
            <h3>Voice Mode</h3>
            <p className="settings-description">
              Enable hands-free interaction with text-to-speech and speech-to-text.
            </p>
          </div>
          <label className="toggle-switch">
            <input
              type="checkbox"
              checked={settings.enabled}
              onChange={handleToggleEnabled}
              disabled={saving}
            />
            <span className="toggle-slider" />
          </label>
        </div>

        {/* Status indicator */}
        {settings.enabled && (
          <div className={`voice-status ${voiceState.isActive ? 'active' : 'inactive'}`}>
            <span className="status-dot" />
            <span className="status-text">
              {voiceState.isSpeaking
                ? 'Speaking...'
                : voiceState.isListening
                ? 'Listening...'
                : voiceState.isProcessing
                ? 'Processing...'
                : voiceState.isActive
                ? 'Ready'
                : 'Inactive'}
            </span>
          </div>
        )}
      </div>

      {/* TTS Provider */}
      <div className="settings-section">
        <h4>Text-to-Speech Provider</h4>
        <p className="settings-description">Choose the voice synthesis provider.</p>
        <div className="provider-options">
          <button
            className={`provider-option ${settings.ttsProvider === 'elevenlabs' ? 'selected' : ''}`}
            onClick={() => handleTTSProviderChange('elevenlabs')}
            disabled={saving}
          >
            <span className="provider-name">ElevenLabs</span>
            <span className="provider-badge">Premium</span>
          </button>
          <button
            className={`provider-option ${settings.ttsProvider === 'openai' ? 'selected' : ''}`}
            onClick={() => handleTTSProviderChange('openai')}
            disabled={saving}
          >
            <span className="provider-name">OpenAI</span>
          </button>
          <button
            className={`provider-option ${settings.ttsProvider === 'local' ? 'selected' : ''}`}
            onClick={() => handleTTSProviderChange('local')}
            disabled={saving}
          >
            <span className="provider-name">System</span>
            <span className="provider-badge">Free</span>
          </button>
        </div>
      </div>

      {/* ElevenLabs Configuration */}
      {settings.ttsProvider === 'elevenlabs' && (
        <div className="settings-section">
          <h4>ElevenLabs Configuration</h4>

          <div className="settings-field">
            <label>API Key</label>
            <div className="input-with-button">
              <input
                type="password"
                className="settings-input"
                placeholder="Enter your ElevenLabs API key"
                value={settings.elevenLabsApiKey || ''}
                onChange={(e) => handleElevenLabsApiKeyChange(e.target.value)}
              />
              <button
                className="button-secondary"
                onClick={handleTestElevenLabs}
                disabled={testingElevenLabs || !settings.elevenLabsApiKey}
              >
                {testingElevenLabs ? 'Testing...' : 'Test'}
              </button>
            </div>
            <p className="settings-hint">
              Get your API key from{' '}
              <a
                href="https://elevenlabs.io/app/settings/api-keys"
                target="_blank"
                rel="noopener noreferrer"
              >
                ElevenLabs Dashboard
              </a>
            </p>
            {elevenLabsTestResult && (
              <div
                className={`test-result ${elevenLabsTestResult.success ? 'success' : 'error'}`}
              >
                {elevenLabsTestResult.message}
              </div>
            )}
          </div>

          <div className="settings-field">
            <label>Voice</label>
            <select
              className="settings-select"
              value={settings.elevenLabsVoiceId || ''}
              onChange={(e) => handleVoiceChange(e.target.value)}
              disabled={loadingVoices || elevenLabsVoices.length === 0}
            >
              <option value="">
                {loadingVoices
                  ? 'Loading voices...'
                  : elevenLabsVoices.length === 0
                  ? 'Enter API key to load voices'
                  : 'Select a voice'}
              </option>
              {elevenLabsVoices.map((voice) => (
                <option key={voice.voice_id} value={voice.voice_id}>
                  {voice.name}
                  {voice.category && ` (${voice.category})`}
                </option>
              ))}
            </select>
          </div>
        </div>
      )}

      {/* OpenAI Configuration - show when TTS or STT uses OpenAI */}
      {(settings.ttsProvider === 'openai' || settings.sttProvider === 'openai') && (
        <div className="settings-section">
          <h4>OpenAI Configuration</h4>

          <div className="settings-field">
            <label>API Key</label>
            <div className="input-with-button">
              <input
                type="password"
                className="settings-input"
                placeholder="Enter your OpenAI API key"
                value={settings.openaiApiKey || ''}
                onChange={(e) => handleOpenAIApiKeyChange(e.target.value)}
              />
              <button
                className="button-secondary"
                onClick={handleTestOpenAI}
                disabled={testingOpenAI}
              >
                {testingOpenAI ? 'Testing...' : 'Test'}
              </button>
            </div>
            <p className="settings-hint">
              Required for {settings.ttsProvider === 'openai' && settings.sttProvider === 'openai'
                ? 'TTS and STT'
                : settings.ttsProvider === 'openai'
                  ? 'TTS'
                  : 'STT (Whisper)'}.
            </p>
            {openAITestResult && (
              <div
                className={`test-result ${openAITestResult.success ? 'success' : 'error'}`}
              >
                {openAITestResult.message}
              </div>
            )}
          </div>

          {/* Voice selection only when using OpenAI for TTS */}
          {settings.ttsProvider === 'openai' && (
            <div className="settings-field">
              <label>Voice</label>
              <div className="voice-grid">
                {OPENAI_VOICES.map((voice) => (
                  <button
                    key={voice.id}
                    className={`voice-option ${settings.openaiVoice === voice.id ? 'selected' : ''}`}
                    onClick={() => handleVoiceChange(voice.id)}
                    title={voice.description}
                  >
                    <span className="voice-name">{voice.name}</span>
                    <span className="voice-description">{voice.description}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Speech-to-Text Provider */}
      <div className="settings-section">
        <h4>Speech-to-Text Provider</h4>
        <p className="settings-description">Choose the speech recognition provider.</p>
        <div className="provider-options">
          <button
            className={`provider-option ${settings.sttProvider === 'openai' ? 'selected' : ''}`}
            onClick={() => handleSTTProviderChange('openai')}
            disabled={saving}
          >
            <span className="provider-name">OpenAI Whisper</span>
            <span className="provider-badge">Recommended</span>
          </button>
          <button
            className={`provider-option ${settings.sttProvider === 'local' ? 'selected' : ''}`}
            onClick={() => handleSTTProviderChange('local')}
            disabled={saving}
          >
            <span className="provider-name">System</span>
            <span className="provider-badge">Free</span>
          </button>
        </div>
      </div>

      {/* Voice Input Mode */}
      <div className="settings-section">
        <h4>Voice Input Mode</h4>
        <div className="provider-options">
          <button
            className={`provider-option ${settings.inputMode === 'push_to_talk' ? 'selected' : ''}`}
            onClick={() => handleInputModeChange('push_to_talk')}
            disabled={saving}
          >
            <span className="provider-name">Push to Talk</span>
          </button>
          <button
            className={`provider-option ${settings.inputMode === 'voice_activity' ? 'selected' : ''}`}
            onClick={() => handleInputModeChange('voice_activity')}
            disabled={saving}
          >
            <span className="provider-name">Voice Activity</span>
          </button>
          <button
            className={`provider-option ${settings.inputMode === 'disabled' ? 'selected' : ''}`}
            onClick={() => handleInputModeChange('disabled')}
            disabled={saving}
          >
            <span className="provider-name">Disabled</span>
          </button>
        </div>
        <p className="settings-hint">
          {settings.inputMode === 'push_to_talk'
            ? `Hold ${settings.pushToTalkKey} to speak`
            : settings.inputMode === 'voice_activity'
            ? 'Automatically detects when you speak'
            : 'Voice input is disabled'}
        </p>
      </div>

      {/* Response Mode */}
      <div className="settings-section">
        <h4>Response Mode</h4>
        <p className="settings-description">When should responses be spoken aloud?</p>
        <select
          className="settings-select"
          value={settings.responseMode}
          onChange={(e) => handleResponseModeChange(e.target.value as VoiceResponseMode)}
          disabled={saving}
        >
          <option value="auto">Auto - All responses</option>
          <option value="smart">Smart - Only important responses</option>
          <option value="manual">Manual - Only when requested</option>
        </select>
      </div>

      {/* Volume and Speech Rate */}
      <div className="settings-section">
        <h4>Voice Settings</h4>

        <div className="settings-field">
          <label>Volume: {settings.volume}%</label>
          <input
            type="range"
            min="0"
            max="100"
            value={settings.volume}
            onChange={(e) => handleVolumeChange(parseInt(e.target.value))}
            className="settings-slider"
          />
        </div>

        <div className="settings-field">
          <label>Speech Rate: {settings.speechRate}x</label>
          <input
            type="range"
            min="0.5"
            max="2"
            step="0.1"
            value={settings.speechRate}
            onChange={(e) => handleSpeechRateChange(parseFloat(e.target.value))}
            className="settings-slider"
          />
        </div>
      </div>

      {/* Language */}
      <div className="settings-section">
        <h4>Language</h4>
        <select
          className="settings-select"
          value={settings.language}
          onChange={(e) => handleLanguageChange(e.target.value)}
          disabled={saving}
        >
          {VOICE_LANGUAGES.map((lang) => (
            <option key={lang.code} value={lang.code}>
              {lang.name}
            </option>
          ))}
        </select>
      </div>

      {/* Test Speech */}
      <div className="settings-section">
        <h4>Test Voice</h4>
        <p className="settings-description">Test the current voice configuration.</p>
        <div className="button-group">
          <button
            className="button-primary"
            onClick={handleTestSpeech}
            disabled={testingSpeech || !settings.enabled}
          >
            {testingSpeech ? 'Speaking...' : 'Test Speech'}
          </button>
          {(testingSpeech || voiceState.isSpeaking) && (
            <button className="button-secondary" onClick={handleStopSpeaking}>
              Stop
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
