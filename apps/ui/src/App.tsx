import { useEffect, useMemo, useState } from 'react'
import { Shell, type Tab } from './components/Shell'
import { SettingsPanel } from './components/SettingsPanel'
import { createGatewayClient } from './lib/api'
import { loadSettings, saveSettings } from './lib/storage'
import type { GatewayLog, GatewayRequest, MetricsSummary } from './lib/types'
import { Logs } from './pages/Logs'
import { Overview } from './pages/Overview'
import { Requests } from './pages/Requests'

function errorMessage(reason: unknown) {
  return reason instanceof Error ? reason.message : String(reason)
}

export function App() {
  const [tab, setTab] = useState<Tab>('Overview')
  const [settings, setSettings] = useState(() => loadSettings())
  const [metrics, setMetrics] = useState<MetricsSummary>()
  const [requests, setRequests] = useState<GatewayRequest[]>([])
  const [logs, setLogs] = useState<GatewayLog[]>([])
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [lastRefreshAt, setLastRefreshAt] = useState<number | null>(null)
  const [syncError, setSyncError] = useState<string | null>(null)

  const refreshMs = Math.max(1000, Number(settings.refreshMs) || 3000)
  const client = useMemo(() => {
    if (!settings.apiKey.trim()) return null
    return createGatewayClient(settings.baseUrl.trim(), settings.apiKey.trim())
  }, [settings.apiKey, settings.baseUrl])

  useEffect(() => {
    saveSettings(settings)
  }, [settings])

  useEffect(() => {
    if (!client) {
      setIsRefreshing(false)
      setSyncError(null)
      return undefined
    }

    let cancelled = false

    const refresh = async () => {
      setIsRefreshing(true)
      const [metricsResult, requestsResult, logsResult] = await Promise.allSettled([
        client.metrics(),
        client.requests(),
        client.logs(),
      ])

      if (cancelled) return

      if (metricsResult.status === 'fulfilled') setMetrics(metricsResult.value)
      if (requestsResult.status === 'fulfilled') setRequests(requestsResult.value.requests)
      if (logsResult.status === 'fulfilled') setLogs(logsResult.value.logs)

      const failures = [metricsResult, requestsResult, logsResult].flatMap((result) =>
        result.status === 'rejected' ? [errorMessage(result.reason)] : [],
      )

      setSyncError(failures.length ? failures.join(' · ') : null)
      setLastRefreshAt(Date.now())
      setIsRefreshing(false)
    }

    void refresh()
    const timer = window.setInterval(() => {
      void refresh()
    }, refreshMs)

    return () => {
      cancelled = true
      window.clearInterval(timer)
    }
  }, [client, refreshMs])

  const connectionState = client
    ? syncError
      ? 'warning'
      : isRefreshing
        ? 'neutral'
        : 'success'
    : 'neutral'

  const connectionLabel = client
    ? syncError
      ? 'partial sync'
      : isRefreshing
        ? 'syncing'
        : 'live'
    : 'unconfigured'

  const statusCopy = client
    ? syncError
      ? 'polling with partial failures'
      : `polling every ${Math.round(refreshMs / 1000)}s`
    : 'set gateway url and api key'

  return (
    <Shell
      tab={tab}
      onTab={setTab}
      connectionLabel={connectionLabel}
      connectionTone={connectionState}
      statusCopy={statusCopy}
    >
      {tab === 'Overview' && (
        <Overview
          metrics={metrics}
          isRefreshing={isRefreshing}
          syncError={syncError}
          lastRefreshAt={lastRefreshAt}
          refreshMs={refreshMs}
        />
      )}
      {tab === 'Requests' && <Requests requests={requests} isRefreshing={isRefreshing} syncError={syncError} />}
      {tab === 'Logs' && <Logs logs={logs} isRefreshing={isRefreshing} syncError={syncError} />}
      {tab === 'Sessions' && (
        <section className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="rounded-3xl border border-cyan-400/10 bg-slate-950/70 p-6 shadow-[0_0_0_1px_rgba(15,23,42,0.8)] backdrop-blur">
            <p className="text-xs uppercase tracking-[0.35em] text-cyan-300/70">Task 8 later</p>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight text-slate-50">Sessions chat shell is still off-line.</h2>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-400">
              This tab is a placeholder only. Task 7 keeps the ops console focused on observability: metrics, request
              traces, logs, and settings. Session watch/chat comes next.
            </p>
          </div>
          <div className="rounded-3xl border border-slate-800/80 bg-slate-950/50 p-5 text-sm text-slate-400">
            <div className="flex items-center justify-between">
              <span className="text-slate-200">Planned next</span>
              <span className="rounded-full border border-slate-700 px-2 py-1 text-[11px] uppercase tracking-[0.3em] text-slate-500">
                placeholder
              </span>
            </div>
            <ul className="mt-4 space-y-3 leading-6">
              <li>• live session browser</li>
              <li>• safe watch-only detail view</li>
              <li>• optional send controls</li>
            </ul>
          </div>
        </section>
      )}
      {tab === 'Settings' && <SettingsPanel settings={settings} onChange={setSettings} />}
    </Shell>
  )
}
