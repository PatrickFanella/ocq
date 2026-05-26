const { randomUUID } = require("node:crypto")

function parseModelName(model, fallbackProviderID, fallbackModelID) {
  const value = model || `${fallbackProviderID}/${fallbackModelID}`
  const slash = value.indexOf("/")
  if (slash < 0 && fallbackProviderID) {
    return {
      providerID: fallbackProviderID,
      modelID: value || fallbackModelID,
      model: `${fallbackProviderID}/${value || fallbackModelID}`,
    }
  }
  if (slash <= 0 || slash === value.length - 1) {
    throw new Error("model must be provider/model")
  }
  return {
    providerID: value.slice(0, slash),
    modelID: value.slice(slash + 1),
    model: value,
  }
}

function normalizeContent(content) {
  if (typeof content === "string") return content
  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === "string") return part
        if (part?.type === "text" && typeof part.text === "string") return part.text
        return ""
      })
      .filter(Boolean)
      .join("\n")
  }
  return content == null ? "" : String(content)
}

function messagesToPrompt(messages) {
  if (!Array.isArray(messages) || messages.length === 0) {
    throw new Error("messages must be a non-empty array")
  }

  const system = []
  const prompt = []
  for (const message of messages) {
    const role = message?.role
    const text = normalizeContent(message?.content).trim()
    if (!role || !text) continue
    if (role === "system") {
      system.push(text)
    } else {
      prompt.push(`${role}: ${text}`)
    }
  }

  if (prompt.length === 0) throw new Error("messages must include non-system content")
  return {
    system: system.length ? system.join("\n\n") : undefined,
    prompt: prompt.join("\n\n"),
  }
}

function chatCompletionResponse({ model, text }) {
  return {
    id: `chatcmpl-${randomUUID()}`,
    object: "chat.completion",
    created: Math.floor(Date.now() / 1000),
    model,
    choices: [
      {
        index: 0,
        message: { role: "assistant", content: text || "" },
        finish_reason: "stop",
      },
    ],
  }
}

module.exports = {
  parseModelName,
  messagesToPrompt,
  chatCompletionResponse,
}
