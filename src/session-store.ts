import fs from "node:fs";
import path from "node:path";

interface SessionsData {
  [peerId: string]: string;
}

export class SessionStore {
  private data: SessionsData = {};
  private filePath: string;
  private queues: Map<string, Promise<void>> = new Map();

  constructor(filePath: string) {
    this.filePath = filePath;
    this.load();
  }

  private load(): void {
    try {
      const raw = fs.readFileSync(this.filePath, "utf-8");
      this.data = JSON.parse(raw) as SessionsData;
    } catch {
      this.data = {};
    }
  }

  private save(): void {
    const dir = path.dirname(this.filePath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(this.filePath, JSON.stringify(this.data, null, 2), "utf-8");
  }

  get(peerId: string): string | undefined {
    return this.data[peerId];
  }

  set(peerId: string, sessionId: string): void {
    this.data[peerId] = sessionId;
    this.save();
  }

  delete(peerId: string): void {
    delete this.data[peerId];
    this.save();
  }

  getOrInit(peerId: string): string | undefined {
    return this.data[peerId];
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
