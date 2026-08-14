import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type {
  Env,
  FavoriteRecord,
  ProductRecord,
  ProductStatus,
  SyncLogRecord,
  SyncStatus,
} from "../types";
import { HttpError } from "../utils/http";

export type UpsertProductInput = {
  aliexpress_id: string;
  title: string;
  original_price: number;
  selling_price: number;
  images: string[];
  status: ProductStatus;
  description_html?: string;
  shopify_product_id?: string | null;
  shopify_handle?: string | null;
  currency?: string;
  metadata?: Record<string, unknown>;
};

export type CreateSyncLogInput = {
  product_id?: string | null;
  aliexpress_id?: string | null;
  shopify_product_id?: string | null;
  action: string;
  status: SyncStatus;
  request_payload?: Record<string, unknown> | null;
  response_payload?: Record<string, unknown> | null;
  error_message?: string | null;
};

export type AliExpressTokenRecord = {
  id: string;
  access_token: string;
  refresh_token: string | null;
  expires_at: string | null;
  created_at: string;
  updated_at: string;
};

export type UpsertFavoriteInput = {
  aliexpress_id: string;
  title: string;
  original_price: number;
  currency: string;
  listing: Record<string, unknown>;
  notes?: string | null;
  preset_grade?: string | null;
};

/** Independent Postgres schema — must be listed under Exposed schemas in Supabase API settings */
export const SUPABASE_SCHEMA = "shixato" as const;

/** Catalog list — omit description_html and metadata to cut egress */
const PRODUCT_LIST_COLUMNS =
  "id,aliexpress_id,title,original_price,selling_price,images,status,shopify_handle,currency,created_at";

/** Sync log list — omit JSON payloads (dashboard shows action/status/error only) */
const SYNC_LOG_LIST_COLUMNS =
  "id,action,status,error_message,aliexpress_id,created_at";

const ALIEXPRESS_TOKEN_COLUMNS = "access_token,refresh_token,expires_at";

const FAVORITE_LIST_COLUMNS =
  "id,aliexpress_id,title,original_price,currency,notes,preset_grade,ai_score,list_image,hook_ar,selling_price,created_at,updated_at";

type FavoriteListRow = {
  id: string;
  aliexpress_id: string;
  title: string;
  original_price: number;
  currency: string;
  notes?: string | null;
  preset_grade?: string | null;
  ai_score?: number | null;
  list_image?: string | null;
  hook_ar?: string | null;
  selling_price?: number | null;
  created_at: string;
  updated_at?: string | null;
};

function extractFavoriteListFields(listing: Record<string, unknown>): {
  ai_score: number | null;
  list_image: string | null;
  hook_ar: string | null;
  selling_price: number | null;
} {
  const aiScore = Number(listing.aiScore);
  const sellingPrice = Number(listing.sellingPrice);
  const images = Array.isArray(listing.images) ? listing.images : [];
  const firstImage = typeof images[0] === "string" ? images[0] : null;

  return {
    ai_score: Number.isFinite(aiScore) && aiScore > 0 ? aiScore : null,
    list_image:
      typeof listing.image === "string" && listing.image.trim()
        ? listing.image.trim()
        : firstImage?.trim() || null,
    hook_ar:
      typeof listing.hookAr === "string" && listing.hookAr.trim()
        ? listing.hookAr.trim()
        : null,
    selling_price:
      Number.isFinite(sellingPrice) && sellingPrice > 0 ? sellingPrice : null,
  };
}

function slimFavoriteListing(row: FavoriteListRow): FavoriteRecord {
  const image = row.list_image?.trim() || undefined;
  return {
    id: row.id,
    aliexpress_id: row.aliexpress_id,
    title: row.title,
    original_price: row.original_price,
    currency: row.currency,
    notes: row.notes,
    preset_grade: row.preset_grade,
    created_at: row.created_at,
    updated_at: row.updated_at,
    listing: {
      aliexpressId: row.aliexpress_id,
      title: row.title,
      image,
      images: image ? [image] : [],
      aiScore: row.ai_score ?? undefined,
      hookAr: row.hook_ar ?? undefined,
      sellingPrice: row.selling_price ?? undefined,
      originalPrice: row.original_price,
      currency: row.currency,
    },
  };
}

/**
 * Supabase persistence layer (service_role on Worker only).
 * All tables live in the isolated `shixato` schema (not public).
 */
export class SupabaseService {
  private client: SupabaseClient<any, "shixato", "shixato">;

  constructor(env: Env) {
    if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
      throw new HttpError(500, "Supabase credentials are not configured");
    }

