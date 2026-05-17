import type { SessionStore } from "./session-store.ts";

export function handleCommand(
  content: string,
  fromUserId: string,
  store: SessionStore,
): string | null {
  const cmd = content.trim().toLowerCase();

  if (cmd === "/help") {
    return [
      "/help   - 显示此帮助",
      "/new    - 开启新的 Kilo 会话",
      "/sid    - 显示当前 session ID",
      "/cancel - 中止当前正在执行的 Kilo 任务",
      "/whoami - 显示你的微信 ID",
    ].join("\n");
  }

  if (cmd === "/new") {
    store.delete(fromUserId);
    return "已清除当前会话，下条消息将开启新会话。";
  }

  if (cmd === "/sid") {
    const sid = store.get(fromUserId);
    return sid ? `当前 session: ${sid}` : "当前没有活跃会话，发送消息即可创建。";
  }

  if (cmd === "/cancel") {
    return "取消功能正在开发中。";
  }

  if (cmd === "/whoami") {
    return `你的微信 ID: ${fromUserId}`;
  }

  return null;
}
