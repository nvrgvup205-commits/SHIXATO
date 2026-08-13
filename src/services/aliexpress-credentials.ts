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

const APP_KEY_SETTING = "aliexpress_app_key";
const APP_SECRET_SETTING = "aliexpress_app_secret";
const ACCESS_TOKEN_KEY = "aliexpress_access_token";
const REFRESH_TOKEN_KEY = "aliexpress_refresh_token";
const TOKEN_EXPIRES_KEY = "aliexpress_token_expires_at";

export function resolveAliExpressCallbackUrl(env: Env): string {
  const raw =
    env.ALIEXPRESS_CALLBACK_URL?.trim() ||
    "https://shixato.nvrgvup205.workers.dev/api/aliexpress/callback";
  return raw.replace(/([^:]\/)\/+/g, "$1");
}

async function readSetting(env: Env, key: string): Promise<string | null> {
  try {
    const db = new SupabaseService(env);
    return (await db.getSetting(key))?.trim() || null;
  } catch {
    return null;
  }
}

async function resolveAppKey(env: Env): Promise<string | null> {
  return env.ALIEXPRESS_APP_KEY?.trim() || (await readSetting(env, APP_KEY_SETTING));
}

async function resolveAppSecret(env: Env): Promise<string | null> {
  return (
    env.ALIEXPRESS_APP_SECRET?.trim() || (await readSetting(env, APP_SECRET_SETTING))
  );
}

export async function hasAliExpressAppCredentials(env: Env): Promise<boolean> {
  const [appKey, appSecret] = await Promise.all([
    resolveAppKey(env),
    resolveAppSecret(env),
  ]);
  return Boolean(appKey && appSecret);
}

export async function getAliExpressCredentialStatus(env: Env): Promise<{
  hasEnvAppKey: boolean;
  hasEnvAppSecret: boolean;
  hasSupabaseAppKey: boolean;
  hasSupabaseAppSecret: boolean;
  configured: boolean;
}> {
  const [supabaseAppKey, supabaseAppSecret] = await Promise.all([
    readSetting(env, APP_KEY_SETTING),
    readSetting(env, APP_SECRET_SETTING),
  ]);

  const hasEnvAppKey = Boolean(env.ALIEXPRESS_APP_KEY?.trim());
  const hasEnvAppSecret = Boolean(env.ALIEXPRESS_APP_SECRET?.trim());

  return {
    hasEnvAppKey,
    hasEnvAppSecret,
    hasSupabaseAppKey: Boolean(supabaseAppKey),
    hasSupabaseAppSecret: Boolean(supabaseAppSecret),
    configured: Boolean(
      (hasEnvAppKey || supabaseAppKey) && (hasEnvAppSecret || supabaseAppSecret),
    ),
  };
}

export async function loadAliExpressCredentials(env: Env): Promise<AliExpressCredentials | null> {
  const [appKey, appSecret] = await Promise.all([
    resolveAppKey(env),
    resolveAppSecret(env),
  ]);
  if (!appKey || !appSecret) return null;

  let accessToken = env.ALIEXPRESS_ACCESS_TOKEN?.trim() || null;
  let refreshToken: string | null = null;
  let tokenExpiresAt: string | null = null;

  try {
    const db = new SupabaseService(env);
    const tokenRow = await db.getAliExpressToken();
    if (tokenRow) {
      accessToken = tokenRow.access_token || accessToken;
      refreshToken = tokenRow.refresh_token;
      tokenExpiresAt = tokenRow.expires_at;
    } else {
      accessToken = (await readSetting(env, ACCESS_TOKEN_KEY)) || accessToken;
      refreshToken = await readSetting(env, REFRESH_TOKEN_KEY);
      tokenExpiresAt = await readSetting(env, TOKEN_EXPIRES_KEY);
    }
  } catch {
    // Supabase optional for local dev
  }

  return {
    appKey,
    appSecret,
    callbackUrl: resolveAliExpressCallbackUrl(env),
    accessToken,
    refreshToken,
    tokenExpiresAt,
  };
}

export async function saveAliExpressAppCredentials(
  env: Env,
  input: { appKey: string; appSecret: string },
): Promise<void> {
  const db = new SupabaseService(env);
  await db.setSetting(APP_KEY_SETTING, input.appKey.trim());
  await db.setSetting(APP_SECRET_SETTING, input.appSecret.trim());
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
  await db.saveAliExpressToken(tokens);
}
