import type { Env } from "../types";
import { SupabaseService } from "./supabase";

export type AliExpressCredentials = {
  appKey: string;
  appSecret: string;
  callbackUrl: string;
  accessToken: string | null;
  refreshToken: string | null;
  tokenExpiresAt: string | null;
};

const ACCESS_TOKEN_KEY = "aliexpress_access_token";
const REFRESH_TOKEN_KEY = "aliexpress_refresh_token";
const TOKEN_EXPIRES_KEY = "aliexpress_token_expires_at";

export function resolveAliExpressCallbackUrl(env: Env): string {
  return (
    env.ALIEXPRESS_CALLBACK_URL?.trim() ||
    "https://shixato.workers.dev/api/auth/aliexpress/callback"
  );
}

export function hasAliExpressAppCredentials(env: Env): boolean {
  return Boolean(env.ALIEXPRESS_APP_KEY?.trim() && env.ALIEXPRESS_APP_SECRET?.trim());
}

export async function loadAliExpressCredentials(env: Env): Promise<AliExpressCredentials | null> {
  if (!hasAliExpressAppCredentials(env)) return null;

  let accessToken = env.ALIEXPRESS_ACCESS_TOKEN?.trim() || null;
  let refreshToken: string | null = null;
  let tokenExpiresAt: string | null = null;

  try {
    const db = new SupabaseService(env);
    accessToken =
      (await db.getSetting(ACCESS_TOKEN_KEY))?.trim() ||
      accessToken;
    refreshToken = (await db.getSetting(REFRESH_TOKEN_KEY))?.trim() || null;
    tokenExpiresAt = (await db.getSetting(TOKEN_EXPIRES_KEY))?.trim() || null;
  } catch {
    // Supabase optional for local dev
  }

  return {
    appKey: env.ALIEXPRESS_APP_KEY!.trim(),
    appSecret: env.ALIEXPRESS_APP_SECRET!.trim(),
    callbackUrl: resolveAliExpressCallbackUrl(env),
    accessToken,
    refreshToken,
    tokenExpiresAt,
  };
}

export async function saveAliExpressTokens(
  env: Env,
  tokens: {
    accessToken: string;
    refreshToken?: string | null;
    expiresAt?: string | null;
  },
): Promise<void> {
  const db = new SupabaseService(env);
  await db.setSetting(ACCESS_TOKEN_KEY, tokens.accessToken);
  if (tokens.refreshToken) {
    await db.setSetting(REFRESH_TOKEN_KEY, tokens.refreshToken);
  }
  if (tokens.expiresAt) {
    await db.setSetting(TOKEN_EXPIRES_KEY, tokens.expiresAt);
  }
}
