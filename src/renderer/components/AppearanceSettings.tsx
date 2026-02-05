import { ThemeMode, AccentColor, VisualTheme, ACCENT_COLORS } from '../../shared/types';

interface AppearanceSettingsProps {
  themeMode: ThemeMode;
  visualTheme: VisualTheme;
  accentColor: AccentColor;
  onThemeChange: (theme: ThemeMode) => void;
  onVisualThemeChange: (theme: VisualTheme) => void;
  onAccentChange: (accent: AccentColor) => void;
  onShowOnboarding?: () => void;
  onboardingCompletedAt?: string;
}

export function AppearanceSettings({
  themeMode,
  visualTheme,
  accentColor,
  onThemeChange,
  onVisualThemeChange,
  onAccentChange,
  onShowOnboarding,
  onboardingCompletedAt,
}: AppearanceSettingsProps) {
  const isModernVisualTheme = visualTheme === 'warm' || visualTheme === 'oblivion';
  const formatCompletedDate = (isoString?: string) => {
    if (!isoString) return null;
    try {
      const date = new Date(isoString);
      return date.toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      });
    } catch {
      return null;
    }
  };

  return (
    <div className="appearance-settings">
      {/* Onboarding Section - at the top */}
      <div className="settings-section onboarding-section">
        <h3>Setup Wizard</h3>
        <p className="settings-description">
          Re-run the initial setup wizard to configure your AI provider and messaging channels.
          {onboardingCompletedAt && (
            <span className="onboarding-completed-info">
              {' '}Completed on {formatCompletedDate(onboardingCompletedAt)}.
            </span>
          )}
        </p>
        <button
          className="button-secondary show-onboarding-btn"
          onClick={onShowOnboarding}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
          </svg>
          Show Setup Wizard
        </button>
      </div>

      <div className="settings-section">
        <h3>Appearance</h3>
        <p className="settings-description">
          Customize the look and feel of the application
        </p>
      </div>

      {/* Visual Style */}
      <div className="appearance-section">
        <h4>Visual Style</h4>
        <div className="theme-switcher">
          <button
            className={`theme-option ${visualTheme === 'terminal' ? 'selected' : ''}`}
            onClick={() => onVisualThemeChange('terminal')}
          >
            <div className="theme-option-preview terminal">
              <div className="theme-option-preview-line code-line" />
              <div className="theme-option-preview-line code-line" />
              <div className="theme-option-preview-line code-line" />
            </div>
            <span className="theme-option-label">Terminal</span>
          </button>

          <button
            className={`theme-option ${isModernVisualTheme ? 'selected' : ''}`}
            onClick={() => onVisualThemeChange('warm')}
          >
            <div className="theme-option-preview warm">
              <div className="theme-option-preview-line ui-line" />
              <div className="theme-option-preview-line ui-line" />
              <div className="theme-option-preview-line ui-line" />
            </div>
            <span className="theme-option-label">Modern</span>
          </button>
        </div>
      </div>

      {/* Theme Mode */}
      <div className="appearance-section">
        <h4>Color Mode</h4>
        <div className="theme-switcher">
          <button
            className={`theme-option ${themeMode === 'light' ? 'selected' : ''}`}
            onClick={() => onThemeChange('light')}
          >
            <div className="theme-option-preview light">
              <div className="theme-option-preview-line" />
              <div className="theme-option-preview-line" />
              <div className="theme-option-preview-line" />
            </div>
            <span className="theme-option-label">Light</span>
          </button>

          <button
            className={`theme-option ${themeMode === 'dark' ? 'selected' : ''}`}
            onClick={() => onThemeChange('dark')}
          >
            <div className="theme-option-preview dark">
              <div className="theme-option-preview-line" />
              <div className="theme-option-preview-line" />
              <div className="theme-option-preview-line" />
            </div>
            <span className="theme-option-label">Dark</span>
          </button>

          <button
            className={`theme-option ${themeMode === 'system' ? 'selected' : ''}`}
            onClick={() => onThemeChange('system')}
          >
            <div className="theme-option-preview system" />
            <span className="theme-option-label">System</span>
            <span className="system-badge">Auto</span>
          </button>
        </div>
      </div>

      {/* Accent Color */}
      <div className="appearance-section">
        <h4>Accent Color</h4>
        <div className="color-grid">
          {ACCENT_COLORS.map((color) => (
            <button
              key={color.id}
              className={`color-option ${accentColor === color.id ? 'selected' : ''}`}
              onClick={() => onAccentChange(color.id)}
            >
              <div className={`color-swatch ${color.id}`} />
              <span className="color-label">{color.label}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
