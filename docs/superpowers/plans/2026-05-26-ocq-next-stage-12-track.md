# ocq Next Stage 12-Track Implementation Plan

> **For agentic workers:** Execute this plan task-by-task. Recommended path:
> dispatch a fresh subagent per task, review each result with `review-quality`,
> then continue. For complex multi-agent splits, use
> `parallel-feature-development`, `team-composition-patterns`, and
> `team-communication-protocols`. Steps use checkbox (`- [ ]`) syntax for
> tracking.

**Goal:** Turn the deployed ocq gateway/UI from an MVP console into a safer operator product with real chat, session management, observability, presets, and admin diagnostics.

**Architecture:** Keep the gateway as the only process that talks to OpenCode. Add a same-origin UI auth proxy/BFF so the browser no longer stores the gateway bearer key. Extend the gateway with focused adapters for metadata, chat, diagnostics, and session watching; extend `apps/ui` with typed clients, pages, and components.

**Tech Stack:** Node HTTP gateway, OpenCode HTTP API, Vite React TypeScript Tailwind UI, Node test runner, Vitest/Testing Library, Docker Compose on NUC, Caddy/Authelia on almaz.

---

## Track inventory

This plan executes the 12 tracks previously listed:

1. Auth/key hardening
2. Deploy hygiene
3. Gateway correctness
4. UI polish
5. Testing
6. Session model
7. Real chat workspace
8. Session explorer
9. Ops console upgrade
10. Prompt/run presets
11. Session watch
12. Admin tools

## File map

- `src/server.js` — route dispatch, same-origin UI session endpoints, OpenAI-compatible chat completions, observability route wiring.
- `src/auth.js` — bearer auth, header redaction, new UI session cookie helpers.
- `src/opencode.js` — OpenCode server adapter: models, agents, directories, sessions, messages.
- `src/session-api.js` — session list/detail/send/watch routes.
- `src/observability.js` — request/log ring buffers, counters, latency summaries.
- `src/metrics.js` — Prometheus exporter.
- `src/admin-api.js` — new safe diagnostics endpoints with secret-presence-only reporting.
- `src/presets-api.js` — new file-backed presets API.
- `src/runtime-config.js` — new allowlisted runtime config parser for directories, models, agents, and feature flags.
- `test/*.test.js` — backend regression tests.
- `apps/ui/src/App.tsx` — app state orchestration until split in Track 4.
- `apps/ui/src/lib/api.ts` — typed UI client.
- `apps/ui/src/lib/types.ts` — shared UI types.
- `apps/ui/src/lib/storage.ts` — UI-safe local preferences only after Track 1.
- `apps/ui/src/lib/sse.ts` — OpenAI SSE parser/consumer.
- `apps/ui/src/components/*` — reusable UI components.
- `apps/ui/src/pages/*` — feature pages: Chat, Sessions, Requests, Logs, Admin, Presets.
- `apps/ui/src/test/*.test.ts*` — UI tests.
- `deploy/docker-compose.yml` — NUC containers.
- `docs/ocq-ui-deploy.md` — deployment runbook.
- `docs/ocq-admin-runbook.md` — new operator runbook.

---

### Task 1: Auth/key hardening

**Purpose:** Remove gateway bearer key from browser storage and route UI API calls through same-origin UI session auth.

**Files:**
- Modify: `src/auth.js`
- Modify: `src/server.js`
- Modify: `apps/ui/src/lib/storage.ts`
- Modify: `apps/ui/src/lib/api.ts`
- Modify: `apps/ui/src/components/SettingsPanel.tsx`
- Modify: `apps/ui/src/App.tsx`
- Test: `test/server.test.js`
- Test: `apps/ui/src/test/storage.test.ts`
- Test: `apps/ui/src/test/api.test.ts`

- [ ] **Step 1: Add backend tests for UI login/session cookie**

Add tests that prove:

