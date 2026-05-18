import { spawn, type ChildProcess } from "node:child_process";

// Kilo CLI binary. Override with the KILO_BIN env var; otherwise fall back
// to a "kilo" lookup on PATH (assumed installed globally via npm/pnpm).
const KILO_BIN = process.env.KILO_BIN ?? "kilo";

export interface KiloRunResult {
  sessionId: string;
  text: string;
}

export interface KiloRunOptions {
  sessionId?: string;
  message: string;
  cwd: string;
  serverUrl: string;
  timeoutMs?: number;
  onText?: (text: string, sessionId: string) => void;
}

interface KiloEvent {
  type: string;
  sessionID?: string;
  part?: {
    type?: string;
    text?: string;
  };
}

export async function runKilo(opts: KiloRunOptions): Promise<KiloRunResult> {
  const timeoutMs = opts.timeoutMs ?? 5 * 60_000;
  const args = [
    "run",
    "--format", "json",
    "--auto",
    "--attach", opts.serverUrl,
    "--dir", opts.cwd,
  ];
  if (opts.sessionId) {
    args.push("--session", opts.sessionId);
  }
  args.push("--", opts.message);

  return new Promise<KiloRunResult>((resolve, reject) => {
    const ac = new AbortController();
    const timer = setTimeout(() => {
      ac.abort();
      reject(new Error("Kilo run timed out after " + timeoutMs + "ms"));
    }, timeoutMs);

    const proc = spawn(KILO_BIN, args, {
      signal: ac.signal,
      stdio: ["ignore", "pipe", "pipe"],
    });

    let sessionId = "";
    const textParts: string[] = [];
    let buf = "";

    proc.stdout.on("data", (chunk: Buffer) => {
      buf += chunk.toString();
      const lines = buf.split("\n");
      buf = lines.pop() ?? "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        try {
          const evt: KiloEvent = JSON.parse(trimmed);
          if (evt.sessionID && !sessionId) {
            sessionId = evt.sessionID;
          }
          if (evt.type === "text" && evt.part?.type === "text" && evt.part.text) {
            textParts.push(evt.part.text);
            if (opts.onText) {
              opts.onText(evt.part.text, sessionId);
            }
          }
        } catch {
          // skip non-JSON lines
        }
      }
    });

    let stderrBuf = "";
    proc.stderr.on("data", (chunk: Buffer) => {
      stderrBuf += chunk.toString();
    });

    proc.on("close", (code: number | null) => {
      clearTimeout(timer);
      if (code !== 0 && textParts.length === 0) {
        reject(new Error("Kilo exited with code " + code + ": " + stderrBuf.trim().slice(0, 300)));
        return;
      }
      // Even with exit 0, an empty textParts indicates a silent failure
      // (e.g. server unreachable, attach refused). Surface it loudly.
      if (textParts.length === 0) {
        const tail = stderrBuf.trim().slice(-300) || "(no stderr)";
        reject(new Error("Kilo produced no output (exit " + code + "). stderr: " + tail));
        return;
      }
      resolve({
        sessionId,
        text: textParts.join(""),
      });
    });

    proc.on("error", (err: Error & { code?: string }) => {
      clearTimeout(timer);
      // If we already collected text before the spawn errored (e.g. server
      // dropped the connection mid-stream), surface what we got instead of
      // throwing away the partial reply.
      if (textParts.length > 0) {
        console.warn(
          "[kilo-runner] spawn error but %d text parts already collected — resolving partial. err.name=%s code=%s msg=%s",
          textParts.length, err.name, err.code ?? "(none)", err.message,
        );
        resolve({ sessionId, text: textParts.join("") });
        return;
      }
      // Augment the error message with name/code for debugging.
      const detail = "name=" + err.name + " code=" + (err.code ?? "(none)") + " msg=" + err.message;
      reject(new Error("Kilo spawn error: " + detail));
    });
  });
}

export async function startKiloServer(port?: number): Promise<{ url: string; process: ChildProcess }> {
  const args = ["serve"];
  if (port) args.push("--port", String(port));

  const proc = spawn(KILO_BIN, args, {
    stdio: ["ignore", "pipe", "pipe"],
  });

  return new Promise((resolve, reject) => {
    let resolved = false;
    const timer = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        reject(new Error("Kilo server startup timed out"));
      }
    }, 30_000);

    let stderrBuf = "";
    proc.stderr?.on("data", (chunk: Buffer) => {
      stderrBuf += chunk.toString();
    });

    proc.stdout?.on("data", (chunk: Buffer) => {
      const line = chunk.toString().trim();
      const match = line.match(/listening on (http:\/\/\S+)/);
      if (match && !resolved) {
        resolved = true;
        clearTimeout(timer);
        resolve({ url: match[1], process: proc });
      }
    });

    proc.on("close", (code: number | null) => {
      if (!resolved) {
        resolved = true;
        clearTimeout(timer);
        reject(new Error("Kilo serve exited with code " + code + ": " + stderrBuf.trim().slice(0, 300)));
      }
    });

    proc.on("error", (err: Error) => {
      if (!resolved) {
        resolved = true;
        clearTimeout(timer);
        reject(err);
      }
    });
  });
}

export async function findKiloServer(): Promise<string> {
  const envUrl = process.env.KILO_SERVER_URL;
  if (envUrl) return envUrl;

  const { execSync } = await import("node:child_process");
  try {
    const output = execSync(
      "ss -tlnp 2>/dev/null | grep kilo | head -5",
      { encoding: "utf-8" }
    );
    for (const line of output.split("\n")) {
      const m = line.match(/127\.0\.0\.1:(\d+)/);
      if (m) {
        const url = "http://127.0.0.1:" + m[1];
        try {
          execSync(KILO_BIN + " run --format json --auto --attach " + url + " --dir /tmp __ping__", {
            timeout: 10_000,
            stdio: "pipe",
          });
        } catch {
          continue;
        }
        return url;
      }
    }
  } catch {
    // ss not available or no kilo processes
  }

  throw new Error(
    "No kilo server found. Set KILO_SERVER_URL env var or start one with 'kilo serve'."
  );
}
