import fs from "node:fs";

export class Allowlist {
  private set: Set<string> = new Set();
  private filePath: string;

  constructor(filePath: string) {
    this.filePath = filePath;
    this.load();
  }

  private load(): void {
    try {
      const raw = fs.readFileSync(this.filePath, "utf-8");
      const arr = JSON.parse(raw) as string[];
      this.set = new Set(arr);
    } catch {
      this.set = new Set();
    }
  }

  private save(): void {
    const dir = this.filePath.substring(0, this.filePath.lastIndexOf("/"));
    if (dir && !fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(this.filePath, JSON.stringify([...this.set], null, 2), "utf-8");
  }

  has(userId: string): boolean {
    return this.set.has(userId);
  }

  add(userId: string): void {
    this.set.add(userId);
    this.save();
  }

  remove(userId: string): void {
    this.set.delete(userId);
    this.save();
  }

  list(): string[] {
    return [...this.set];
  }

  isEmpty(): boolean {
    return this.set.size === 0;
  }
}
