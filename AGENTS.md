# Repository Guidelines

## Project Structure & Module Organization
`src/bridge` contains bridge lifecycle, adapter selection, approvals, and workspace state. `src/companion` holds local Codex, Claude, and OpenCode companion launchers plus IPC helpers. `src/wechat` handles setup, transport, and channel config. Shared CLI helpers live in `src/commands` and `src/utils`. Executable wrappers are in `bin/*.mjs`.

Tests mirror the runtime areas: `test/bridge`, `test/companion`, and `test/wechat`. Docs, screenshots, and release notes live under `docs/`.

## Build, Test, and Development Commands
`bun install` installs dependencies.

`bun run setup` performs initial WeChat channel login.

`bun run bridge:codex`, `bun run bridge:claude`, and `bun run bridge:opencode` start adapter-specific bridges in the current workspace.

`bun run codex:start`, `bun run claude:start`, and `bun run opencode:start` launch or reuse the local companion for the current folder.

`bun run check` validates channel state without starting the full service.

`bun run test`, `bun run test:bridge`, `bun run test:companion`, `bun run test:wechat`, and `bun run test:watch` run the Bun test suites. There is no separate build step; the project runs TypeScript directly with Node 24 strip-types support.

## Coding Style & Naming Conventions
Use TypeScript ESM with strict typing. Match the existing style: 2-space indentation, semicolons, double quotes, and explicit `.ts` import extensions. Prefer `camelCase` for functions and variables, `PascalCase` for classes and types, and kebab-case filenames like `bridge-final-reply.ts`.

Keep adapter-specific logic inside the relevant `bridge-adapters.*.ts` or companion module instead of spreading conditionals elsewhere. No formatter or lint config is checked in, so keep edits small and consistent with nearby code.

## Testing Guidelines
Tests use `bun:test`. Name files `*.test.ts` and place them in the matching `test/<area>/` directory. Add focused regression coverage for bridge lifecycle changes, adapter-specific message formatting, workspace locking, and WeChat transport behavior. No numeric coverage gate is enforced, but fixes in these paths should ship with tests.

## Commit & Pull Request Guidelines
Recent commits follow Conventional Commit prefixes such as `fix:`, `feat:`, `refactor:`, and `docs:`. Keep subjects imperative and behavior-focused, for example: `fix: prevent bridge from exiting on transient companion disconnection`.

Pull requests should summarize the affected adapter(s), describe the user-visible behavior change, and list the commands you ran. Include terminal screenshots or WeChat output snippets when changing approval prompts, onboarding, or message formatting.

## Security & Configuration Tips
Do not commit local credentials, bridge logs, or workspace state from `~/.claude/channels/wechat`. When adding configuration, document new environment variables alongside existing overrides such as `WECHAT_ILINK_BASE_URL` and `CLAUDE_WECHAT_CHANNEL_DATA_DIR`.