```js
test("POST /ocq/ui/session sets an httpOnly cookie for a valid gateway key", async () => {
  const server = createGatewayServer({ gatewayKey: "secret" })
  const { url, close } = await listen(server)
  try {
    const response = await fetch(`${url}/ocq/ui/session`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ apiKey: "secret" }),
    })
    assert.equal(response.status, 204)
    assert.match(response.headers.get("set-cookie"), /ocq_ui_session=/)
    assert.match(response.headers.get("set-cookie"), /HttpOnly/)
    assert.match(response.headers.get("set-cookie"), /SameSite=Lax/)
  } finally {
    await close()
  }
})

test("GET /ocq/metrics accepts UI session cookie without bearer", async () => {
  const server = createGatewayServer({ gatewayKey: "secret" })
  const { url, close } = await listen(server)
  try {
    const login = await fetch(`${url}/ocq/ui/session`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ apiKey: "secret" }),
    })
    const cookie = login.headers.get("set-cookie").split(";")[0]
    const metrics = await fetch(`${url}/ocq/metrics`, { headers: { cookie } })
    assert.equal(metrics.status, 200)
  } finally {
    await close()
  }
})
```

Run: `npm test`

Expected: FAIL because routes/cookie auth do not exist.

- [ ] **Step 2: Implement signed UI session cookies**

Add to `src/auth.js`:

```js
const crypto = require("node:crypto")

function signUiSession(gatewayKey, now = Date.now()) {
  const payload = Buffer.from(JSON.stringify({ iat: now })).toString("base64url")
  const sig = crypto.createHmac("sha256", gatewayKey).update(payload).digest("base64url")
  return `${payload}.${sig}`
}

function hasValidUiSession(req, gatewayKey) {
  const cookie = req.headers.cookie || ""
  const match = cookie.match(/(?:^|;\s*)ocq_ui_session=([^;]+)/)
  if (!match || !gatewayKey) return false
  const [payload, sig] = match[1].split(".")
  if (!payload || !sig) return false
  const expected = crypto.createHmac("sha256", gatewayKey).update(payload).digest("base64url")
  return crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))
}
```

Export both helpers. Update `requireBearer()` in `src/server.js` to accept either bearer or UI session cookie for `/ocq/*` and `/metrics`. Add `POST /ocq/ui/session` and `DELETE /ocq/ui/session`.

- [ ] **Step 3: Remove API key persistence from localStorage**

Change `apps/ui/src/lib/storage.ts` so `Settings` persistence stores only:

```ts
type StoredSettings = Pick<Settings, 'baseUrl' | 'refreshMs' | 'theme'>
```

Do not serialize `apiKey`. Keep `apiKey` in React memory until login succeeds, then clear the input.

- [ ] **Step 4: Update UI client to use cookie session**

In `apps/ui/src/lib/api.ts`, add:

```ts
login: (apiKey: string) => request<void>('/ocq/ui/session', { method: 'POST', body: JSON.stringify({ apiKey }) }),
logout: () => request<void>('/ocq/ui/session', { method: 'DELETE' }),
```

Set `credentials: 'same-origin'` on all fetch calls. Keep `Authorization` header only if an API key is passed for backwards-compatible local development.

- [ ] **Step 5: Verify and commit**

Run: `npm run check:all`

Expected: PASS.

Commit:

```bash
git add src/auth.js src/server.js apps/ui/src/lib/storage.ts apps/ui/src/lib/api.ts apps/ui/src/components/SettingsPanel.tsx apps/ui/src/App.tsx test/server.test.js apps/ui/src/test/storage.test.ts apps/ui/src/test/api.test.ts
git commit -m "feat: add same-origin UI session auth"
```

---

### Task 2: Deploy hygiene

**Purpose:** Make NUC/almaz deployment reproducible without exposing secrets.

**Files:**
- Modify: `docs/ocq-ui-deploy.md`
- Create: `docs/ocq-admin-runbook.md`
- Create: `deploy/ocq-opencode.service`
- Create: `deploy/caddy-ocq.Caddyfile`
- Create: `scripts/deploy-smoke.sh`

- [ ] **Step 1: Add deploy smoke script**

Create `scripts/deploy-smoke.sh`:

```bash
#!/usr/bin/env bash
set -euo pipefail

base="${OCQ_BASE_URL:-http://10.0.0.56:3034}"
key="${OCQ_GATEWAY_KEY:?OCQ_GATEWAY_KEY is required}"

curl -fsS "$base/health" >/dev/null
code=$(curl -sS -o /dev/null -w '%{http_code}' "$base/ocq/metrics")
test "$code" = "401"
curl -fsS -H "Authorization: Bearer $key" "$base/metrics" | grep -q 'ocq_gateway_requests_total'
curl -fsS -H "Authorization: Bearer $key" "$base/ocq/sessions" | grep -q 'sessions'
printf 'ocq deploy smoke passed\n'
```

Run: `chmod +x scripts/deploy-smoke.sh`.

