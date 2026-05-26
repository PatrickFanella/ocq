import type { Settings } from './types'

const KEY = 'ocq.ui.settings.v1'

export const DEFAULT_SETTINGS: Settings = {
  baseUrl: '',
  apiKey: '',
  refreshMs: 3000,
  theme: 'dark',
}

export function loadSettings(storage: Storage = localStorage): Settings {
  const raw = storage.getItem(KEY)
  if (!raw) return DEFAULT_SETTINGS

  try {
    const parsed = JSON.parse(raw) as Partial<Settings>
    return {
      ...DEFAULT_SETTINGS,
      ...parsed,
      apiKey: '',
    }
  } catch {
    return DEFAULT_SETTINGS
  }
}

export function saveSettings(settings: Settings, storage: Storage = localStorage) {
  const { apiKey: _apiKey, ...persisted } = settings
  storage.setItem(KEY, JSON.stringify(persisted))
}
