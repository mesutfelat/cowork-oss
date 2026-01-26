import { ThemeMode, AccentColor, VisualStyle, ACCENT_COLORS, VISUAL_STYLES } from '../../shared/types';

interface AppearanceSettingsProps {
  themeMode: ThemeMode;
  accentColor: AccentColor;
  visualStyle: VisualStyle;
  onThemeChange: (theme: ThemeMode) => void;
  onAccentChange: (accent: AccentColor) => void;
  onStyleChange: (style: VisualStyle) => void;
}

export function AppearanceSettings({
  themeMode,
  accentColor,
  visualStyle,
  onThemeChange,
  onAccentChange,
  onStyleChange,
}: AppearanceSettingsProps) {
  return (
    <div className="appearance-settings">
      <div className="settings-section">
        <h3>Appearance</h3>
        <p className="settings-description">
          Customize the look and feel of the application
        </p>
      </div>

      {/* Visual Style */}
      <div className="appearance-section">
        <h4>Visual Style</h4>
        <div className="style-switcher">
          {VISUAL_STYLES.map((style) => (
            <button
              key={style.id}
              className={`style-option ${visualStyle === style.id ? 'selected' : ''}`}
              onClick={() => onStyleChange(style.id)}
            >
              <div className="style-option-header">
                <div className={`style-option-preview ${style.id}`} />
                <div className="style-option-info">
                  <div className="style-option-label">{style.label}</div>
                  <div className="style-option-description">{style.description}</div>
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Theme Mode */}
      <div className="appearance-section">
        <h4>Theme</h4>
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
