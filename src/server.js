const http = require("node:http")
const {
  DEFAULT_BASE_URL,
  DEFAULT_PROVIDER,
  DEFAULT_MODEL,
  DEFAULT_DIRECTORY,
  DEFAULT_ENV_FILE,
  authHeader,
  sendPrompt,
} = require("./opencode")
const { parseModelName, messagesToPrompt, chatCompletionResponse } = require("./openai")
const { hasValidBearer } = require("./auth")
const { createObservabilityState } = require("./observability")
const { prometheusMetrics } = require("./metrics")

const DEFAULT_GATEWAY_HOST = "127.0.0.1"
const DEFAULT_GATEWAY_PORT = 8088
const MAX_BODY_BYTES = 1024 * 1024

function getServerOptions(overrides = {}) {
  const defaultProvider = process.env.OCQ_PROVIDER || DEFAULT_PROVIDER
  const defaultModel = overrides.defaultModel || process.env.OCQ_DEFAULT_MODEL || process.env.OCQ_MODEL || `${defaultProvider}/${DEFAULT_MODEL}`
  const parsedDefault = parseModelName(defaultModel, defaultProvider, DEFAULT_MODEL)
  return {
    host: overrides.host || process.env.OCQ_GATEWAY_HOST || DEFAULT_GATEWAY_HOST,
    port: Number(overrides.port || process.env.OCQ_GATEWAY_PORT || DEFAULT_GATEWAY_PORT),
    gatewayKey: overrides.gatewayKey || process.env.OCQ_GATEWAY_KEY,
    baseUrl: (overrides.baseUrl || process.env.OPENCODE_SERVER_URL || DEFAULT_BASE_URL).replace(/\/+$/, ""),
    envFile: overrides.envFile || process.env.OCQ_ENV_FILE || DEFAULT_ENV_FILE,
    directory: overrides.directory || process.env.OCQ_DEFAULT_DIRECTORY || process.env.OCQ_DIRECTORY || DEFAULT_DIRECTORY,
    defaultProviderID: parsedDefault.providerID,
    defaultModelID: parsedDefault.modelID,
    defaultModel: parsedDefault.model,
  }
}

function json(res, status, body, headers = {}) {
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    ...headers,
  })
  res.end(`${JSON.stringify(body)}\n`)
}

function errorBody(message, type = "invalid_request_error", code) {
  return { error: { message, type, code } }
}

function requireBearer(req, res, opts) {
  if (hasValidBearer(req, opts.gatewayKey)) return true
  json(res, 401, errorBody("missing or invalid bearer token", "authentication_error", "unauthorized"), {
    "www-authenticate": "Bearer",
  })
  return false
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let size = 0
    const chunks = []
    req.on("data", (chunk) => {
      size += chunk.length
      if (size > MAX_BODY_BYTES) {
        reject(new Error("request body too large"))
        req.destroy()
        return
      }
      chunks.push(chunk)
    })
    req.on("error", reject)
    req.on("end", () => {
      try {
        const text = Buffer.concat(chunks).toString("utf8")
        resolve(text ? JSON.parse(text) : {})
      } catch {
        reject(new Error("invalid JSON body"))
      }
    })
  })
}

async function handleChatCompletions(req, res, opts) {
  if (!requireBearer(req, res, opts)) {
    return
  }

  let body
  try {
    body = await readJson(req)
  } catch (error) {
    json(res, 400, errorBody(error.message))
    return
  }

  if (body.stream === true) {
    json(res, 400, errorBody("streaming is not supported yet", "invalid_request_error", "unsupported_stream"))
    return
  }

  let model
  let prompt
  try {
    model = parseModelName(body.model || opts.defaultModel, opts.defaultProviderID, opts.defaultModelID)
    prompt = messagesToPrompt(body.messages)
  } catch (error) {
    json(res, 400, errorBody(error.message))
    return
  }

  try {
    const authorization = authHeader(opts)
    const result = await sendPrompt({
      baseUrl: opts.baseUrl,
      directory: opts.directory,
      envFile: opts.envFile,
      authorization,
      providerID: model.providerID,
      modelID: model.modelID,
      prompt: prompt.prompt,
      system: prompt.system,
    })
    json(res, 200, chatCompletionResponse({ model: model.model, text: result.text }), {
      "x-ocq-session": result.sessionID,
    })
  } catch (error) {
    json(res, 500, errorBody(error.message, "server_error"))
  }
}

function createGatewayServer(options = {}) {
  const opts = getServerOptions(options)
  opts.observability = options.observability || createObservabilityState()
  opts.authHeader = options.authHeader
  opts.sendPrompt = options.sendPrompt
  opts.listSessions = options.listSessions
  opts.getSession = options.getSession
  return http.createServer(async (req, res) => {
    const url = new URL(req.url, `http://${req.headers.host || `${opts.host}:${opts.port}`}`)
    const startedAt = process.hrtime.bigint()

    res.on("finish", () => {
      const durationMs = Number(process.hrtime.bigint() - startedAt) / 1e6
      opts.observability.recordRequest({
        method: req.method,
        path: url.pathname,
        status: res.statusCode,
        durationMs,
        headers: req.headers,
      })
      if (res.statusCode >= 500) {
        opts.observability.log("error", `${req.method} ${url.pathname} -> ${res.statusCode}`, {
          method: req.method,
          path: url.pathname,
          status: res.statusCode,
        })
      }
    })

    if (req.method === "GET" && url.pathname === "/health") {
      json(res, 200, { ok: true })
      return
    }

    if (url.pathname.startsWith("/ocq/") || url.pathname === "/metrics") {
      if (!requireBearer(req, res, opts)) return
    }

    if (req.method === "GET" && url.pathname === "/ocq/metrics") {
      json(res, 200, opts.observability.summary())
      return
    }

    if (req.method === "GET" && url.pathname === "/ocq/requests") {
      json(res, 200, { requests: opts.observability.requests.list() })
      return
    }

    if (req.method === "GET" && url.pathname === "/ocq/logs") {
      json(res, 200, { logs: opts.observability.logs.list() })
      return
    }

    if (req.method === "GET" && url.pathname === "/metrics") {
      res.writeHead(200, { "content-type": "text/plain; version=0.0.4; charset=utf-8" })
      res.end(prometheusMetrics(opts.observability))
      return
    }

    if (req.method === "POST" && url.pathname === "/v1/chat/completions") {
      await handleChatCompletions(req, res, opts)
      return
    }

    json(res, 404, errorBody("not found", "invalid_request_error", "not_found"))
  })
}

function listen(options = {}) {
  const opts = getServerOptions(options)
  if (!opts.gatewayKey) throw new Error("OCQ_GATEWAY_KEY is required")
  const server = createGatewayServer(opts)
  server.listen(opts.port, opts.host, () => {
    process.stdout.write(`ocq gateway listening on http://${opts.host}:${opts.port}\n`)
  })
  return server
}

module.exports = {
  DEFAULT_GATEWAY_HOST,
  DEFAULT_GATEWAY_PORT,
  getServerOptions,
  createGatewayServer,
  listen,
}