    this.client = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
      db: { schema: SUPABASE_SCHEMA },
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });
  }

  async upsertProduct(input: UpsertProductInput): Promise<ProductRecord> {
    const { data, error } = await this.client
      .from("products")
      .upsert(
        {
          ...input,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "aliexpress_id" },
      )
      .select("*")
      .single();

    if (error) {
      throw new HttpError(500, "Failed to upsert product", error);
    }

    return data as ProductRecord;
  }

  async getProductByAliExpressId(
    aliexpressId: string,
  ): Promise<ProductRecord | null> {
    const { data, error } = await this.client
      .from("products")
      .select("*")
      .eq("aliexpress_id", aliexpressId)
      .maybeSingle();

    if (error) {
      throw new HttpError(500, "Failed to fetch product", error);
    }

    return (data as ProductRecord | null) ?? null;
  }

  async listProducts(options?: {
    status?: ProductStatus;
    limit?: number;
  }): Promise<ProductRecord[]> {
    let query = this.client
      .from("products")
      .select(PRODUCT_LIST_COLUMNS)
      .order("created_at", { ascending: false })
      .limit(options?.limit ?? 50);

    if (options?.status) {
      query = query.eq("status", options.status);
    }

    const { data, error } = await query;
    if (error) {
      throw new HttpError(500, "Failed to list products", error);
    }

    return (data as ProductRecord[]) ?? [];
  }

  async updateProductStatus(
    id: string,
    status: ProductStatus,
    patch?: Partial<UpsertProductInput>,
  ): Promise<ProductRecord> {
    const { data, error } = await this.client
      .from("products")
      .update({
        status,
        ...patch,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .select("*")
      .single();

    if (error) {
      throw new HttpError(500, "Failed to update product status", error);
    }

    return data as ProductRecord;
  }

  async createSyncLog(input: CreateSyncLogInput): Promise<void> {
    const { error } = await this.client.from("sync_logs").insert({
      product_id: input.product_id ?? null,
      aliexpress_id: input.aliexpress_id ?? null,
      shopify_product_id: input.shopify_product_id ?? null,
      action: input.action,
      status: input.status,
      request_payload: input.request_payload ?? null,
      response_payload: input.response_payload ?? null,
      error_message: input.error_message ?? null,
    });

    if (error) {
      throw new HttpError(500, "Failed to create sync log", error);
    }
  }

  async listSyncLogs(limit = 50): Promise<SyncLogRecord[]> {
    const { data, error } = await this.client
      .from("sync_logs")
      .select(SYNC_LOG_LIST_COLUMNS)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) {
      throw new HttpError(500, "Failed to list sync logs", error);
    }

    return (data as SyncLogRecord[]) ?? [];
  }

  /**
   * Delete old sync_logs and strip payloads on semi-old rows.
   * Uses DB function when available; falls back to direct delete.
   */
  async pruneSyncLogs(retentionDays = 14): Promise<number> {
    const days = Math.min(Math.max(retentionDays, 1), 365);

    const { data: rpcCount, error: rpcError } = await this.client.rpc(
      "prune_sync_logs",
      { retention_days: days },
    );

    if (!rpcError && typeof rpcCount === "number") {
      return rpcCount;
    }

    const cutoff = new Date(Date.now() - days * 86_400_000).toISOString();
    const { data, error } = await this.client
      .from("sync_logs")
      .delete()
      .lt("created_at", cutoff)
      .select("id");

    if (error) {
      throw new HttpError(500, "Failed to prune sync logs", error);
    }

    return data?.length ?? 0;
  }

  /** Run retention cleanup at most once per 24h (non-blocking for callers). */
  scheduleSyncLogPrune(retentionDays = 14): void {
    void this.maybePruneSyncLogs(retentionDays);
  }

  private async maybePruneSyncLogs(retentionDays: number): Promise<void> {
    const lastPruneKey = "sync_logs_last_prune_at";
    const pruneIntervalMs = 24 * 60 * 60 * 1000;

    try {
      const last = await this.getSetting(lastPruneKey);
      const lastMs = last ? Date.parse(last) : 0;
      if (Number.isFinite(lastMs) && Date.now() - lastMs < pruneIntervalMs) {
        return;
      }

      const removed = await this.pruneSyncLogs(retentionDays);
      await this.setSetting(lastPruneKey, new Date().toISOString());
      if (removed > 0) {
        console.log(`pruned ${removed} sync_logs (retention ${retentionDays}d)`);
      }
    } catch (err) {
      console.warn("sync_logs prune skipped", err);
    }
  }

  async getSetting(key: string): Promise<string | null> {
    const { data, error } = await this.client
      .from("app_settings")
      .select("value")
      .eq("key", key)
      .maybeSingle();

    if (error) {
      // Table may not exist yet before migration — treat as unset
      console.warn("getSetting failed", key, error.message);
      return null;
    }

    return typeof data?.value === "string" ? data.value : null;
  }

  /** Batch-read settings in one query (cuts egress vs N separate getSetting calls). */
  async getSettings(keys: string[]): Promise<Record<string, string | null>> {
    const unique = [...new Set(keys.filter(Boolean))];
    const out: Record<string, string | null> = Object.fromEntries(
      unique.map((k) => [k, null]),
    );
    if (!unique.length) return out;

    const { data, error } = await this.client
      .from("app_settings")
      .select("key,value")
      .in("key", unique);

    if (error) {
      console.warn("getSettings failed", error.message);
      return out;
    }

    for (const row of data ?? []) {
      const key = typeof row.key === "string" ? row.key : "";
      if (!key) continue;
      out[key] = typeof row.value === "string" ? row.value : null;
    }
    return out;
  }

  async setSetting(key: string, value: string): Promise<void> {
    const { error } = await this.client.from("app_settings").upsert(
      {
        key,
        value,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "key" },
    );

    if (error) {
      throw new HttpError(500, "Failed to save setting", error);
    }
  }

  async saveAliExpressToken(input: {
    accessToken: string;
    refreshToken?: string | null;
    expiresAt?: string | null;
  }): Promise<void> {
    const { error } = await this.client.from("aliexpress_tokens").upsert(
      {
        id: "default",
        access_token: input.accessToken,
        refresh_token: input.refreshToken ?? null,
        expires_at: input.expiresAt ?? null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "id" },
    );

    if (error) {
      throw new HttpError(500, "Failed to save AliExpress token", error);
    }
  }

  async clearAliExpressToken(): Promise<void> {
    const { error } = await this.client
      .from("aliexpress_tokens")
      .delete()
      .eq("id", "default");

    if (error) {
      throw new HttpError(500, "Failed to clear AliExpress token", error);
    }
  }

  async getAliExpressToken(): Promise<AliExpressTokenRecord | null> {
    const { data, error } = await this.client
      .from("aliexpress_tokens")
      .select(ALIEXPRESS_TOKEN_COLUMNS)
      .eq("id", "default")
      .maybeSingle();

    if (error) {
      console.warn("getAliExpressToken failed", error.message);
      return null;
    }

    return (data as AliExpressTokenRecord | null) ?? null;
  }

  async upsertFavorite(input: UpsertFavoriteInput): Promise<FavoriteRecord> {
    const listFields = extractFavoriteListFields(input.listing);
    const { data, error } = await this.client
      .from("favorites")
      .upsert(
        {
          ...input,
          ...listFields,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "aliexpress_id" },
      )
      .select("*")
      .single();

    if (error) {
      throw new HttpError(500, "Failed to save favorite", error);
    }

    return data as FavoriteRecord;
  }

  async listFavorites(limit = 100): Promise<FavoriteRecord[]> {
    const capped = Math.min(Math.max(limit, 1), 100);
    const { data, error } = await this.client
      .from("favorites")
      .select(FAVORITE_LIST_COLUMNS)
      .order("ai_score", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false })
      .limit(capped);

    if (error) {
      throw new HttpError(500, "Failed to list favorites", error);
    }

    return ((data as FavoriteListRow[]) ?? []).map(slimFavoriteListing);
  }

  async updateFavorite(
    id: string,
    input: {
      title?: string;
      notes?: string | null;
      listing?: Record<string, unknown>;
    },
  ): Promise<FavoriteRecord> {
    const listFields =
      input.listing != null ? extractFavoriteListFields(input.listing) : {};
    const { data, error } = await this.client
      .from("favorites")
      .update({
        ...(input.title != null ? { title: input.title } : {}),
        ...(input.notes !== undefined ? { notes: input.notes } : {}),
        ...(input.listing != null ? { listing: input.listing } : {}),
        ...listFields,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .select("*")
      .single();

    if (error) {
      throw new HttpError(500, "Failed to update favorite", error);
    }

    return data as FavoriteRecord;
  }

  async getFavorite(id: string): Promise<FavoriteRecord | null> {
    const { data, error } = await this.client
      .from("favorites")
      .select("*")
      .eq("id", id)
      .maybeSingle();

    if (error) {
      throw new HttpError(500, "Failed to fetch favorite", error);
    }

    return (data as FavoriteRecord | null) ?? null;
  }

  async deleteFavorite(id: string): Promise<void> {
    const { error } = await this.client.from("favorites").delete().eq("id", id);

    if (error) {
      throw new HttpError(500, "Failed to delete favorite", error);
    }
  }
}
