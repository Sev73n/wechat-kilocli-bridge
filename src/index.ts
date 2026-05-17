import fs from "node:fs";
import path from "node:path";
import {
  WeChatClient,
  normalizeAccountId,
  MessageType,
  type WeixinMessage,
} from "../vendor/wechat-ilink-client/dist/index.mjs";
import type { EventEmitter } from "node:events";
import { SessionStore } from "./session-store.ts";
import { Allowlist } from "./allowlist.ts";
import { handleCommand } from "./commands.ts";
import { runKilo, findKiloServer, startKiloServer } from "./kilo-runner.ts";

const DATA_DIR = path.resolve("data");
const WORK_DIR = process.env.KILO_WORK_DIR ?? "/tmp/kilo-wechat-workspace";

const allow = new Allowlist(path.join(DATA_DIR, "allowlist.json"));
const store = new SessionStore(path.join(DATA_DIR, "sessions.json"));
const credentialsPath = path.join(DATA_DIR, "wechat-credentials.json");
const syncBufPath = path.join(DATA_DIR, "sync-buf.json");

if (allow.isEmpty()) {
  console.error("[FATAL] allowlist is empty! Add wxid(s) to data/allowlist.json before starting.");
  console.error("Tip: send /whoami to the bridge to get your wxid.");
  process.exit(1);
}

if (!fs.existsSync(WORK_DIR)) fs.mkdirSync(WORK_DIR, { recursive: true });
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

interface SavedCredentials {
  accountId: string;
  token: string;
  baseUrl?: string;
  userId?: string;
}

function loadCredentials(): SavedCredentials | null {
  try {
    const raw = fs.readFileSync(credentialsPath, "utf-8");
    return JSON.parse(raw) as SavedCredentials;
  } catch {
    return null;
  }
}

function saveCredentials(creds: SavedCredentials): void {
  fs.writeFileSync(credentialsPath, JSON.stringify(creds, null, 2), "utf-8");
  try { fs.chmodSync(credentialsPath, 0o600); } catch { /* best-effort */ }
}

function loadSyncBuf(): string | undefined {
  try {
    const raw = fs.readFileSync(syncBufPath, "utf-8");
    return (JSON.parse(raw) as { buf?: string }).buf;
  } catch {
    return undefined;
  }
}

function saveSyncBuf(buf: string): void {
  fs.writeFileSync(syncBufPath, JSON.stringify({ buf }), "utf-8");
}

async function renderQRCode(url: string): Promise<void> {
  try {
    const qrt = await import("qrcode-terminal");
    qrt.default.generate(url, { small: true });
  } catch {
    console.log("QR Code URL:", url);
    console.log("(install qrcode-terminal for inline QR rendering)");
  }
}

function splitAt(text: string, maxLen: number): string[] {
  if (text.length <= maxLen) return [text];
  const parts: string[] = [];
  let i = 0;
  while (i < text.length) {
    parts.push(text.slice(i, i + maxLen));
    i += maxLen;
  }
  return parts;
}

type TypedEmitter = EventEmitter & {
  on(event: "message", listener: (msg: WeixinMessage) => void): TypedEmitter;
  on(event: "error", listener: (err: Error) => void): TypedEmitter;
  on(event: "sessionExpired", listener: () => void): TypedEmitter;
  sendText(userId: string, text: string): Promise<void>;
  stop(): void;
  start(opts: { loadSyncBuf: () => string | undefined; saveSyncBuf: (buf: string) => void }): Promise<void>;
};

