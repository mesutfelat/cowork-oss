interface AwakeningOrbProps {
  state: "dormant" | "awakening" | "breathing" | "listening" | "transitioning";
  audioLevel?: number; // 0-100 for voice input visualization
}

export function AwakeningOrb({ state, audioLevel = 0 }: AwakeningOrbProps) {
  // Determine CSS classes based on state
  const orbClasses = [
    "onboarding-orb",
    state === "awakening" && "awakening",
    state === "listening" && "listening",
    state === "transitioning" && "transitioning",
  ]
    .filter(Boolean)
    .join(" ");

  const heartlineClasses = [
    "onboarding-heartline",
    state === "awakening" && "awakening",
    state === "listening" && "listening",
    state === "transitioning" && "transitioning",
  ]
    .filter(Boolean)
    .join(" ");

  // Scale orb slightly based on audio level when listening
  const orbStyle =
    state === "listening" && audioLevel > 0
      ? {
          transform: `scale(${1 + audioLevel * 0.003})`,
        }
      : undefined;

  // Show waveform ripples when listening and there's audio input
  const showWaveform = state === "listening" && audioLevel > 20;

  if (state === "dormant") {
    return null;
  }

  return (
    <div className="onboarding-orb-container">
      <div className={heartlineClasses} aria-hidden="true">
        <svg viewBox="0 0 320 80" preserveAspectRatio="none">
          <g className="onboarding-heartline-scroll">
            <path
              className="onboarding-heartline-segment onboarding-heartline-segment-muted"
              d="M0 40 H66 L86 40 L98 22 L118 58 L140 8 L158 40 H194 L206 50 L222 24 L244 58 L264 24 L278 40 H320"
            />
            <path
              className="onboarding-heartline-segment onboarding-heartline-segment-muted"
              d="M0 40 H66 L86 40 L98 22 L118 58 L140 8 L158 40 H194 L206 50 L222 24 L244 58 L264 24 L278 40 H320"
              transform="translate(320 0)"
            />
            <path
              className="onboarding-heartline-segment onboarding-heartline-segment-bright"
              d="M0 40 H66 L86 40 L98 22 L118 58 L140 8 L158 40 H194 L206 50 L222 24 L244 58 L264 24 L278 40 H320"
            />
            <path
              className="onboarding-heartline-segment onboarding-heartline-segment-bright"
              d="M0 40 H66 L86 40 L98 22 L118 58 L140 8 L158 40 H194 L206 50 L222 24 L244 58 L264 24 L278 40 H320"
              transform="translate(320 0)"
            />
          </g>
        </svg>
      </div>
      <div className={orbClasses} style={orbStyle} />
      <div className={`onboarding-waveform ${showWaveform ? "active" : ""}`}>
        <div className="onboarding-waveform-ring" />
        <div className="onboarding-waveform-ring" />
        <div className="onboarding-waveform-ring" />
      </div>
    </div>
  );
}

export default AwakeningOrb;