- [ ] **Step 2: Capture service and route templates**

Add `deploy/ocq-opencode.service` with the same safe shape as the live NUC user service:

```ini
[Unit]
Description=OpenCode headless server for ocq
After=network-online.target

[Service]
EnvironmentFile=/srv/server/projects/ocq/deploy/opencode-server.env
WorkingDirectory=/home/onnwee
ExecStart=/home/onnwee/.local/bin/opencode serve --hostname 0.0.0.0 --port 4096
Restart=on-failure
RestartSec=5

[Install]
WantedBy=default.target
```

Add `deploy/caddy-ocq.Caddyfile` with the current route template and Authelia imports.

- [ ] **Step 3: Expand deployment docs**

Update `docs/ocq-ui-deploy.md` with exact host ownership:

```md
- NUC repo: /srv/server/projects/ocq
- NUC UI: ocq-ui on 10.0.0.56:3033
- NUC gateway: ocq-gateway on 10.0.0.56:3034
- NUC OpenCode: ocq-opencode.service on 0.0.0.0:4096
- Almaz edge: ocq.subcult.tv via Caddy + Authelia
- Secret files: deploy/.env and deploy/opencode-server.env; back up presence and permissions, never values.
```

- [ ] **Step 4: Verify and commit**

Run: `npm run check:all` and `OCQ_GATEWAY_KEY=<local-key> scripts/deploy-smoke.sh` on NUC.

Commit:

```bash
git add docs/ocq-ui-deploy.md docs/ocq-admin-runbook.md deploy/ocq-opencode.service deploy/caddy-ocq.Caddyfile scripts/deploy-smoke.sh
git commit -m "docs: add ocq deployment runbook"
```

---

### Task 3: Gateway correctness

**Purpose:** Fix session continuation parity, upstream error mapping, and request redaction.

**Files:**
- Modify: `src/server.js`
- Modify: `src/session-api.js`
- Modify: `src/auth.js`
- Modify: `src/observability.js`
- Test: `test/server.test.js`

- [ ] **Step 1: Add regression tests**

Add tests for:

```js
test("non-streaming chat forwards ocq_session_id", async () => {
  let seen
  const server = createGatewayServer({
    gatewayKey: "secret",
    authHeader: () => "Basic x",
    sendPrompt: async (input) => {
      seen = input
      return { sessionID: input.sessionID, text: "ok" }
    },
  })
  const { url, close } = await listen(server)
  try {
    const response = await fetch(`${url}/v1/chat/completions`, {
      method: "POST",
      headers: { authorization: "Bearer secret", "content-type": "application/json" },
      body: JSON.stringify({ model: "openai/gpt-5.4-mini", ocq_session_id: "ses_existing", messages: [{ role: "user", content: "hi" }] }),
    })
    assert.equal(response.status, 200)
    assert.equal(seen.sessionID, "ses_existing")
  } finally {
    await close()
  }
})
```

Add tests that upstream `error.status = 404` returns HTTP 404, and `/ocq/requests` redacts `authorization`, `cookie`, `proxy-authorization`, and `x-api-key`.

- [ ] **Step 2: Implement parity and error mapping**

In `src/server.js`, add `sessionID: body.ocq_session_id` to the non-streaming `sendPromptFn` call. In `src/session-api.js`, map `error.status` to `400..599` status and default to 500.

- [ ] **Step 3: Expand redaction**

In `src/auth.js`, update redaction to include:

```js
const SENSITIVE_HEADERS = new Set(["authorization", "cookie", "proxy-authorization", "x-api-key"])
```

Ensure `src/observability.js` uses `redactHeaders()` before storing headers.

- [ ] **Step 4: Verify and commit**

Run: `npm run check:all`.

Commit:

```bash
git add src/server.js src/session-api.js src/auth.js src/observability.js test/server.test.js
git commit -m "fix: tighten gateway continuation and redaction"
```

---

### Task 4: UI polish and state split

**Purpose:** Make the UI easier to use before adding heavier features.

**Files:**
- Modify: `apps/ui/src/App.tsx`
- Create: `apps/ui/src/hooks/useGatewayPolling.ts`
- Create: `apps/ui/src/components/ConnectionBanner.tsx`
- Create: `apps/ui/src/components/EmptyState.tsx`
- Modify: `apps/ui/src/components/SettingsPanel.tsx`
- Test: `apps/ui/src/test/App.test.tsx`

