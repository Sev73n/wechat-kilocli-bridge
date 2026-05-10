import { describe, expect, test } from "bun:test";

import {
  getStoredCredentialsInvalidReason,
  getWechatLoginRequiredReason,
  type StoredAccount,
} from "../../src/wechat/setup.ts";

const account: StoredAccount = {
  token: "token-1",
  baseUrl: "https://ilinkai.weixin.qq.com",
  accountId: "bot-1",
  userId: "owner@im.wechat",
  savedAt: "2026-05-10T00:00:00.000Z",
};

describe("wechat setup credentials", () => {
  test("requires login when no credentials have been saved", () => {
    expect(getWechatLoginRequiredReason(null)).toBe(
      "No saved WeChat credentials found.",
    );
  });

  test("accepts complete credentials for bridge startup", () => {
    expect(
      getWechatLoginRequiredReason(account, {
        requireUserId: true,
      }),
    ).toBeNull();
  });

  test("requires login when bridge credentials cannot identify the owner", () => {
    const { userId, ...withoutUserId } = account;
    expect(
      getWechatLoginRequiredReason(withoutUserId, {
        requireUserId: true,
      }),
    ).toBe("Saved WeChat credentials are missing userId.");
  });

  test("detects expired saved credentials during startup validation", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () =>
      new Response(
        JSON.stringify({
          errcode: -14,
          errmsg: "session timeout",
        }),
        { status: 200 },
      )) as typeof fetch;

    try {
      await expect(
        getStoredCredentialsInvalidReason(account, {
          timeoutMs: 1000,
        }),
      ).resolves.toBe("Saved WeChat login has expired.");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
