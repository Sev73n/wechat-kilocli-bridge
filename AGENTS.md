# Repository Guidelines

## Project Overview

This project bridges WeChat ClawBot to a local [Kilo Code CLI](https://kilo.ai) instance via `kilo serve` HTTP API. Messages from WeChat are forwarded to the local Kilo session; replies stream back to WeChat via iLink.

The bridge runs as a **user-level systemd service** (`deploy/wechat-bridge.service`) with `--adapter kilo`.

## Project Structure

```
src/
├── bridge/          # Bridge lifecycle, adapter selection, approvals, workspace state
├── companion/       # Local companion launchers and IPC helpers
├── wechat/          # WeChat setup, iLink transport, channel config
├── commands/        # CLI helpers (check-update)
├── utils/           # Shared utilities (version-checker)
├── media/           # Media type helpers
└── runtime/         # Runtime type definitions
bin/                 # Global CLI entry points (kilo-only)
deploy/              # systemd service file and install script
test/                # Tests mirroring src areas (bridge/, companion/, wechat/)
```

## Key Entry Points

| File | Role |
| --- | --- |
| `src/bridge/wechat-bridge.ts` | Main bridge entry; run with `--adapter kilo` |
| `src/bridge/bridge-adapters.ts` | Adapter factory; normalizes `kilo` → `opencode` internally |
| `src/bridge/bridge-adapters.opencode.ts` | OpenCode/Kilo HTTP server adapter (shared impl) |
| `src/companion/local-companion-start.ts` | One-shot launcher: starts bridge + opens local TUI |
| `src/companion/local-companion.ts` | Local companion process (connects to bridge socket) |
| `src/wechat/setup.ts` | WeChat QR login and credential init |

## Build, Test, and Development Commands

```bash
npm run setup           # WeChat QR login
npm run bridge:kilo     # Start bridge headless (server mode)
npm run kilo:start      # Start bridge + open local Kilo TUI (desktop)
npm run kilo:panel      # Open local Kilo TUI (bridge already running)
npm run check           # Validate WeChat channel state, no service start
npm test                # Run all tests
npm run test:bridge
npm run test:companion
npm run test:wechat
npm run build           # Compile TypeScript to dist/
```

## Coding Style

- TypeScript ESM with strict typing
- 2-space indentation, semicolons, double quotes, explicit `.ts` import extensions
- `camelCase` for functions/variables, `PascalCase` for classes/types, `kebab-case` filenames
- Keep adapter-specific logic inside `bridge-adapters.*.ts`; avoid spreading conditionals

## Testing

Tests use `bun:test`. Name files `*.test.ts`, place in `test/<area>/`. Cover bridge lifecycle changes, message formatting, workspace locking, and WeChat transport behavior.

## Security

- Do **not** commit credentials, bridge logs, or workspace state from `~/.claude/channels/wechat/`
- `KILO_SERVER_PASSWORD` is auto-generated at runtime; never hardcode it
- `.claude/` and `.kilo/` are gitignored
