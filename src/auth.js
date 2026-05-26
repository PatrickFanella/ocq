const { createHmac, timingSafeEqual } = require("node:crypto")

function safeEqual(actual, expected) {
  return actual.length === expected.length && timingSafeEqual(actual, expected)
}

function matchesGatewayKey(value, gatewayKey) {
  if (!gatewayKey) return false
  const actual = Buffer.from(String(value))
  const expected = Buffer.from(gatewayKey)
  return safeEqual(actual, expected)
}

function hasValidBearer(req, gatewayKey) {
  const prefix = "Bearer "
  const header = req.headers.authorization || ""
  if (!header.startsWith(prefix)) return false
  return matchesGatewayKey(header.slice(prefix.length), gatewayKey)
}

function signUiSession(gatewayKey, now = Date.now()) {
  const payload = Buffer.from(JSON.stringify({ iat: now })).toString("base64url")
  const signature = createHmac("sha256", gatewayKey).update(payload).digest("base64url")
  return `${payload}.${signature}`
}

function parseCookies(cookieHeader = "") {
  return Object.fromEntries(
    cookieHeader
      .split(";")
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const index = part.indexOf("=")
        if (index === -1) return [part, ""]
        return [part.slice(0, index), part.slice(index + 1)]
      }),
  )
}

function hasValidUiSession(req, gatewayKey) {
  if (!gatewayKey) return false
  const token = parseCookies(req.headers.cookie || "").ocq_ui_session
  if (!token) return false

  const [payload, signature, ...rest] = token.split(".")
  if (!payload || !signature || rest.length) return false

  const expected = Buffer.from(createHmac("sha256", gatewayKey).update(payload).digest("base64url"))
  const actual = Buffer.from(signature)
  if (!safeEqual(actual, expected)) return false

  try {
    const decoded = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"))
    return typeof decoded?.iat === "number" && Number.isFinite(decoded.iat)
  } catch {
    return false
  }
}

function redactHeaders(headers = {}) {
  const copy = { ...headers }
  for (const key of Object.keys(copy)) {
    if (key.toLowerCase() === "authorization") copy[key] = "[redacted]"
  }
  return copy
}

module.exports = { hasValidBearer, hasValidUiSession, matchesGatewayKey, redactHeaders, signUiSession }
