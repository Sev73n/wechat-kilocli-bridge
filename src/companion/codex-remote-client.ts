#!/usr/bin/env node

import { spawn } from "node:child_process";
import path from "node:path";

import {
  buildCliEnvironment,
  buildCodexCliArgs,
  resolveSpawnTarget,
} from "../bridge/bridge-adapters.shared.ts";
import {
  readLocalCompanionEndpoint,
  type LocalCompanionEndpoint,
} from "./local-companion-link.ts";
import { migrateLegacyChannelFiles } from "../wechat/channel-config.ts";
import { CODEX_REMOTE_AUTH_TOKEN_ENV } from "../runtime/runtime-types.ts";

type CodexRemoteClientCliOptions = {
  cwd: string;
};

function log(message: string): void {
  process.stderr.write(`[codex-remote-client] ${message}\n`);
}

export function parseCliArgs(argv: string[]): CodexRemoteClientCliOptions {
  let cwd = process.cwd();

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = argv[i + 1];

    if (arg === "--help" || arg === "-h") {
      process.stdout.write(
        [
          "Usage: wechat-codex [--cwd <path>]",
          "",
          'Starts the visible native Codex client and connects it to the running "wechat-bridge-codex" instance for the current directory.',
          "",
        ].join("\n"),
      );
      process.exit(0);
    }

    if (arg === "--cwd") {
      if (!next) {
        throw new Error("--cwd requires a value");
      }
      cwd = path.resolve(next);
      i += 1;
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  return { cwd };
}

export function readCodexRuntimeEndpoint(cwd: string): LocalCompanionEndpoint {
  const endpoint = readLocalCompanionEndpoint(cwd);
  if (!endpoint || endpoint.kind !== "codex") {
    throw new Error(
      `No active Codex bridge endpoint was found for ${cwd}. Start "wechat-bridge-codex" in that directory first.`,
    );
  }

  if (endpoint.runtimeKind !== "codex_runtime_host" || (!endpoint.serverUrl && !endpoint.serverPort)) {
    throw new Error(
      `The running Codex bridge for ${cwd} is using an older local companion protocol. Restart "wechat-bridge-codex" in that directory first.`,
    );
  }

  return endpoint;
}

export function buildRemoteCodexClientArgs(endpoint: LocalCompanionEndpoint): string[] {
  const remoteUrl = endpoint.serverUrl ?? `ws://127.0.0.1:${endpoint.serverPort ?? endpoint.port}`;
  const args = buildCodexCliArgs(remoteUrl, {
    profile: endpoint.profile,
    resumeThreadId: endpoint.sharedThreadId,
  });
  const tokenEnvName = endpoint.remoteAuthTokenEnv ?? CODEX_REMOTE_AUTH_TOKEN_ENV;
  return [...args, "--remote-auth-token-env", tokenEnvName];
}

export function buildRemoteCodexClientEnv(
  endpoint: LocalCompanionEndpoint,
  env: Record<string, string | undefined> = process.env as Record<string, string | undefined>,
): Record<string, string> {
  const tokenEnvName = endpoint.remoteAuthTokenEnv ?? CODEX_REMOTE_AUTH_TOKEN_ENV;
  const nextEnv = buildCliEnvironment("codex", { env });
  nextEnv[tokenEnvName] = endpoint.token;
  return nextEnv;
}

export async function runCodexRemoteClientFromEndpoint(
  endpoint: LocalCompanionEndpoint,
): Promise<number> {
  const spawnTarget = resolveSpawnTarget(endpoint.command, "codex");
  const args = buildRemoteCodexClientArgs(endpoint);
  const env = buildRemoteCodexClientEnv(endpoint);

  return await new Promise<number>((resolve, reject) => {
    const child = spawn(
      spawnTarget.file,
      [...spawnTarget.args, ...args],
      {
        cwd: endpoint.cwd,
        env,
        stdio: "inherit",
        windowsHide: false,
      },
    );

    child.once("error", (error) => reject(error));
    child.once("exit", (code, signal) => {
      if (signal) {
        process.kill(process.pid, signal);
        return;
      }
      resolve(code ?? 0);
    });
  });
}

export async function runCodexRemoteClient(
  options: CodexRemoteClientCliOptions,
): Promise<number> {
  const endpoint = readCodexRuntimeEndpoint(options.cwd);
  return await runCodexRemoteClientFromEndpoint(endpoint);
}

async function main(): Promise<void> {
  migrateLegacyChannelFiles(log);
  const options = parseCliArgs(process.argv.slice(2));
  const exitCode = await runCodexRemoteClient(options);
  process.exit(exitCode);
}

const isDirectRun = Boolean((import.meta as ImportMeta & { main?: boolean }).main);
if (isDirectRun) {
  main().catch((error) => {
    log(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