- [ ] **Step 1: Extract polling hook tests**

Add tests that verify polling does not overlap in-flight refreshes and shows auth failure text when a `GatewayError` with status 401 occurs.

- [ ] **Step 2: Implement `useGatewayPolling`**

Move metrics/requests/logs/sessions refresh logic from `App.tsx` into a hook that uses recursive `window.setTimeout()` instead of `setInterval()`:

```ts
export function useGatewayPolling(client: GatewayClient | null, refreshMs: number) {
  // returns metrics, requests, logs, sessions, isRefreshing, syncError, lastRefreshAt, refreshNow
}
```

Guard with an `inFlight` ref so slow gateway calls do not overlap.

- [ ] **Step 3: Add first-run and auth states**

Use `ConnectionBanner` and `EmptyState` to distinguish:

- no session configured
- auth failed
- gateway offline
- partial sync
- live

- [ ] **Step 4: Verify and commit**

Run: `npm run ui:test && npm run ui:build && npm run check:all`.

Commit:

```bash
git add apps/ui/src/App.tsx apps/ui/src/hooks/useGatewayPolling.ts apps/ui/src/components/ConnectionBanner.tsx apps/ui/src/components/EmptyState.tsx apps/ui/src/components/SettingsPanel.tsx apps/ui/src/test/App.test.tsx
git commit -m "feat: polish gateway connection states"
```

---

### Task 5: Test coverage foundation

**Purpose:** Add focused regression coverage before feature expansion.

**Files:**
- Create: `test/deploy-smoke.test.js`
- Create: `apps/ui/src/test/sse.test.ts`
- Create: `apps/ui/src/test/polling.test.tsx`
- Modify: `package.json`
- Modify: `apps/ui/package.json`

- [ ] **Step 1: Add SSE parser tests**

Cover split chunks, CRLF, `[DONE]`, empty data lines, and malformed JSON. Expected parser behavior: collect valid `delta.content`, stop at `[DONE]`, and surface malformed JSON as `GatewayError` with a parser message.

- [ ] **Step 2: Add deploy smoke as optional test**

Add root script:

```json
"deploy:smoke": "scripts/deploy-smoke.sh"
```

Keep it out of `check:all` because it requires a live NUC key.

- [ ] **Step 3: Add polling hook tests**

Use fake timers to prove refreshes do not overlap and cleanup clears pending timers.

- [ ] **Step 4: Verify and commit**

Run: `npm run check:all`.

Commit:

```bash
git add test/deploy-smoke.test.js apps/ui/src/test/sse.test.ts apps/ui/src/test/polling.test.tsx package.json apps/ui/package.json
git commit -m "test: expand ocq regression coverage"
```

---

### Task 6: Session model

**Purpose:** Make session interactivity explicit and safe instead of always `observeOnly: true`.

**Files:**
- Modify: `src/opencode.js`
- Modify: `src/session-api.js`
- Modify: `apps/ui/src/lib/types.ts`
- Modify: `apps/ui/src/pages/Sessions.tsx`
- Modify: `apps/ui/src/components/ChatPane.tsx`
- Test: `test/opencode-session-discovery.test.js`
- Test: `test/server.test.js`
- Test: `apps/ui/src/test/Sessions.test.tsx`

- [ ] **Step 1: Define session mode types**

Add to UI types:

```ts
export type SessionMode = 'observe_only' | 'interactive' | 'remote_active'
```

Add fields to `SessionSummary` and `SessionDetail`: `mode`, `directory`, `model`, `agent`, `cost`, `tokens`.

- [ ] **Step 2: Normalize richer OpenCode session metadata**

Update `normalizeSession()` to extract metadata when present:

```js
mode: session?.active ? "remote_active" : session?.directory === opts?.directory ? "interactive" : "observe_only"
```

If OpenCode does not expose active state, use `observe_only` unless the user explicitly creates the session through ocq.

- [ ] **Step 3: Gate sending by mode**

Update `handleSessionMessage()` to reject sends to `observe_only` and `remote_active` sessions unless body includes `confirmInteractive: true` and server policy allows it.

- [ ] **Step 4: Verify and commit**

Run: `npm run check:all`.

Commit:

```bash
git add src/opencode.js src/session-api.js apps/ui/src/lib/types.ts apps/ui/src/pages/Sessions.tsx apps/ui/src/components/ChatPane.tsx test/opencode-session-discovery.test.js test/server.test.js apps/ui/src/test/Sessions.test.tsx
git commit -m "feat: model safe session interactivity"
```

