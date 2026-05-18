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
import { runKilo, startKiloServer } from "./kilo-runner.ts";

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
  getTypingTicket(userId: string, contextToken?: string): Promise<string>;
  sendTyping(userId: string, typingTicket: string, status?: "typing" | "cancel"): Promise<void>;
  stop(): void;
  start(opts: { loadSyncBuf: () => string | undefined; saveSyncBuf: (buf: string) => void }): Promise<void>;
};

/**
 * Start a typing-indicator keepalive loop. The server-side typing state
 * expires roughly every 15s, so we re-send every 10s while kilo is thinking.
 * Returns a stop() function; safe to call multiple times.
 */
function startTypingKeepalive(client: TypedEmitter, userId: string): () => void {
  let stopped = false;
  let cachedTicket: string | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const sendOnce = async () => {
    if (stopped) return;
    try {
      if (!cachedTicket) {
        cachedTicket = await client.getTypingTicket(userId);
        if (!cachedTicket) {
          console.warn("[typing] no ticket for", userId, "— giving up keepalive");
          return;
        }
      }
      if (stopped) return;
      await client.sendTyping(userId, cachedTicket, "typing");
    } catch (err) {
      console.warn("[typing] send failed for", userId, ":", err instanceof Error ? err.message : String(err));
    }
  };

  const loop = () => {
    if (stopped) return;
    void sendOnce().finally(() => {
      if (stopped) return;
      timer = setTimeout(loop, 10_000);
    });
  };
  loop();

  return () => {
    stopped = true;
    if (timer) { clearTimeout(timer); timer = null; }
  };
}

async function main(): Promise<void> {
  let serverUrl: string;
  let serverProc: { url: string; process: import("node:child_process").ChildProcess } | null = null;

  const envUrl = process.env.KILO_SERVER_URL;
  if (envUrl) {
    serverUrl = envUrl;
    console.log("[bridge] Using KILO_SERVER_URL:", serverUrl);
  } else {
    // Always spawn our own kilo serve. Do NOT attach to existing servers
    // (VS Code's kilo serves on 4096/random ports must not be touched).
    console.log("[bridge] Starting dedicated kilo serve...");
    const server = await startKiloServer();
    serverUrl = server.url;
    serverProc = server;
    console.log("[bridge] Kilo server listening at", serverUrl);
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

      // Keep "正在输入" alive while kilo thinks. WeChat typing state
      // expires ~15s server-side; we re-send every 10s. The final sendText
      // with state=FINISH closes it implicitly.
      const stopTyping = startTypingKeepalive(client!, from);

      try {
        const result = await runKilo({
          sessionId: sid,
          message: text,
          cwd: WORK_DIR,
          serverUrl,
          timeoutMs: 5 * 60_000,
        });

        if (!sid && result.sessionId) {
          store.set(from, result.sessionId);
        } else if (sid) {
          // Refresh the 24h activity window for this peer.
          store.touch(from);
        }

        const reply = result.text.trim();
        if (!reply) {
          console.warn("[bridge] kilo returned empty text for", from, "— skipping send");
          return;
        }

        for (const chunk of splitAt(reply, 3500)) {
          await client!.sendText(from, chunk);
        }
      } catch (err: unknown) {
        const errMsg = err instanceof Error ? err.message : String(err);
        console.error("[bridge] Kilo error:", errMsg);
        await client!.sendText(from, "Kilo error: " + errMsg.slice(0, 200));
      } finally {
        stopTyping();
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
