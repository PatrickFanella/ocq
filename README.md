# ocq

Tiny CLI for one-shot prompts to a local OpenCode server.

`ocq` creates or continues an OpenCode session, sends one prompt, and prints the assistant response. It is useful for fast terminal questions and popup/chat wrappers.

## Requirements

- Node.js 18+
- OpenCode server running locally, for example:

```sh
opencode serve --hostname 0.0.0.0 --port 4096
```

- Basic auth credentials in an env file, default:

```sh
~/.config/opencode/server.env
```

Expected keys:

```sh
OPENCODE_SERVER_USERNAME=...
OPENCODE_SERVER_PASSWORD=...
```

Do not commit this env file.

## Install

Clone and link locally:

```sh
git clone https://github.com/PatrickFanella/ocq.git
cd ocq
npm link
```

Or run directly:

```sh
./bin/ocq "reply with exactly: ok"
```

## Usage

```sh
ocq [options] <prompt>
```

Options:

```text
  -s, --session <id>       Continue an existing session
  -m, --model <model>      Model ID or provider/model
  -p, --provider <id>      Provider ID
  -d, --directory <path>   OpenCode directory context
  -u, --url <url>          OpenCode server URL
      --env <path>         Server env file
      --system <text>      System prompt override
      --no-system          Do not send a system prompt
      --agent <name>       OpenCode agent name
      --title <title>      Title for newly-created session
      --json               Print JSON { sessionID, messageID, text }
  -h, --help               Show help
```

Defaults:

- URL: `http://127.0.0.1:4096`
- provider/model: `openai/gpt-5.4-mini`
- directory: `$HOME`
- env file: `~/.config/opencode/server.env`

## Examples

```sh
ocq "what changed in OpenCode recently?"
ocq --json "start a quick conversation"
ocq --session ses_abc123 "follow up"
ocq --model openai/gpt-5.4-mini "quick answer"
```

## Environment overrides

```sh
OPENCODE_SERVER_URL=http://127.0.0.1:4096
OPENCODE_SERVER_USERNAME=...
OPENCODE_SERVER_PASSWORD=...
OCQ_PROVIDER=openai
OCQ_MODEL=gpt-5.4-mini
OCQ_DIRECTORY=$HOME
OCQ_ENV_FILE=$HOME/.config/opencode/server.env
OCQ_SYSTEM="Use browser tools when needed. Otherwise answer concisely."
```

## License

MIT