---

### Task 7: Real chat workspace

**Purpose:** Add a first-class Chat page with new chat, model, agent, directory, and streaming display.

**Files:**
- Modify: `src/opencode.js`
- Modify: `src/server.js`
- Create: `src/runtime-config.js`
- Modify: `apps/ui/src/lib/types.ts`
- Modify: `apps/ui/src/lib/api.ts`
- Modify: `apps/ui/src/lib/sse.ts`
- Modify: `apps/ui/src/components/Shell.tsx`
- Create: `apps/ui/src/pages/Chat.tsx`
- Create: `apps/ui/src/components/ChatComposer.tsx`
- Create: `apps/ui/src/components/ModelPicker.tsx`
- Create: `apps/ui/src/components/AgentPicker.tsx`
- Create: `apps/ui/src/components/DirectoryPicker.tsx`
- Test: `test/server.test.js`
- Test: `apps/ui/src/test/Chat.test.tsx`

- [ ] **Step 1: Add backend config endpoints**

Implement `GET /ocq/config` returning:

```json
{
  "models": ["openai/gpt-5.4-mini"],
  "agents": ["build", "orchestrator"],
  "directories": ["/home/onnwee", "/srv/server/projects/ocq"],
  "defaultModel": "openai/gpt-5.4-mini",
  "defaultDirectory": "/home/onnwee"
}
```

Source values from env allowlists: `OCQ_ALLOWED_MODELS`, `OCQ_ALLOWED_AGENTS`, `OCQ_ALLOWED_DIRECTORIES`.

- [ ] **Step 2: Add streaming chat client**

Add `client.streamChat({ model, agent, directory, messages, sessionID })` using `/v1/chat/completions` with `stream: true` and existing SSE parser.

- [ ] **Step 3: Build Chat page**

Add Shell tab `Chat`. UI must include New chat, ModelPicker, AgentPicker, DirectoryPicker, transcript, and streaming assistant bubble.

- [ ] **Step 4: Verify and commit**

Run: `npm run check:all`.

Commit:

```bash
git add src/opencode.js src/server.js src/runtime-config.js apps/ui/src/lib/types.ts apps/ui/src/lib/api.ts apps/ui/src/lib/sse.ts apps/ui/src/components/Shell.tsx apps/ui/src/pages/Chat.tsx apps/ui/src/components/ChatComposer.tsx apps/ui/src/components/ModelPicker.tsx apps/ui/src/components/AgentPicker.tsx apps/ui/src/components/DirectoryPicker.tsx test/server.test.js apps/ui/src/test/Chat.test.tsx
git commit -m "feat: add real chat workspace"
```

---

### Task 8: Session explorer

**Purpose:** Make sessions searchable, filterable, and usable as an archive.

**Files:**
- Modify: `apps/ui/src/pages/Sessions.tsx`
- Create: `apps/ui/src/components/SessionFilters.tsx`
- Create: `apps/ui/src/components/SessionMetaPanel.tsx`
- Modify: `apps/ui/src/lib/types.ts`
- Test: `apps/ui/src/test/Sessions.test.tsx`

- [ ] **Step 1: Add search/filter UI tests**

Test title/id search, mode filter, model filter, and sort by updated time.

- [ ] **Step 2: Implement filters**

Add filter state in `Sessions.tsx`:

```ts
type SessionFilter = { query: string; mode: 'all' | SessionMode; model: string; sort: 'updated_desc' | 'created_desc' | 'title_asc' }
```

Use pure helper `filterSessions(sessions, filter)` exported for tests.

- [ ] **Step 3: Add metadata panel**

Display id, directory, model, agent, cost, tokens, created, updated, mode, and safe send eligibility.

- [ ] **Step 4: Verify and commit**

Run: `npm run ui:test && npm run ui:build && npm run check:all`.

Commit:

```bash
git add apps/ui/src/pages/Sessions.tsx apps/ui/src/components/SessionFilters.tsx apps/ui/src/components/SessionMetaPanel.tsx apps/ui/src/lib/types.ts apps/ui/src/test/Sessions.test.tsx
git commit -m "feat: add session explorer filters"
```

---

### Task 9: Ops console upgrade

**Purpose:** Add request/error detail drawers, latency trends, per-model stats, and active indicators.

