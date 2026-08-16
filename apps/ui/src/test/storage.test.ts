import { expect, it, vi } from 'vitest'
import { DEFAULT_SETTINGS, loadSettings, saveSettings } from '../lib/storage'

function createStorage() {
  const map = new Map<string, string>()

  return {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => {
      map.set(key, value)
    },
    removeItem: (key: string) => {
      map.delete(key)
    },
    clear: () => {
      map.clear()
    },
  } as Storage
}

it('saves settings without api key and loads session-safe defaults', () => {
  const storage = createStorage()

  const settings = {
    baseUrl: 'http://x',
    apiKey: 'secret',
    refreshMs: 1000,
    theme: 'dark' as const,
  }

  saveSettings(settings, storage)

  expect(storage.getItem('ocq.ui.settings.v1')).toBe(JSON.stringify({ baseUrl: 'http://x', refreshMs: 1000, theme: 'dark' }))
  expect(loadSettings(storage)).toEqual({
    baseUrl: 'http://x',
    apiKey: '',
    refreshMs: 1000,
    theme: 'dark',
  })
})

it('falls back on invalid JSON', () => {
  const storage = createStorage()
  storage.setItem('ocq.ui.settings.v1', '{')

  expect(loadSettings(storage)).toEqual(DEFAULT_SETTINGS)
})

it('drops saved insecure gateway url on https pages', () => {
  vi.stubGlobal('location', { protocol: 'https:' })
  const storage = createStorage()
  storage.setItem('ocq.ui.settings.v1', JSON.stringify({ baseUrl: 'http://10.0.0.50:3034', refreshMs: 1000, theme: 'dark' }))

  expect(loadSettings(storage).baseUrl).toBe('')
  vi.unstubAllGlobals()
})
