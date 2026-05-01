# Codex Architecture Analysis

This document analyzes the architecture of `C:\Users\unlin\Desktop\Github\CLI\codex` from the perspective of packaging, runtime boundaries, major crates, and execution flows.

## Executive Summary

The `codex` repository is not a single CLI codebase. It is a layered system:

1. `codex-cli/` is the distribution and launcher layer.
2. `codex-rs/` is the real product implementation and contains the Rust workspace.
3. `sdk/` is the external integration layer for embedding Codex in TypeScript and Python applications.

The most important architectural conclusion is this:

- `app-server` is the real runtime boundary.
- The TUI and headless `exec` mode are both clients of that boundary.
- `core` contains the shared domain logic, but it is no longer the only integration surface.
- State, thread storage, protocol types, and tool schemas have already been split into dedicated crates to keep the system from collapsing into one giant library.

In short, Codex has evolved from "a CLI tool with some helper modules" into "a multi-surface agent runtime with a CLI/TUI front end."

## Top-Level Repository Layout

At the repo root, the directories have clearly different roles:

| Path | Role |
| --- | --- |
| `codex-cli/` | Node wrapper that selects and launches the platform-specific native Codex binary |
| `codex-rs/` | Main Rust workspace; this is the actual implementation |
| `sdk/` | Language SDKs that embed or drive Codex externally |
| `docs/` | Install and usage documentation |
| `tools/` | Repo maintenance and supporting tooling |
| `third_party/` | Vendored or external support content |

The root `package.json` is only for repository tooling and formatting tasks. It is not the primary runtime.

## Layer 1: Distribution and Launching

The npm-facing product is `codex-cli`, not the full implementation.

### What `codex-cli` actually does

Key files:

- `codex-cli/package.json`
- `codex-cli/bin/codex.js`

This layer is intentionally thin:

- It detects the current OS and CPU architecture.
- It maps that pair to a platform package such as `@openai/codex-win32-x64`.
- It resolves the vendored native binary path under that package.
- It prepends vendor-specific directories to `PATH` when needed.
- It `spawn()`s the native binary with `stdio: "inherit"`.
- It forwards termination signals to the child process.

This means the JavaScript package is primarily a delivery mechanism for the native binary, not a logic-heavy CLI implementation.

### Architectural implication

The public npm install flow is optimized for:

- shipping a native executable through familiar package managers
- keeping the launcher stable while the real product evolves in Rust
- minimizing startup logic in JavaScript

## Layer 2: Rust Workspace as the Real Product

The real system lives in `codex-rs/`.

Key files:

- `codex-rs/Cargo.toml`
- `codex-rs/README.md`

The workspace is heavily modularized. The most important crates for understanding the architecture are:

| Crate | Responsibility |
| --- | --- |
| `cli` | Top-level command router and process entrypoint |
| `tui` | Fullscreen interactive user interface |
| `exec` | Headless, automation-oriented execution surface |
| `app-server` | JSON-RPC runtime/API boundary used by rich clients |
| `app-server-client` | Shared in-process and remote client transport facade |
| `app-server-protocol` | Typed JSON-RPC request/response/notification definitions |
| `core` | Shared business logic and orchestration |
| `protocol` | Shared agent/domain protocol types beyond app-server transport |
| `state` | SQLite-backed metadata and memory/state persistence |
| `thread-store` | Thread persistence abstraction |
| `tools` | Shared tool schema/spec extraction layer |
| `sandboxing` / `exec-server` | Execution and isolation support |
| `mcp-server` / `codex-mcp` | MCP integration surfaces |

This is not accidental modularity. The crate boundaries show a deliberate architecture:

- UI surfaces are separated from domain logic.
- Runtime protocol is separated from storage.
- Transport is separated from orchestration.
- Packaging is separated from implementation.

## Layer 3: `cli` as the Command Router

Key file:

- `codex-rs/cli/src/main.rs`

The `cli` crate is the front door to the system. It is not where the core logic lives. Instead, it dispatches into multiple runtime surfaces.

Important command families include:

- default interactive TUI mode
- `exec`
- `review`
- `login` / `logout`
- `mcp`
- `mcp-server`
- `app-server`
- `sandbox`
- `apply`
- `resume`
- `fork`
- cloud- and account-related commands

