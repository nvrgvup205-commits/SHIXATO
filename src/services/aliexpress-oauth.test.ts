import { describe, expect, it } from "vitest";
import {
  AliExpressOAuth,
  ALIEXPRESS_OAUTH_AUTHORIZE_URL,
  resolveTokenExpiry,
} from "./aliexpress-oauth";

describe("AliExpressOAuth", () => {
  const oauth = new AliExpressOAuth({
    appKey: "542618",
    appSecret: "test-secret",
    callbackUrl: "https://shixato.nvrgvup205.workers.dev/api/aliexpress/callback",
  });

  it("builds the official authorize URL with state", () => {
    const url = oauth.getAuthorizationUrl("state-123");
    expect(url.startsWith(ALIEXPRESS_OAUTH_AUTHORIZE_URL)).toBe(true);
    expect(url).toContain("client_id=542618");
    expect(url).toContain("response_type=code");
    expect(url).toContain("force_auth=true");
    expect(url).toContain(
      "redirect_uri=https%3A%2F%2Fshixato.nvrgvup205.workers.dev%2Fapi%2Faliexpress%2Fcallback",
    );
    expect(url).toContain("state=state-123");
  });

  it("signs and verifies oauth state", async () => {
    const state = await oauth.createOAuthState();
    expect(await oauth.verifyOAuthState(state)).toBe(true);
    expect(await oauth.verifyOAuthState("tampered-state")).toBe(false);
  });

  it("resolves token expiry from expire_time or expires_in", () => {
    const fromMs = resolveTokenExpiry({ expire_time: 1_700_000_000_000 });
    expect(fromMs).toBe(new Date(1_700_000_000_000).toISOString());

    const fromSeconds = resolveTokenExpiry({ expires_in: 3600 });
    expect(fromSeconds).not.toBeNull();
    expect(Date.parse(fromSeconds!)).toBeGreaterThan(Date.now());
  });
});
