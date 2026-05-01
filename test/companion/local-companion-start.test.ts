import { describe, expect, test } from "bun:test";
import path from "node:path";

import {
  buildBackgroundBridgeArgs,
  isSameWorkspaceCwd,
  normalizeComparablePath,
  parseCliArgs,
  runVisibleClient,
} from "../../src/companion/local-companion-start.ts";

describe("local-companion-start helpers", () => {
  test("parseCliArgs uses current working directory by default", () => {
    const options = parseCliArgs([]);
    expect(options.adapter).toBe("codex");
    expect(options.cwd).toBe(process.cwd());
    expect(options.timeoutMs).toBe(15000);
    expect(options.cliArgs).toEqual([]);
  });

  test("parseCliArgs parses adapter, cwd, profile, timeout, and forwarded args", () => {
    const options = parseCliArgs([
      "--adapter",
      "claude",
      "--cwd",
      "./tmp/project",
      "--model",
      "sonnet",
      "--profile",
      "work",
      "--timeout-ms",
      "25000",
      "--dangerously-skip-permissions",
    ]);

    expect(options.adapter).toBe("claude");
    expect(options.cwd).toBe(path.resolve("./tmp/project"));
    expect(options.profile).toBe("work");
    expect(options.timeoutMs).toBe(25000);
    expect(options.cliArgs).toEqual([
      "--model",
      "sonnet",
      "--dangerously-skip-permissions",
    ]);
  });

  test("buildBackgroundBridgeArgs binds codex background bridge to the launcher lifetime", () => {
    const args = buildBackgroundBridgeArgs("/tmp/wechat-bridge.ts", {
      adapter: "codex",
      cwd: path.resolve("./tmp/project"),
      profile: "work",
      timeoutMs: 15000,
    });

    expect(args).toEqual([
      "--no-warnings",
      "--experimental-strip-types",
      "/tmp/wechat-bridge.ts",
      "--adapter",
      "codex",
      "--cwd",
      path.resolve("./tmp/project"),
      "--lifecycle",
      "companion_bound",
      "--profile",
      "work",
    ]);
  });

  test("buildBackgroundBridgeArgs can launch claude in the background", () => {
    const args = buildBackgroundBridgeArgs("/tmp/wechat-bridge.ts", {
      adapter: "claude",
      cwd: path.resolve("./tmp/project"),
      timeoutMs: 15000,
    });

    expect(args).toEqual([
      "--no-warnings",
      "--experimental-strip-types",
      "/tmp/wechat-bridge.ts",
      "--adapter",
      "claude",
      "--cwd",
      path.resolve("./tmp/project"),
      "--lifecycle",
      "companion_bound",
    ]);
  });

  test("buildBackgroundBridgeArgs keeps the OpenCode bridge companion_bound", () => {
    const args = buildBackgroundBridgeArgs("/tmp/wechat-bridge.ts", {
      adapter: "opencode",
      cwd: path.resolve("./tmp/project"),
      timeoutMs: 15000,
    });

    expect(args).toEqual([
      "--no-warnings",
      "--experimental-strip-types",
      "/tmp/wechat-bridge.ts",
      "--adapter",
      "opencode",
      "--cwd",
      path.resolve("./tmp/project"),
      "--lifecycle",
      "companion_bound",
    ]);
  });

  test("runVisibleClient routes codex through the in-process remote client", async () => {
    const calls: Array<{ cwd: string }> = [];
    const exitCode = await runVisibleClient(
      {
        adapter: "codex",
        cwd: path.resolve("./tmp/project"),
        timeoutMs: 15000,
        cliArgs: ["--yolo"],
      },
      {
        codexRemoteClient: async (options) => {
          calls.push(options);
          return 7;
        },
        localCompanion: async () => {
          throw new Error("local companion should not be used for codex");
        },
      },
    );

    expect(exitCode).toBe(7);
    expect(calls).toEqual([
      {
        cwd: path.resolve("./tmp/project"),
        cliArgs: ["--yolo"],
      },
    ]);
  });

  test("runVisibleClient routes OpenCode through the shared in-process companion", async () => {
    const calls: Array<{ adapter: string; cwd: string }> = [];
    const exitCode = await runVisibleClient(
      {
        adapter: "opencode",
        cwd: path.resolve("./tmp/project"),
        timeoutMs: 15000,
        cliArgs: ["--mode", "build"],
      },
      {
        codexRemoteClient: async () => {
          throw new Error("codex remote client should not be used for opencode");
        },
        localCompanion: async (options) => {
          calls.push(options);
          return 9;
        },
      },
    );

    expect(exitCode).toBe(9);
    expect(calls).toEqual([
      {
        adapter: "opencode",
        cwd: path.resolve("./tmp/project"),
        cliArgs: ["--mode", "build"],
      },
    ]);
  });

  test("runVisibleClient keeps adapter forwarding for local companions", async () => {
    const calls: Array<{ adapter: string; cwd: string }> = [];
    const exitCode = await runVisibleClient(
      {
        adapter: "claude",
        cwd: path.resolve("./tmp/project"),
        timeoutMs: 15000,
        cliArgs: ["--debug"],
      },
      {
        codexRemoteClient: async () => {
          throw new Error("codex remote client should not be used for claude");
        },
        localCompanion: async (options) => {
          calls.push(options);
          return 11;
        },
      },
    );

    expect(exitCode).toBe(11);
    expect(calls).toEqual([
      {
        adapter: "claude",
        cwd: path.resolve("./tmp/project"),
        cliArgs: ["--debug"],
      },
    ]);
  });

  test("buildBackgroundBridgeArgs keeps the launch cwd stable for codex", () => {
    const args = buildBackgroundBridgeArgs("/tmp/wechat-bridge.ts", {
      adapter: "codex",
      cwd: path.resolve("./tmp/project"),
      timeoutMs: 15000,
    });

    expect(args).toEqual([
      "--no-warnings",
      "--experimental-strip-types",
      "/tmp/wechat-bridge.ts",
      "--adapter",
      "codex",
      "--cwd",
      path.resolve("./tmp/project"),
      "--lifecycle",
      "companion_bound",
    ]);
  });

  test("normalizeComparablePath is stable for the same logical cwd", () => {
    const first = normalizeComparablePath(".");
    const second = normalizeComparablePath(process.cwd());
    expect(first).toBe(second);
  });

  test("isSameWorkspaceCwd matches equivalent directory paths", () => {
    expect(isSameWorkspaceCwd(".", process.cwd())).toBe(true);
  });
});