It also exposes remote-runtime options such as:

- `--remote`
- `--remote-auth-token-env`

That is a strong signal that the CLI already treats "connect to an existing runtime" as a first-class mode, not as a debugging add-on.

### Architectural implication

`cli` is best understood as a multitool shell over several Codex runtimes:

- local interactive runtime
- local headless runtime
- directly exposed app-server runtime
- remote app-server client mode

## Layer 4: `app-server` is the Runtime Boundary

Key files:

- `codex-rs/app-server/README.md`
- `codex-rs/app-server-client/src/lib.rs`
- `codex-rs/app-server-client/src/remote.rs`

This is the most important part of the architecture.

The app-server is a JSON-RPC v2 style interface that powers rich clients. It supports at least:

- stdio JSONL transport
- websocket transport
- embedded in-process startup

Core concepts exposed by the server include:

- thread
- turn
- item
- approvals
- dynamic tools
- skills
- apps
- account/auth
- model listing
- filesystem and command execution
- plugin and marketplace operations

### Why this matters

Both local and remote client modes are built around the same contract.

The `app-server-client` crate provides:

- an in-process client facade used by local surfaces
- a websocket-backed remote client
- request/notification routing
- initialize handshake
- server-request resolution and rejection
- backpressure-aware event delivery

The TUI can therefore switch between:

- `Embedded`
- `Remote { websocket_url, auth_token }`

without needing a different high-level session model.

### Architectural implication

Codex is not simply "a TUI calling `core` directly."

Instead, the architecture is converging on:

- `core` for domain logic
- `app-server` for runtime API
- multiple clients on top of that runtime

That is the right shape for IDE integrations, SDKs, headless automation, and remote-hosted sessions.

## Layer 5: Two Main User-Facing Clients

### 1. `tui`: interactive full-screen client

Key files:

- `codex-rs/tui/src/lib.rs`
- `codex-rs/tui/src/app.rs`

The TUI is a substantial client, not a thin terminal wrapper. It manages:

- app-server session lifecycle
- resume and thread selection
- streaming transcript rendering
- bottom panes and terminal views
- collaboration modes
- onboarding
- status and notification handling
- model/session migration flows

Important architectural detail:

- the TUI can talk to an embedded in-process app server
- or it can connect to a remote app server over websocket

That makes the TUI a real client application over a stable runtime boundary.

### 2. `exec`: headless automation client

Key files:

- `codex-rs/exec/src/lib.rs`
- `codex-rs/exec/Cargo.toml`

`exec` is the automation surface. It:

- starts an in-process app-server client
- sends turns programmatically
- consumes streaming notifications
- converts those events into either human-readable output or JSONL
- handles review and resume flows
- rejects interactive approval and user-input patterns that do not fit headless mode

Important behavioral point:

- `exec` defaults to non-interactive assumptions such as `ApprovalPolicy::Never`

### Architectural implication

TUI and `exec` are siblings, not parent/child layers.

They are two different clients over the same runtime model:

- one optimized for human interactive use
- one optimized for automation and scripting

## Layer 6: `core` as the Shared Domain Brain

Key files:

- `codex-rs/core/src/lib.rs`
- `codex-rs/core/README.md`

`core` is still the center of the system's business logic. It exports and coordinates functionality around:

- agents
- config and config loading
- connectors
- execution policy
- guardians and safety
- MCP management
- memories
- plugins
- sandboxing
- skills
- thread management
- rollout persistence
- review formatting
- shell and process spawning
- web search

This crate is large because it contains the shared logic needed by multiple surfaces.

### Important nuance

The repo guidance explicitly says `codex-core` is already large and should not continue absorbing everything. The surrounding crates show the intended direction:

- move protocol contracts out
- move state handling out
- move storage abstractions out
- move reusable tool schemas out
- let clients depend on runtime contracts rather than directly on the whole core

So `core` is central, but the architecture is trying to stop it from becoming an unbounded monolith.

## Layer 7: State, Threads, and Persistence

Key files:

- `codex-rs/protocol/src/lib.rs`
- `codex-rs/state/src/lib.rs`
- `codex-rs/thread-store/src/lib.rs`

