/**
 * Internationalization (i18n) Configuration
 *
 * Initializes i18next for the CoWork OS renderer with support for
 * English (en), Japanese (ja), and Chinese Simplified (zh).
 *
 * Language preference is persisted via AppearanceSettings in the
 * Electron main process and falls back to the system locale on
 * first launch.
 */

import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import en from "./locales/en.json";
import ja from "./locales/ja.json";
import zh from "./locales/zh.json";

/** Supported language codes */
export const SUPPORTED_LANGUAGES = ["en", "ja", "zh"] as const;
export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number];

/** Language display names (shown in their native script) */
export const LANGUAGE_NAMES: Record<SupportedLanguage, string> = {
  en: "English",
  ja: "\u65e5\u672c\u8a9e",
  zh: "\u4e2d\u6587\uff08\u7b80\u4f53\uff09",
};

/**
 * Detect the best initial language from the browser/system locale.
 * Falls back to 'en' if no match is found.
 */
function detectLanguage(): SupportedLanguage {
  const nav = typeof navigator !== "undefined" ? navigator.language || "" : "";
  const code = nav.split("-")[0].toLowerCase();
  if (SUPPORTED_LANGUAGES.includes(code as SupportedLanguage)) {
    return code as SupportedLanguage;
  }
  return "en";
}

i18n.use(initReactI18next).init({
  resources: {
    en: { translation: en },
    ja: { translation: ja },
    zh: { translation: zh },
  },
  lng: detectLanguage(),
  fallbackLng: "en",
  interpolation: {
    escapeValue: false, // React already escapes by default
  },
  // Don't wait for translations to load (they're bundled)
  react: {
    useSuspense: false,
  },
});

export default i18n;

/**
 * Change the active language and persist the preference via AppearanceSettings.
 * Call this from the language settings UI.
 */
export async function changeLanguage(lang: SupportedLanguage): Promise<void> {
  await i18n.changeLanguage(lang);
  // Persist language preference so it survives app restarts
  try {
    if (typeof window !== "undefined" && window.electronAPI?.saveAppearanceSettings) {
      window.electronAPI.saveAppearanceSettings({ language: lang });
    }
  } catch {
    // Non-critical — language will still work for this session
  }
}

/**
 * Apply a persisted language preference (called from App.tsx on mount).
 * If the saved language differs from the current one, switch to it.
 */
export function applyPersistedLanguage(lang?: string): void {
  if (!lang) return;
  const code = lang.split("-")[0].toLowerCase();
  if (SUPPORTED_LANGUAGES.includes(code as SupportedLanguage) && i18n.language !== code) {
    i18n.changeLanguage(code);
  }
}
