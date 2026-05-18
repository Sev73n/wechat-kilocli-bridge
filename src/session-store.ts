import fs from "node:fs";
import path from "node:path";

/** Session expires after 24h of inactivity, matching WeChat's session window. */
const SESSION_TTL_MS = 24 * 60 * 60 * 1000;

interface SessionRecord {
  sessionId: string;
  lastUsedAt: number;
}

/** On-disk shape: tolerates legacy plain-string entries from older bridge versions. */
type SessionsFile = Record<string, SessionRecord | string>;

export class SessionStore {
  private data: Map<string, SessionRecord> = new Map();
  private filePath: string;
  private queues: Map<string, Promise<void>> = new Map();

  constructor(filePath: string) {
    this.filePath = filePath;
    this.load();
  }

  private load(): void {
    try {
      const raw = fs.readFileSync(this.filePath, "utf-8");
      const parsed = JSON.parse(raw) as SessionsFile;
      const now = Date.now();
      for (const [peerId, value] of Object.entries(parsed)) {
        if (typeof value === "string") {
          // Legacy entry without timestamp: treat as fresh now (best-effort migration).
          this.data.set(peerId, { sessionId: value, lastUsedAt: now });
        } else if (value && typeof value.sessionId === "string") {
          this.data.set(peerId, {
            sessionId: value.sessionId,
            lastUsedAt: typeof value.lastUsedAt === "number" ? value.lastUsedAt : now,
          });
        }
      }
    } catch {
      this.data = new Map();
    }
  }

  private save(): void {
    const dir = path.dirname(this.filePath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const out: SessionsFile = {};
    for (const [peerId, rec] of this.data.entries()) {
      out[peerId] = rec;
    }
    fs.writeFileSync(this.filePath, JSON.stringify(out, null, 2), "utf-8");
  }

  /** Return the active session id for peer, or undefined if absent/expired. */
  get(peerId: string): string | undefined {
    const rec = this.data.get(peerId);
    if (!rec) return undefined;
    if (Date.now() - rec.lastUsedAt > SESSION_TTL_MS) {
      // Stale (>24h): drop it so caller creates a new kilo session.
      this.data.delete(peerId);
      this.save();
      return undefined;
    }
    return rec.sessionId;
  }

  /** Persist a sessionId and refresh its lastUsedAt to now. */
  set(peerId: string, sessionId: string): void {
    this.data.set(peerId, { sessionId, lastUsedAt: Date.now() });
    this.save();
  }

  delete(peerId: string): void {
    this.data.delete(peerId);
    this.save();
  }

  /**
   * Get the active session id, or undefined if absent/expired.
   * Does not create — caller passes undefined to runKilo to start fresh.
   */
  getOrInit(peerId: string): string | undefined {
    return this.get(peerId);
  }

  /** Refresh lastUsedAt to now without changing sessionId. */
  touch(peerId: string): void {
    const rec = this.data.get(peerId);
    if (!rec) return;
    rec.lastUsedAt = Date.now();
    this.save();
  }

  withLock<T>(peerId: string, fn: () => Promise<T>): Promise<T> {
    const prev = this.queues.get(peerId) ?? Promise.resolve();
    let result: T | undefined;
    const next: Promise<void> = prev
      .then(() => fn())
      .then((r: T) => { result = r; })
      .catch((e: unknown) => { console.error("[lock-error]", peerId, e); })
      .then(() => {});
    this.queues.set(peerId, next);
    return next.then(() => result as T);
  }
}
