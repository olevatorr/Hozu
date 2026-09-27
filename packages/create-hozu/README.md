<img src="https://raw.githubusercontent.com/olevatorr/Hozu/main/docs/assets/logo.png" alt="Hozu logo" width="72">

# create-hozu

Create a Hozu app, set up for Claude Code or for agents that read AGENTS.md.

Part of [Hozu](https://github.com/olevatorr/Hozu#readme), an AI-first web framework. It creates an app and sets it up for a coding agent:

```sh
npm create hozu@latest my-app -- --agent claude   # CLAUDE.md + .claude/skills/hozu
npm create hozu@latest my-app -- --agent agents   # AGENTS.md + .agents/skills/hozu (Codex, Cursor, Copilot…)
npm create hozu@latest my-app -- --agent both
```

Without `--agent` it asks.

```sh
npm create hozu@latest my-app
```

Requires Node 22.18 or newer. Documentation: the [README](https://github.com/olevatorr/Hozu#readme) and the
agent skill that `create-hozu` writes into each app.

MIT © olevatorr