**Files:**
- Modify: `src/observability.js`
- Modify: `src/metrics.js`
- Modify: `apps/ui/src/lib/types.ts`
- Modify: `apps/ui/src/pages/Overview.tsx`
- Modify: `apps/ui/src/pages/Requests.tsx`
- Modify: `apps/ui/src/pages/Logs.tsx`
- Create: `apps/ui/src/components/DetailDrawer.tsx`
- Create: `apps/ui/src/components/Sparkline.tsx`
- Test: `test/server.test.js`
- Test: `apps/ui/src/test/App.test.tsx`

- [ ] **Step 1: Add observability summary fields**

Extend summary with:

```js
modelStats: [{ model, requests, errors, p95LatencyMs }]
routeStats: [{ route, requests, errors, p95LatencyMs }]
latencySeries: [{ ts, p50LatencyMs, p95LatencyMs }]
```

- [ ] **Step 2: Add detail drawers**

Requests and Logs pages should open `DetailDrawer` on row click and show full redacted metadata.

- [ ] **Step 3: Add Overview charts**

Use `Sparkline` for latency trend and active streams/session watches.

- [ ] **Step 4: Verify and commit**

Run: `npm run check:all`.

Commit:

```bash
git add src/observability.js src/metrics.js apps/ui/src/lib/types.ts apps/ui/src/pages/Overview.tsx apps/ui/src/pages/Requests.tsx apps/ui/src/pages/Logs.tsx apps/ui/src/components/DetailDrawer.tsx apps/ui/src/components/Sparkline.tsx test/server.test.js apps/ui/src/test/App.test.tsx
git commit -m "feat: upgrade ops console observability"
```

---

### Task 10: Prompt/run presets

**Purpose:** Let the operator save reusable prompts and run profiles.

**Files:**
- Create: `src/presets-api.js`
- Modify: `src/server.js`
- Modify: `apps/ui/src/lib/types.ts`
- Modify: `apps/ui/src/lib/api.ts`
- Create: `apps/ui/src/pages/Presets.tsx`
- Create: `apps/ui/src/components/PresetEditor.tsx`
- Modify: `apps/ui/src/components/Shell.tsx`
- Test: `test/server.test.js`
- Test: `apps/ui/src/test/Presets.test.tsx`

- [ ] **Step 1: Add file-backed preset API**

Store presets in `${OCQ_DATA_DIR:-~/.local/share/ocq}/presets.json`. Shape:

```json
{
  "id": "uuid",
  "name": "Summarize session",
  "prompt": "Summarize this session in bullet points.",
  "model": "openai/gpt-5.4-mini",
  "agent": "build",
  "directory": "/home/onnwee"
}
```

Routes: `GET /ocq/presets`, `POST /ocq/presets`, `PUT /ocq/presets/:id`, `DELETE /ocq/presets/:id`.

- [ ] **Step 2: Add Presets page**

Add Shell tab `Presets`. UI supports list, create, edit, delete, and “use in Chat”.

- [ ] **Step 3: Add quick actions**

Add built-in immutable presets in the UI for: summarize session, explain errors, generate handoff.

- [ ] **Step 4: Verify and commit**

Run: `npm run check:all`.

Commit:

```bash
git add src/presets-api.js src/server.js apps/ui/src/lib/types.ts apps/ui/src/lib/api.ts apps/ui/src/pages/Presets.tsx apps/ui/src/components/PresetEditor.tsx apps/ui/src/components/Shell.tsx test/server.test.js apps/ui/src/test/Presets.test.tsx
git commit -m "feat: add prompt and run presets"
```

---

### Task 11: Session watch

**Purpose:** Show near-live remote/CLI/API-created activity without mutating or cancelling remote sessions.

**Files:**
- Modify: `src/session-api.js`
- Modify: `src/server.js`
- Modify: `src/sse.js`
- Modify: `apps/ui/src/lib/api.ts`
- Modify: `apps/ui/src/pages/Sessions.tsx`
- Modify: `apps/ui/src/components/ChatPane.tsx`
- Test: `test/server.test.js`
- Test: `apps/ui/src/test/Sessions.test.tsx`

- [ ] **Step 1: Add safe watch endpoint**

Implement `GET /ocq/sessions/:id/events` as SSE that polls `getSession()` every `OCQ_SESSION_WATCH_MS || 2000` and emits only when message count or `updatedAt` changes.

- [ ] **Step 2: Abort cleanly**

Close polling loop on `req.close`. Increment/decrement `sessionWatchesTotal` and `activeSessionWatches` counters.

