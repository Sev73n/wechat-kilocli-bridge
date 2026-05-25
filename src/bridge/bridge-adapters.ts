import type { BridgeAdapter } from "./bridge-types.ts";
import { ClaudeCompanionAdapter } from "./bridge-adapters.claude.ts";
import { LocalCompanionProxyAdapter } from "./bridge-adapters.core.ts";
import { CodexPtyAdapter } from "./bridge-adapters.codex.ts";
import { OpenCodeServerAdapter } from "./bridge-adapters.opencode.ts";
import { ShellAdapter } from "./bridge-adapters.shell.ts";
import type { AdapterOptions } from "./bridge-adapters.shared.ts";

export * from "./bridge-adapters.shared.ts";

export function createBridgeAdapter(options: AdapterOptions): BridgeAdapter {
  // Kilo is a fork of OpenCode that shares the same HTTP server API + SDK.
  // We normalize "kilo" → "opencode" here so the entire downstream pipeline
  // (state, utils, bridge controller, SSE handling, etc.) treats it as an
  // opencode session. Kilo-specific differences (binary name, basic auth,
  // KILO_SERVER_PASSWORD env) are passed in via `options.authHeader` and
  // `options.extraServerEnv` which OpenCodeServerAdapter already consumes.
  //
  // For kilo we additionally force `renderMode: "companion"` so the adapter
  // owns its `kilo serve` subprocess directly (instead of waiting for a
  // separate `wechat-kilo` terminal to bring one up), and set
  // `skipNativeClient: true` so it never tries to launch a visible TUI on the
  // host running the bridge — a server typically has no usable terminal.
  let normalized: AdapterOptions;
  if (options.kind === "kilo") {
    normalized = {
      ...options,
      kind: "opencode",
      renderMode: "companion",
      skipNativeClient: options.skipNativeClient ?? true,
    };
  } else {
    normalized = options;
  }

  switch (normalized.kind) {
    case "codex":
      return normalized.renderMode === "panel"
        ? new CodexPtyAdapter(normalized)
        : new LocalCompanionProxyAdapter(normalized);
    case "claude":
      return normalized.renderMode === "companion"
        ? new ClaudeCompanionAdapter(normalized)
        : new LocalCompanionProxyAdapter(normalized);
    case "opencode":
      return normalized.renderMode === "companion"
        ? new OpenCodeServerAdapter(normalized)
        : new LocalCompanionProxyAdapter(normalized);
    case "shell":
      return new ShellAdapter(normalized);
    default:
      throw new Error(`Unsupported adapter: ${normalized.kind}`);
  }
}
