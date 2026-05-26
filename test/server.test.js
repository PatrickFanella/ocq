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

test("POST /v1/chat/completions supports stream true", async () => {
  let authHeaderCalls = 0
  let sendPromptCalls = 0
  const { server, url } = await listen(createGatewayServer({
    gatewayKey: "secret",
    authHeader() {
      authHeaderCalls += 1
      return "Basic injected"
    },
    async sendPrompt(input) {
      sendPromptCalls += 1
      assert.equal(input.authorization, "Basic injected")
      assert.equal(input.modelID, "gpt-5.4-mini")
      assert.equal(input.providerID, "openai")
      assert.equal(input.prompt, "user: hi there")
      assert.equal(input.sessionID, "session-incoming")
      return { sessionID: "session-123", text: "hello world" }
    },
  }))
  try {
    const response = await fetch(`${url}/v1/chat/completions`, {
      method: "POST",
      headers: {
        authorization: "Bearer secret",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "openai/gpt-5.4-mini",
        stream: true,
        ocq_session_id: "session-incoming",
        messages: [{ role: "user", content: "hi there" }],
      }),
    })
    const text = await response.text()
    assert.equal(response.status, 200)
    assert.match(response.headers.get("content-type"), /text\/event-stream/)
    assert.equal(response.headers.get("x-ocq-session"), "session-123")
    assert.equal(authHeaderCalls, 1)
    assert.equal(sendPromptCalls, 1)

    const events = text.trim().split(/\n\n/).map((block) => block.replace(/^data: /, ""))
    const chunks = events.slice(0, -1).map((event) => JSON.parse(event))
    assert.equal(events.at(-1), "[DONE]")
    assert.equal(chunks[0].object, "chat.completion.chunk")
    assert.equal(chunks[0].choices[0].delta.role, "assistant")
    assert.equal(chunks[1].choices[0].delta.content, "hello")
    assert.equal(chunks[2].choices[0].delta.content, " ")
    assert.equal(chunks[3].choices[0].delta.content, "world")
    assert.equal(chunks.at(-1).choices[0].finish_reason, "stop")
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
