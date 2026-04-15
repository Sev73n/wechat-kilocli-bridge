import { createBridgeAdapter } from "../bridge/bridge-adapters.ts";
import { CodexPtyAdapter } from "../bridge/bridge-adapters.codex.ts";
import type { AdapterOptions } from "../bridge/bridge-adapters.shared.ts";
import { LegacyAdapterRuntime } from "./legacy-adapter-runtime.ts";
import type { RuntimeHost } from "./runtime-types.ts";

export function createRuntimeHost(options: AdapterOptions): RuntimeHost {
  if (options.kind === "codex") {
    return new CodexPtyAdapter({
      ...options,
      renderMode: options.renderMode ?? "headless",
    });
  }

  return new LegacyAdapterRuntime(createBridgeAdapter(options));
}
