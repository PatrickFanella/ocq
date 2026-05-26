import type { ChangeEvent } from 'react'
import { useState } from 'react'
import { ShieldAlert, TimerReset } from 'lucide-react'
import type { Settings } from '../lib/types'
import { StatusBadge } from './StatusBadge'

type SettingsPanelProps = {
  settings: Settings
  onChange: (settings: Settings) => void
  onLogin: (apiKey: string) => Promise<void>
  onLogout: () => Promise<void>
}

function updateField(
  settings: Settings,
  onChange: (settings: Settings) => void,
  key: keyof Settings,
  value: string | number,
) {
  onChange({ ...settings, [key]: value } as Settings)
}

export function SettingsPanel({ settings, onChange, onLogin, onLogout }: SettingsPanelProps) {
  const [isAuthenticating, setIsAuthenticating] = useState(false)
  const [authError, setAuthError] = useState<string | null>(null)

  async function handleLogin() {
    if (!settings.apiKey.trim() || isAuthenticating) return
    setIsAuthenticating(true)
    try {
      await onLogin(settings.apiKey)
      setAuthError(null)
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : 'Sign in failed')
    } finally {
      setIsAuthenticating(false)
    }
  }

  async function handleLogout() {
    if (isAuthenticating) return
    setIsAuthenticating(true)
    try {
      await onLogout()
      setAuthError(null)
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : 'Clear session failed')
    } finally {
      setIsAuthenticating(false)
    }
  }

  return (
    <section className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
      <div className="rounded-3xl border border-slate-800/90 bg-slate-950/70 p-6 shadow-[0_0_0_1px_rgba(15,23,42,0.55)] backdrop-blur">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.35em] text-cyan-300/70">settings</p>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight text-slate-50">gateway connection</h2>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-400">
              Save the URL here. Sign in once with your gateway key and the browser uses a same-origin session cookie.
            </p>
          </div>
          <StatusBadge tone="accent">session-ready</StatusBadge>
        </div>

        <div className="mt-8 grid gap-5">
          <label className="grid gap-2">
            <span className="text-xs uppercase tracking-[0.32em] text-slate-500">Gateway URL</span>
            <input
              className="rounded-2xl border border-slate-800 bg-slate-950 px-4 py-3 text-slate-100 transition placeholder:text-slate-600 focus-visible:border-cyan-400/50 focus-visible:ring-2 focus-visible:ring-cyan-400/20"
              value={settings.baseUrl}
              onChange={(event: ChangeEvent<HTMLInputElement>) => updateField(settings, onChange, 'baseUrl', event.target.value)}
              placeholder="http://127.0.0.1:8088"
              spellCheck={false}
            />
          </label>

          <label className="grid gap-2">
            <span className="text-xs uppercase tracking-[0.32em] text-slate-500">API key</span>
            <input
              className="rounded-2xl border border-slate-800 bg-slate-950 px-4 py-3 text-slate-100 transition placeholder:text-slate-600 focus-visible:border-cyan-400/50 focus-visible:ring-2 focus-visible:ring-cyan-400/20"
              type="password"
              value={settings.apiKey}
              onChange={(event: ChangeEvent<HTMLInputElement>) => updateField(settings, onChange, 'apiKey', event.target.value)}
              placeholder="Bearer token"
              spellCheck={false}
              autoComplete="off"
            />
          </label>

          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              className="rounded-2xl border border-cyan-500/40 bg-cyan-500/10 px-4 py-3 text-sm font-medium text-cyan-200 transition hover:border-cyan-400 hover:bg-cyan-500/20 disabled:cursor-not-allowed disabled:opacity-50"
              onClick={() => void handleLogin()}
              disabled={isAuthenticating || !settings.apiKey.trim()}
            >
              sign in
            </button>
            <button
              type="button"
              className="rounded-2xl border border-slate-700 bg-slate-900/60 px-4 py-3 text-sm font-medium text-slate-200 transition hover:border-slate-500 hover:bg-slate-900 disabled:cursor-not-allowed disabled:opacity-50"
              onClick={() => void handleLogout()}
              disabled={isAuthenticating}
            >
              clear session
            </button>
          </div>

          {authError && <p className="text-sm text-rose-300">{authError}</p>}

          <label className="grid gap-2">
            <span className="text-xs uppercase tracking-[0.32em] text-slate-500">Refresh interval (ms)</span>
            <input
              className="rounded-2xl border border-slate-800 bg-slate-950 px-4 py-3 text-slate-100 transition placeholder:text-slate-600 focus-visible:border-cyan-400/50 focus-visible:ring-2 focus-visible:ring-cyan-400/20"
              type="number"
              min={1000}
              step={500}
              value={settings.refreshMs}
              onChange={(event: ChangeEvent<HTMLInputElement>) =>
                updateField(settings, onChange, 'refreshMs', Number(event.target.value) || 3000)
              }
            />
          </label>
        </div>
      </div>

      <div className="grid gap-4 rounded-3xl border border-slate-800/90 bg-slate-950/55 p-6 text-sm text-slate-400 backdrop-blur">
        <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-4">
          <div className="flex items-center gap-2 text-slate-200">
            <TimerReset className="h-4 w-4 text-cyan-300" />
            refresh behavior
          </div>
          <p className="mt-3 leading-6">Polling wakes every {Math.max(1, Math.round(settings.refreshMs / 1000))}s and keeps the deck current.</p>
        </div>

        <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-4">
          <div className="flex items-center gap-2 text-slate-200">
            <ShieldAlert className="h-4 w-4 text-amber-300" />
            safety note
          </div>
          <p className="mt-3 leading-6">Bearer still works for direct/dev use. Same-origin sign-in keeps the key out of storage.</p>
        </div>
      </div>
    </section>
  )
}
