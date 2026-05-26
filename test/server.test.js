const test = require("node:test")
const assert = require("node:assert/strict")
const { createGatewayServer } = require("../src/server")
const { listen, close, jsonFetch } = require("./helpers")

test("GET /health returns ok", async () => {
  const { server, url } = await listen(createGatewayServer({ gatewayKey: "secret" }))
  try {
    const { response, body } = await jsonFetch(`${url}/health`)
    assert.equal(response.status, 200)
    assert.deepEqual(body, { ok: true })
  } finally {
    await close(server)
  }
})

test("POST /v1/chat/completions rejects missing bearer", async () => {
  const { server, url } = await listen(createGatewayServer({ gatewayKey: "secret" }))
  try {
    const { response, body } = await jsonFetch(`${url}/v1/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ model: "openai/gpt-5.4-mini", messages: [{ role: "user", content: "hi" }] }),
    })
    assert.equal(response.status, 401)
    assert.equal(body.error.code, "unauthorized")
  } finally {
    await close(server)
  }
})

test("GET /ocq/metrics returns UI metrics summary", async () => {
  const { server, url } = await listen(createGatewayServer({ gatewayKey: "secret" }))
  try {
    const { response, body } = await jsonFetch(`${url}/ocq/metrics`, {
      headers: { authorization: "Bearer secret" },
    })
    assert.equal(response.status, 200)
    assert.equal(typeof body.uptimeSeconds, "number")
    assert.equal(body.activeStreams, 0)
    assert.ok(Array.isArray(body.latencyBuckets))
  } finally {
    await close(server)
  }
})

test("GET /metrics exposes Prometheus text", async () => {
  const { server, url } = await listen(createGatewayServer({ gatewayKey: "secret" }))
  try {
    const response = await fetch(`${url}/metrics`, { headers: { authorization: "Bearer secret" } })
    const text = await response.text()
    assert.equal(response.status, 200)
    assert.match(response.headers.get("content-type"), /text\/plain/)
    assert.match(text, /# HELP ocq_gateway_requests_total/)
    assert.match(text, /ocq_gateway_active_streams/)
  } finally {
    await close(server)
  }
})
