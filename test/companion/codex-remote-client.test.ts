import { describe, expect, test } from "bun:test";
import path from "node:path";

import {
  buildRemoteCodexClientArgs,
  buildRemoteCodexClientEnv,
} from "../../src/companion/codex-remote-client.ts";
import {
  CODEX_REMOTE_AUTH_TOKEN_ENV,
  LOCAL_CLIENT_PROTOCOL_VERSION,
  type LocalClientEndpoint,
} from "../../src/runtime/runtime-types.ts";

function buildEndpoint(
  overrides: Partial<LocalClientEndpoint> = {},
): LocalClientEndpoint {
  return {
    protocolVersion: LOCAL_CLIENT_PROTOCOL_VERSION,
    runtimeKind: "codex_runtime_host",
    instanceId: "bridge-123",
    kind: "codex",
    port: 8123,
    token: "super-secret-token",
    renderMode: "headless",
    bridgeOwnerPid: 9001,
    serverPort: 8123,
    serverUrl: "ws://127.0.0.1:8123",
    remoteAuthTokenEnv: CODEX_REMOTE_AUTH_TOKEN_ENV,
    cwd: path.resolve("./tmp/project"),
    command: "codex",
    profile: "wechat",
    sharedThreadId: "thread_123",
    startedAt: "2026-04-15T08:00:00.000Z",
    ...overrides,
  };
}

describe("codex remote client helpers", () => {
  test("buildRemoteCodexClientArgs targets the bridge-owned app-server", () => {
    expect(buildRemoteCodexClientArgs(buildEndpoint())).toEqual([
      "resume",
      "thread_123",
      "--enable",
      "tui_app_server",
      "--remote",
      "ws://127.0.0.1:8123",
      "--profile",
      "wechat",
      "--remote-auth-token-env",
      CODEX_REMOTE_AUTH_TOKEN_ENV,
    ]);
  });

  test("buildRemoteCodexClientEnv injects the bridge token into the configured env var", () => {
    const endpoint = buildEndpoint({
      remoteAuthTokenEnv: "CUSTOM_CODEX_TOKEN",
    });
    const env = buildRemoteCodexClientEnv(endpoint, {
      PATH: "/usr/bin",
      HOME: "/tmp/home",
    });

    expect(env.PATH).toBe("/usr/bin");
    expect(env.HOME).toBe("/tmp/home");
    expect(env.CUSTOM_CODEX_TOKEN).toBe("super-secret-token");
  });
});
