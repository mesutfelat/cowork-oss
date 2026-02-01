import { useState, useEffect } from 'react';
import { VoiceState } from '../../shared/types';

interface VoiceIndicatorProps {
  /** Whether voice mode is enabled */
  enabled?: boolean;
  /** Position of the indicator */
  position?: 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left';
  /** Whether to show even when inactive */
  showWhenInactive?: boolean;
  /** Click handler */
  onClick?: () => void;
}

export function VoiceIndicator({
  enabled = false,
  position = 'bottom-right',
  showWhenInactive = false,
  onClick,
}: VoiceIndicatorProps) {
  const [voiceState, setVoiceState] = useState<VoiceState>({
    isActive: false,
    isListening: false,
    isSpeaking: false,
    isProcessing: false,
    audioLevel: 0,
  });

  useEffect(() => {
    if (!enabled) return;

    // Subscribe to voice events
    const unsubscribe = window.electronAPI.onVoiceEvent((event) => {
      if (event.type === 'voice:state-changed') {
        setVoiceState(event.data as VoiceState);
      }
    });

    // Get initial state
    window.electronAPI.getVoiceState().then(setVoiceState).catch(console.error);

    return () => {
      unsubscribe();
    };
  }, [enabled]);

  // Don't render if disabled and not showing when inactive
  if (!enabled && !showWhenInactive) {
    return null;
  }

  // Don't render if inactive and not showing when inactive
  if (!voiceState.isActive && !voiceState.isSpeaking && !voiceState.isListening && !showWhenInactive) {
    return null;
  }

  const getStatusText = () => {
    if (!enabled) return 'Voice Disabled';
    if (voiceState.isSpeaking) return 'Speaking';
    if (voiceState.isListening) return 'Listening';
    if (voiceState.isProcessing) return 'Processing';
    if (voiceState.isActive) return 'Voice Ready';
    return 'Voice Inactive';
  };

  const getStatusClass = () => {
    if (!enabled) return 'disabled';
    if (voiceState.isSpeaking) return 'speaking';
    if (voiceState.isListening) return 'listening';
    if (voiceState.isProcessing) return 'processing';
    if (voiceState.isActive) return 'active';
    return 'inactive';
  };

  return (
    <div
      className={`voice-indicator ${position} ${getStatusClass()}`}
      onClick={onClick}
      title={getStatusText()}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          onClick?.();
        }
      }}
    >
      {/* Icon */}
      <div className="voice-indicator-icon">
        {voiceState.isSpeaking ? (
          <SpeakingIcon audioLevel={voiceState.audioLevel} />
        ) : voiceState.isListening ? (
          <MicrophoneIcon audioLevel={voiceState.audioLevel} />
        ) : voiceState.isProcessing ? (
          <ProcessingIcon />
        ) : (
          <MicrophoneOffIcon />
        )}
      </div>

      {/* Pulse animation when active */}
      {(voiceState.isSpeaking || voiceState.isListening) && (
        <div className="voice-indicator-pulse" />
      )}

      {/* Partial transcript preview */}
      {voiceState.partialTranscript && (
        <div className="voice-indicator-transcript">
          {voiceState.partialTranscript}
        </div>
      )}
    </div>
  );
}

// SVG Icons
function MicrophoneIcon({ audioLevel = 0 }: { audioLevel?: number }) {
  const scale = 1 + (audioLevel / 100) * 0.2;
  return (
    <svg
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ transform: `scale(${scale})` }}
    >
      <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
      <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
      <line x1="12" y1="19" x2="12" y2="23" />
      <line x1="8" y1="23" x2="16" y2="23" />
    </svg>
  );
}

function MicrophoneOffIcon() {
  return (
    <svg
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <line x1="1" y1="1" x2="23" y2="23" />
      <path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6" />
      <path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23" />
      <line x1="12" y1="19" x2="12" y2="23" />
      <line x1="8" y1="23" x2="16" y2="23" />
    </svg>
  );
}

function SpeakingIcon({ audioLevel = 0 }: { audioLevel?: number }) {
  const wave1Height = 4 + (audioLevel / 100) * 6;
  const wave2Height = 8 + (audioLevel / 100) * 4;
  const wave3Height = 4 + (audioLevel / 100) * 6;

  return (
    <svg
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
      <line x1="15" y1={12 - wave1Height / 2} x2="15" y2={12 + wave1Height / 2} />
      <line x1="18" y1={12 - wave2Height / 2} x2="18" y2={12 + wave2Height / 2} />
      <line x1="21" y1={12 - wave3Height / 2} x2="21" y2={12 + wave3Height / 2} />
    </svg>
  );
}

function ProcessingIcon() {
  return (
    <svg
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="processing-spin"
    >
      <circle cx="12" cy="12" r="10" />
      <path d="M12 6v6l4 2" />
    </svg>
  );
}

// Mini version for status bar
export function VoiceIndicatorMini({
  enabled = false,
  onClick,
}: {
  enabled?: boolean;
  onClick?: () => void;
}) {
  const [voiceState, setVoiceState] = useState<VoiceState>({
    isActive: false,
    isListening: false,
    isSpeaking: false,
    isProcessing: false,
    audioLevel: 0,
  });

  useEffect(() => {
    if (!enabled) return;

    const unsubscribe = window.electronAPI.onVoiceEvent((event) => {
      if (event.type === 'voice:state-changed') {
        setVoiceState(event.data as VoiceState);
      }
    });

    window.electronAPI.getVoiceState().then(setVoiceState).catch(console.error);

    return () => {
      unsubscribe();
    };
  }, [enabled]);

  if (!enabled) return null;

  const getStatusClass = () => {
    if (voiceState.isSpeaking) return 'speaking';
    if (voiceState.isListening) return 'listening';
    if (voiceState.isProcessing) return 'processing';
    if (voiceState.isActive) return 'active';
    return 'inactive';
  };

  return (
    <button
      className={`voice-indicator-mini ${getStatusClass()}`}
      onClick={onClick}
      title={`Voice: ${getStatusClass()}`}
    >
      {voiceState.isSpeaking ? (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
          <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
          <line x1="15" y1="9" x2="15" y2="15" stroke="currentColor" strokeWidth="2" />
          <line x1="18" y1="7" x2="18" y2="17" stroke="currentColor" strokeWidth="2" />
        </svg>
      ) : voiceState.isListening ? (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
          <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
        </svg>
      ) : (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" opacity="0.5" />
          <path d="M19 10v2a7 7 0 0 1-14 0v-2" opacity="0.5" />
        </svg>
      )}
    </button>
  );
}