- [ ] **Step 3: UI watch mode**

When a session is selected, use SSE watch if available. Fall back to existing polling on network or parser failure. Show `watch: live` or `watch: polling`.

- [ ] **Step 4: Verify and commit**

Run: `npm run check:all`.

Commit:

```bash
git add src/session-api.js src/server.js src/sse.js apps/ui/src/lib/api.ts apps/ui/src/pages/Sessions.tsx apps/ui/src/components/ChatPane.tsx test/server.test.js apps/ui/src/test/Sessions.test.tsx
git commit -m "feat: add safe session watch"
```

---

### Task 12: Admin tools

**Purpose:** Add safe diagnostics for gateway, OpenCode upstream, config, deploy, and operator runbooks.

**Files:**
- Create: `src/admin-api.js`
- Modify: `src/server.js`
- Modify: `apps/ui/src/lib/types.ts`
- Modify: `apps/ui/src/lib/api.ts`
- Create: `apps/ui/src/pages/Admin.tsx`
- Modify: `apps/ui/src/components/Shell.tsx`
- Modify: `docs/ocq-admin-runbook.md`
- Test: `test/server.test.js`
- Test: `apps/ui/src/test/Admin.test.tsx`

- [ ] **Step 1: Add diagnostics API**

Implement `GET /ocq/admin/status` returning only safe booleans and names:

```json
{
  "gateway": { "ok": true, "version": "0.1.0" },
  "opencode": { "ok": true, "url": "http://127.0.0.1:4096" },
  "config": {
    "gatewayKeyPresent": true,
    "opencodeAuthPresent": true,
    "defaultModel": "openai/gpt-5.4-mini",
    "defaultDirectory": "/home/onnwee"
  },
  "deploy": { "host": "nuc", "uiPort": 3033, "gatewayPort": 3034 }
}
```

Do not return secret values, headers, prompt text, or full env content.

- [ ] **Step 2: Add Admin page**

Add Shell tab `Admin`. Display status cards, diagnostics detail, and copyable commands for restart/redeploy:

```bash
systemctl --user restart ocq-opencode.service
cd /srv/server/projects/ocq/deploy && docker compose up -d --build
ssh almaz 'docker exec caddy caddy reload --config /etc/caddy/Caddyfile'
```

Do not add restart buttons in this track.

- [ ] **Step 3: Update runbook**

Document: health checks, logs, redeploy, rollback to previous git commit, secret file permissions, Caddy validation, and public auth validation.

- [ ] **Step 4: Verify and commit**

Run: `npm run check:all` and `OCQ_GATEWAY_KEY=<key> scripts/deploy-smoke.sh` on NUC.

Commit:

```bash
git add src/admin-api.js src/server.js apps/ui/src/lib/types.ts apps/ui/src/lib/api.ts apps/ui/src/pages/Admin.tsx apps/ui/src/components/Shell.tsx docs/ocq-admin-runbook.md test/server.test.js apps/ui/src/test/Admin.test.tsx
git commit -m "feat: add safe admin diagnostics"
```

---

## Execution sequencing

Execute in this order:

1. Task 1 first, because it removes the browser-held key before feature growth.
2. Task 2 second, because deployment reproducibility protects the live service.
3. Tasks 3-6 next, because they stabilize correctness, UI state, tests, and session safety.
4. Tasks 7-12 after foundations, because they add operator-facing features on stable APIs.

## Validation gates

Every task must pass:

```bash
npm run check:all
```

Every deploy-affecting task must also pass on NUC:

```bash
OCQ_GATEWAY_KEY=<key-from-deploy-env> scripts/deploy-smoke.sh
```

Every public route change must verify:

```bash
curl -sS -o /tmp/ocq-public -w '%{http_code} %{redirect_url}\n' -L --max-redirs 0 https://ocq.subcult.tv/
```

Expected unauthenticated public result: `302 https://auth.subcult.tv/...`.

## Self-review coverage

- Auth/key hardening: Task 1
- Deploy hygiene: Task 2
- Gateway correctness: Task 3
- UI polish: Task 4
- Testing: Task 5
- Session model: Task 6
- Real chat workspace: Task 7
- Session explorer: Task 8
- Ops console upgrade: Task 9
- Prompt/run presets: Task 10
- Session watch: Task 11
- Admin tools: Task 12

No track is intentionally deferred. Each task produces shippable software and a commit.
