/**
 * Tests for i18n configuration and locale completeness
 */

import { describe, it, expect } from "vitest";
import en from "../locales/en.json";
import ja from "../locales/ja.json";
import zh from "../locales/zh.json";
import { SUPPORTED_LANGUAGES, LANGUAGE_NAMES, type SupportedLanguage } from "../index";

/**
 * Recursively extract all key paths from an object.
 * e.g. { a: { b: "x" } } => ["a.b"]
 */
function getKeyPaths(obj: Record<string, unknown>, prefix = ""): string[] {
  const keys: string[] = [];
  for (const [key, value] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (value !== null && typeof value === "object" && !Array.isArray(value)) {
      keys.push(...getKeyPaths(value as Record<string, unknown>, path));
    } else {
      keys.push(path);
    }
  }
  return keys.sort();
}

describe("i18n configuration", () => {
  it("SUPPORTED_LANGUAGES contains expected languages", () => {
    expect(SUPPORTED_LANGUAGES).toContain("en");
    expect(SUPPORTED_LANGUAGES).toContain("ja");
    expect(SUPPORTED_LANGUAGES).toContain("zh");
    expect(SUPPORTED_LANGUAGES).toHaveLength(3);
  });

  it("LANGUAGE_NAMES has entries for all supported languages", () => {
    for (const lang of SUPPORTED_LANGUAGES) {
      expect(LANGUAGE_NAMES[lang]).toBeDefined();
      expect(typeof LANGUAGE_NAMES[lang]).toBe("string");
      expect(LANGUAGE_NAMES[lang].length).toBeGreaterThan(0);
    }
  });

  it("LANGUAGE_NAMES uses native script for non-English languages", () => {
    expect(LANGUAGE_NAMES.en).toBe("English");
    // Japanese should use Japanese characters
    expect(LANGUAGE_NAMES.ja).toBe("日本語");
    // Chinese should use Chinese characters
    expect(LANGUAGE_NAMES.zh).toBe("中文（简体）");
  });

  it("SupportedLanguage type matches SUPPORTED_LANGUAGES", () => {
    // Type-level test: these assignments should compile
    const valid: SupportedLanguage[] = ["en", "ja", "zh"];
    expect(valid).toHaveLength(SUPPORTED_LANGUAGES.length);
    for (const lang of valid) {
      expect(SUPPORTED_LANGUAGES).toContain(lang);
    }
  });
});

describe("locale file completeness", () => {
  const enKeys = getKeyPaths(en as Record<string, unknown>);
  const jaKeys = getKeyPaths(ja as Record<string, unknown>);
  const zhKeys = getKeyPaths(zh as Record<string, unknown>);

  it("English locale has translation keys", () => {
    expect(enKeys.length).toBeGreaterThan(100);
  });

  it("Japanese locale has same keys as English", () => {
    const missingInJa = enKeys.filter((k) => !jaKeys.includes(k));
    const extraInJa = jaKeys.filter((k) => !enKeys.includes(k));
    expect(missingInJa).toEqual([]);
    expect(extraInJa).toEqual([]);
    expect(jaKeys).toHaveLength(enKeys.length);
  });

  it("Chinese locale has same keys as English", () => {
    const missingInZh = enKeys.filter((k) => !zhKeys.includes(k));
    const extraInZh = zhKeys.filter((k) => !enKeys.includes(k));
    expect(missingInZh).toEqual([]);
    expect(extraInZh).toEqual([]);
    expect(zhKeys).toHaveLength(enKeys.length);
  });

  it("all three locales have identical key sets", () => {
    expect(jaKeys).toEqual(enKeys);
    expect(zhKeys).toEqual(enKeys);
  });
});

