const SETTINGS_KEY = 'roster_app_settings';

export interface AppSettings {
  gemini_api_key: string;
}

const defaults: AppSettings = {
  gemini_api_key: '',
};

function load(): AppSettings & { openai_api_key?: string } {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (raw) return { ...defaults, ...JSON.parse(raw) };
  } catch {
    /* ignore */
  }
  return { ...defaults };
}

function save(settings: AppSettings): void {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

export const settingsService = {
  get(): AppSettings {
    const envKey = import.meta.env.VITE_GEMINI_API_KEY as string | undefined;
    const stored = load();
    return {
      gemini_api_key: stored.gemini_api_key || envKey || '',
    };
  },

  setGeminiApiKey(key: string): void {
    const current = load();
    save({ ...current, gemini_api_key: key.trim() });
  },

  hasApiKey(): boolean {
    return Boolean(this.get().gemini_api_key);
  },
};
