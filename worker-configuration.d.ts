/** Ambient Env bindings for the Worker (mirrors wrangler.toml + secrets). */

interface Env {
  ENVIRONMENT: string;
  SHOPIFY_STORE_DOMAIN: string;
  SHOPIFY_API_VERSION: string;
  SHOPIFY_ADMIN_API_TOKEN: string;
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
  API_KEY: string;
  DEFAULT_MARKUP?: string;
  MAX_PRODUCT_IMAGES?: string;
  OPENAI_API_KEY?: string;
  OPENAI_BASE_URL?: string;
  OPENAI_MODEL?: string;
  AI?: Ai;
}
