# create-tenon

Create a Tenon app, set up for Claude Code or for agents that read AGENTS.md.

Part of [Tenon](https://github.com/olevatorr/Tenon#readme), an AI-first web framework. It creates an app and sets it up for a coding agent:

```sh
npm create tenon@latest my-app -- --agent claude   # CLAUDE.md + .claude/skills/tenon
npm create tenon@latest my-app -- --agent agents   # AGENTS.md + .agents/skills/tenon (Codex, Cursor, Copilot…)
npm create tenon@latest my-app -- --agent both
```

Without `--agent` it asks.

```sh
npm create tenon@latest my-app
```

Requires Node 22.18 or newer. Documentation: the [README](https://github.com/olevatorr/Tenon#readme) and the
agent skill that `create-tenon` writes into each app.

MIT © olevatorr