describe("locale file content", () => {
  /** Resolve a dot-separated key path to its leaf value */
  function resolveKey(locale: Record<string, unknown>, key: string): string {
    const value = key
      .split(".")
      .reduce<unknown>((obj, k) => (obj as Record<string, unknown>)[k], locale);
    return String(value);
  }

  it("English values are non-empty strings", () => {
    const keys = getKeyPaths(en as Record<string, unknown>);
    for (const key of keys) {
      const value = resolveKey(en as Record<string, unknown>, key);
      expect(typeof value).toBe("string");
      expect(value.trim().length).toBeGreaterThan(0);
    }
  });

  it("Japanese values are non-empty strings", () => {
    const keys = getKeyPaths(ja as Record<string, unknown>);
    for (const key of keys) {
      const value = resolveKey(ja as Record<string, unknown>, key);
      expect(typeof value).toBe("string");
      expect(value.trim().length).toBeGreaterThan(0);
    }
  });

  it("Chinese values are non-empty strings", () => {
    const keys = getKeyPaths(zh as Record<string, unknown>);
    for (const key of keys) {
      const value = resolveKey(zh as Record<string, unknown>, key);
      expect(typeof value).toBe("string");
      expect(value.trim().length).toBeGreaterThan(0);
    }
  });

  it("interpolation placeholders match across locales", () => {
    const enFlat = getKeyPaths(en as Record<string, unknown>);
    const interpolationRegex = /\{\{(\w+)\}\}/g;

    for (const key of enFlat) {
      const enValue = resolveKey(en as Record<string, unknown>, key);
      const enMatches = [...enValue.matchAll(interpolationRegex)].map((m) => m[1]).sort();
      if (enMatches.length === 0) continue;

      const jaValue = resolveKey(ja as Record<string, unknown>, key);
      const jaMatches = [...jaValue.matchAll(interpolationRegex)].map((m) => m[1]).sort();
      expect(jaMatches).toEqual(enMatches);

      const zhValue = resolveKey(zh as Record<string, unknown>, key);
      const zhMatches = [...zhValue.matchAll(interpolationRegex)].map((m) => m[1]).sort();
      expect(zhMatches).toEqual(enMatches);
    }
  });
});

describe("locale file structure", () => {
  const expectedTopLevelKeys = [
    "common",
    "sidebar",
    "task",
    "agent",
    "workspace",
    "missionControl",
    "canvas",
    "settings",
    "activity",
    "standup",
    "voice",
    "notifications",
    "errors",
  ];

  it("English has all expected top-level sections", () => {
    for (const section of expectedTopLevelKeys) {
      expect(en).toHaveProperty(section);
    }
  });

  it("Japanese has all expected top-level sections", () => {
    for (const section of expectedTopLevelKeys) {
      expect(ja).toHaveProperty(section);
    }
  });

  it("Chinese has all expected top-level sections", () => {
    for (const section of expectedTopLevelKeys) {
      expect(zh).toHaveProperty(section);
    }
  });

  it("all locales have the same top-level keys", () => {
    const enTopKeys = Object.keys(en).sort();
    const jaTopKeys = Object.keys(ja).sort();
    const zhTopKeys = Object.keys(zh).sort();
    expect(jaTopKeys).toEqual(enTopKeys);
    expect(zhTopKeys).toEqual(enTopKeys);
  });

  it("task status section has expected keys", () => {
    const expectedStatuses = [
      "pending",
      "running",
      "completed",
      "failed",
      "cancelled",
      "paused",
      "blocked",
    ];
    for (const status of expectedStatuses) {
      expect(en.task.status).toHaveProperty(status);
      expect(ja.task.status).toHaveProperty(status);
      expect(zh.task.status).toHaveProperty(status);
    }
  });

  it("settings.language section has expected keys", () => {
    expect(en.settings.language).toHaveProperty("title");
    expect(en.settings.language).toHaveProperty("description");
    expect(ja.settings.language).toHaveProperty("title");
    expect(ja.settings.language).toHaveProperty("description");
    expect(zh.settings.language).toHaveProperty("title");
    expect(zh.settings.language).toHaveProperty("description");
  });

  it("canvas.checkpoint section exists in all locales", () => {
    expect(en.canvas.checkpoint).toBeDefined();
    expect(ja.canvas.checkpoint).toBeDefined();
    expect(zh.canvas.checkpoint).toBeDefined();
    expect(en.canvas.checkpoint.save).toBeDefined();
    expect(en.canvas.checkpoint.restore).toBeDefined();
    expect(en.canvas.checkpoint.list).toBeDefined();
  });
});