These crates separate different kinds of persistence concerns.

### `protocol`

This crate holds shared typed structures such as:

- account/auth types
- approvals
- dynamic tools
- item and protocol message shapes
- permissions
- user input requests
- thread identifiers

This is the type-contract layer for shared domain data.

### `state`

This is the metadata/state database layer, centered on SQLite-backed storage. It handles things such as:

- rollout metadata mirroring
- logs database
- state database
- thread metadata
- memory job state
- background backfill or consolidation bookkeeping

This is not just transcript storage; it is operational state.

### `thread-store`

This crate is the thread persistence abstraction. It provides storage-neutral operations for:

- create
- read
- list
- archive
- update
- append items

This separation is important because it keeps thread lifecycle logic from being hard-coded to one storage backend.

### Architectural implication

Codex distinguishes between:

- protocol contracts
- operational state
- thread transcript storage

That is a sign of a system that expects multiple clients, resumable sessions, and background processing.

## Layer 8: Tools, MCP, Sandboxing, and Execution

The repository is built around agent tool orchestration, not only chat UX.

### Tools

Key file:

- `codex-rs/tools/README.md`

`codex-tools` is intentionally a reusable tool schema/spec layer rather than the entire orchestration engine. That means:

- schema and contracts can stabilize separately
- orchestration can remain in `core`
- more crates can share tool definitions without importing the whole runtime

### MCP

Relevant crates include:

- `codex-rs/mcp-server`
- `codex-rs/codex-mcp`

The crate layout shows that MCP is treated as a platform surface, not a bolt-on utility. It participates in both runtime capabilities and external integration.

### Sandboxing and execution

Relevant crates include:

- `codex-rs/sandboxing`
- `codex-rs/exec-server`

The core README also documents platform-specific sandbox assumptions. This tells us sandboxing is designed as a cross-platform subsystem with runtime dependencies, not as a small wrapper around shell commands.

## Layer 9: Memories and Long-Lived Intelligence

Key file:

- `codex-rs/core/src/memories/README.md`

The memories subsystem has a two-phase startup pipeline:

1. Per-thread extraction into structured database records.
2. Global consolidation into filesystem artifacts plus consolidation-agent work.

This is architecturally important because it means Codex is designed around more than transient session state. It includes a background memory synthesis pipeline that turns completed interactions into longer-lived knowledge assets.

## Layer 10: External Integration via SDKs

Key files:

- `sdk/typescript/README.md`
- `sdk/python/README.md`

The SDK layer confirms that Codex is meant to be embedded, not only invoked manually in a terminal.

### TypeScript SDK

The TypeScript SDK wraps the `codex` CLI and exchanges JSONL events over stdin/stdout. It supports:

- starting and resuming threads
- buffered and streamed runs
- structured output schemas
- image inputs
- per-thread working directory control
- environment/config overrides

This is a process-wrapper style integration surface.

### Python SDK

The Python SDK is aimed at the app-server JSON-RPC v2 surface. It provides a more explicit client/runtime model:

- startup and initialize in the constructor
- thread-oriented execution
- direct app-server semantics
- pinned runtime packaging for published builds

This is closer to a first-class runtime API client than a simple CLI wrapper.

### Architectural implication

The SDK strategy mirrors the rest of the system:

- one integration path wraps the CLI process surface
- another integration path targets the app-server protocol surface

That again reinforces that app-server is the long-term stable runtime seam.

## End-to-End Execution Flows

### Flow A: Standard interactive `codex`

1. User runs `codex`.
2. `codex-cli/bin/codex.js` resolves the platform-specific native package.
3. The native Rust binary starts through the `cli` crate.
4. `cli` chooses interactive mode when no subcommand is given.
5. `tui` starts.
6. `tui` connects to either an embedded or remote app-server.
7. `app-server` delegates business behavior into `core`, storage, tools, and other subsystems.

### Flow B: Headless `codex exec`

1. User runs `codex exec`.
2. `cli` dispatches into the `exec` crate.
3. `exec` starts an in-process app-server client.
4. The app-server drives the turn.
5. `exec` consumes streamed notifications and emits text or JSONL.

### Flow C: Dedicated `codex app-server`