async function main(): Promise<void> {
  let serverUrl: string;
  let serverProc: { url: string; process: import("node:child_process").ChildProcess } | null = null;

  const envUrl = process.env.KILO_SERVER_URL;
  if (envUrl) {
    serverUrl = envUrl;
    console.log("[bridge] Using KILO_SERVER_URL:", serverUrl);
  } else {
    try {
      serverUrl = await findKiloServer();
      console.log("[bridge] Found existing Kilo server at", serverUrl);
    } catch {
      console.log("[bridge] No existing Kilo server found, starting one...");
      const server = await startKiloServer();
      serverUrl = server.url;
      serverProc = server;
      console.log("[bridge] Kilo server listening at", serverUrl);
    }
  }

  let client: TypedEmitter | null = null;

  const creds = loadCredentials();
  if (creds) {
    client = new WeChatClient({
      accountId: creds.accountId,
      token: creds.token,
      baseUrl: creds.baseUrl,
    }) as unknown as TypedEmitter;
    console.log("[bridge] Resumed session for account:", creds.accountId);
  } else {
    console.log("[bridge] No saved session. Starting QR code login...\n");
    const rawClient = new WeChatClient();

    const result = await rawClient.login({
      timeoutMs: 5 * 60_000,
      onQRCode: renderQRCode,
      onStatus(status: string) {
        switch (status) {
          case "scaned":
            console.log("[bridge] QR scanned! Confirm on your phone...");
            break;
          case "expired":
            console.log("[bridge] QR expired, refreshing...");
            break;
          case "confirmed":
            console.log("[bridge] Login confirmed!");
            break;
        }
      },
    });

    if (!result.connected) {
      console.error("[bridge] Login failed:", result.message);
      process.exit(1);
    }

    console.log("[bridge] Logged in as", result.accountId);

    saveCredentials({
      accountId: normalizeAccountId(result.accountId!),
      token: result.botToken!,
      baseUrl: result.baseUrl,
      userId: result.userId,
    });
    console.log("[bridge] Credentials saved to", credentialsPath);

    client = rawClient as unknown as TypedEmitter;
  }

  client.on("message", async (msg: WeixinMessage) => {
    const from = msg.from_user_id ?? "(unknown)";

    if (msg.message_type !== MessageType.USER) return;

    const text = WeChatClient.extractText(msg);
    if (!text) return;

    console.log("[msg] <", from, ">", text.slice(0, 100));

    if (!allow.has(from)) {
      console.log("[block] from", from, ": not in allowlist");
      return;
    }

    if (text.startsWith("/")) {
      const reply = handleCommand(text, from, store);
      if (reply) await client!.sendText(from, reply);
      return;
    }

    await store.withLock(from, async () => {
      const sid = store.getOrInit(from);
      console.log("[bridge] Running kilo for", from, "sid=", sid ?? "(new)");

      let lastSentLen = 0;
      let streamTimer: ReturnType<typeof setTimeout> | null = null;
      const streamBuf: string[] = [];

      const flushStream = async () => {
        const full = streamBuf.join("");
        const unsent = full.slice(lastSentLen);
        if (!unsent) return;
        lastSentLen = full.length;
        for (const chunk of splitAt(unsent, 3500)) {
          try { await client!.sendText(from, chunk); }
          catch (e) { console.error("[bridge] sendText error:", e); }
        }
      };

      const onText = (part: string) => {
        streamBuf.push(part);
        if (!streamTimer) {
          streamTimer = setTimeout(() => { streamTimer = null; flushStream(); }, 3000);
        }
      };

      try {
        const result = await runKilo({
          sessionId: sid,
          message: text,
          cwd: WORK_DIR,
          serverUrl,
          timeoutMs: 5 * 60_000,
          onText,
        });

        if (streamTimer) { clearTimeout(streamTimer); streamTimer = null; }

        if (!sid && result.sessionId) {
          store.set(from, result.sessionId);
        }

        const unsent = result.text.slice(lastSentLen);
        if (unsent) {
          for (const chunk of splitAt(unsent, 3500)) {
            await client!.sendText(from, chunk);
          }
        } else if (streamBuf.length === 0) {
          await client!.sendText(from, "(empty response)");
        }
      } catch (err: unknown) {
        if (streamTimer) { clearTimeout(streamTimer); streamTimer = null; }
        await flushStream();
        const errMsg = err instanceof Error ? err.message : String(err);
        console.error("[bridge] Kilo error:", errMsg);
        await client!.sendText(from, "Kilo error: " + errMsg.slice(0, 200));
      }
    });
  });

  client.on("error", (err: Error) => {
    console.error("[bridge] Poll error:", err.message);
  });

  client.on("sessionExpired", () => {
    console.log("[bridge] Session expired! Will pause and retry automatically.");
    console.log("[bridge] If this persists, delete data/wechat-credentials.json and restart.");
  });

  console.log("[bridge] Bridge is running. Press Ctrl+C to stop.\n");

  const shutdown = () => {
    console.log("\n[bridge] Stopping...");
    client!.stop();
    if (serverProc) serverProc.process.kill();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  await client.start({
    loadSyncBuf,
    saveSyncBuf,
  });
}

main().catch((err) => {
  console.error("[bridge] Fatal error:", err);
  process.exit(1);
});
