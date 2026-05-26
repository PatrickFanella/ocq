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