1. User or host process starts `codex app-server`.
2. External client connects over stdio JSONL or websocket.
3. Requests and notifications flow through `app-server-protocol`.
4. Runtime behavior is executed by the server using `core` and related crates.

### Flow D: Remote interactive client

1. A visible client is started with remote connection settings.
2. The client connects to an already-running app-server over websocket.
3. The client reuses the same thread/session model and event stream shape as local mode.

This topology is especially relevant for bridge-owned runtimes, IDE integrations, and distributed session hosts.

## Design Strengths

The architecture has several strong properties:

- Clear separation between packaging and implementation.
- A real runtime boundary (`app-server`) instead of UI code owning business logic directly.
- Multiple clients can share the same runtime model.
- Storage concerns are broken apart into protocol, state, and thread persistence.
- Tooling, MCP, sandboxing, and memories are treated as first-class subsystems.
- Remote-runtime support is native to the design rather than patched on later.

## Design Tensions and Risks

The crate structure also exposes a few tensions:

- `core` is still very large and remains a gravity well for shared behavior.
- There is a transitional period where some clients still need "legacy core" access while moving toward pure app-server RPC contracts.
- Multiple persistence layers (`rollouts`, state DB, thread store, memory artifacts) increase architectural power but also raise consistency and migration complexity.
- Supporting both embedded and remote topologies increases flexibility, but it also expands lifecycle, auth, and backpressure concerns.

These are normal tradeoffs for a system that is moving from a terminal app toward a platform runtime.

## Reading Order for Future Deep Dives

If someone needs to keep digging, this is the most useful order:

1. `codex-cli/bin/codex.js`
2. `codex-rs/README.md`
3. `codex-rs/cli/src/main.rs`
4. `codex-rs/app-server/README.md`
5. `codex-rs/app-server-client/src/lib.rs`
6. `codex-rs/tui/src/lib.rs`
7. `codex-rs/exec/src/lib.rs`
8. `codex-rs/core/src/lib.rs`
9. `codex-rs/protocol/src/lib.rs`
10. `codex-rs/state/src/lib.rs`
11. `codex-rs/thread-store/src/lib.rs`
12. `codex-rs/core/src/memories/README.md`
13. `sdk/typescript/README.md`
14. `sdk/python/README.md`

## Implications for `claude-code-wechat-channel`

This architecture has direct consequences for the current WeChat bridge integration.

### 1. Integrate at the app-server or remote-client seam

The safest long-term integration point is not the TUI internals and not direct `core` coupling.

It is one of these:

- launch a local `codex app-server` and talk to it as a client
- launch a bridge-owned runtime host and connect a visible Codex client remotely

That matches Codex's own architecture instead of fighting it.

### 2. Treat the visible Codex UI as a client, not as the runtime owner

Because the TUI already supports remote app-server mode, a bridge can own:

- process lifecycle
- thread identity
- auth token wiring
- session reuse

while the visible Codex window behaves as a remote client attached to that runtime.

This is exactly why endpoint fields such as websocket URL, auth token source, and shared thread ID matter.

### 3. Avoid deep dependencies on unstable TUI details

The TUI is feature-rich, but it is still a client surface. If the integration reaches too deeply into TUI-specific behavior, it will be more fragile than an integration built around:

- app-server protocol
- thread lifecycle APIs
- remote resume/fork entrypoints

### 4. Prefer thread-centric state handoff

The repo is organized around threads, turns, and items. A bridge should therefore prefer:

- stable thread IDs
- resume semantics
- explicit runtime endpoint metadata

over ad hoc screen scraping or implicit state transfer.

## Final Conclusion

The best mental model for Codex is:

- `codex-cli` distributes a native binary.
- `cli` routes commands into one of several runtime surfaces.
- `app-server` is the central runtime/API seam.
- `tui` and `exec` are specialized clients over that seam.
- `core` provides shared agent logic.
- `protocol`, `state`, `thread-store`, and `tools` split contracts, persistence, and reusable schemas into dedicated layers.
- `sdk/` extends the same runtime outward into application embedding scenarios.

That architecture explains why remote clients, bridge-owned runtimes, SDK embedding, and local TUI usage can all coexist without each surface reinventing the agent runtime.
