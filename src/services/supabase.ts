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
      .select("*")
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

  async createSyncLog(input: CreateSyncLogInput): Promise<SyncLogRecord> {
    const { data, error } = await this.client
      .from("sync_logs")
      .insert({
        product_id: input.product_id ?? null,
        aliexpress_id: input.aliexpress_id ?? null,
        shopify_product_id: input.shopify_product_id ?? null,
        action: input.action,
        status: input.status,
        request_payload: input.request_payload ?? null,
        response_payload: input.response_payload ?? null,
        error_message: input.error_message ?? null,
      })
      .select("*")
      .single();

    if (error) {
      throw new HttpError(500, "Failed to create sync log", error);
    }

    return data as SyncLogRecord;
  }

  async listSyncLogs(limit = 50): Promise<SyncLogRecord[]> {
    const { data, error } = await this.client
      .from("sync_logs")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) {
      throw new HttpError(500, "Failed to list sync logs", error);
    }

    return (data as SyncLogRecord[]) ?? [];
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
  }): Promise<AliExpressTokenRecord> {
    const { data, error } = await this.client
      .from("aliexpress_tokens")
      .upsert(
        {
          id: "default",
          access_token: input.accessToken,
          refresh_token: input.refreshToken ?? null,
          expires_at: input.expiresAt ?? null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "id" },
      )
      .select("*")
      .single();

    if (error) {
      throw new HttpError(500, "Failed to save AliExpress token", error);
    }

    // Backward compatibility with app_settings readers
    await this.setSetting("aliexpress_access_token", input.accessToken);
    if (input.refreshToken) {
      await this.setSetting("aliexpress_refresh_token", input.refreshToken);
    }
    if (input.expiresAt) {
      await this.setSetting("aliexpress_token_expires_at", input.expiresAt);
    }

    return data as AliExpressTokenRecord;
  }

  async clearAliExpressToken(): Promise<void> {
    const { error } = await this.client
      .from("aliexpress_tokens")
      .delete()
      .eq("id", "default");

    if (error) {
      throw new HttpError(500, "Failed to clear AliExpress token", error);
    }

    await this.setSetting("aliexpress_access_token", "");
    await this.setSetting("aliexpress_refresh_token", "");
    await this.setSetting("aliexpress_token_expires_at", "");
  }

  async getAliExpressToken(): Promise<AliExpressTokenRecord | null> {
    const { data, error } = await this.client
      .from("aliexpress_tokens")
      .select("*")
      .eq("id", "default")
      .maybeSingle();

    if (error) {
      console.warn("getAliExpressToken failed", error.message);
      return null;
    }

    return (data as AliExpressTokenRecord | null) ?? null;
  }

  async upsertFavorite(input: UpsertFavoriteInput): Promise<FavoriteRecord> {
    const { data, error } = await this.client
      .from("favorites")
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
      throw new HttpError(500, "Failed to save favorite", error);
    }

    return data as FavoriteRecord;
  }

  async listFavorites(limit = 100): Promise<FavoriteRecord[]> {
    const { data, error } = await this.client
      .from("favorites")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(Math.max(limit, 200));

    if (error) {
      throw new HttpError(500, "Failed to list favorites", error);
    }

    const rows = (data as FavoriteRecord[]) ?? [];
    return rows
      .sort((a, b) => {
        const sa = Number((a.listing as { aiScore?: number })?.aiScore ?? 0);
        const sb = Number((b.listing as { aiScore?: number })?.aiScore ?? 0);
        if (sb !== sa) return sb - sa;
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      })
      .slice(0, limit);
  }

  async updateFavorite(
    id: string,
    input: {
      title?: string;
      notes?: string | null;
      listing?: Record<string, unknown>;
    },
  ): Promise<FavoriteRecord> {
    const { data, error } = await this.client
      .from("favorites")
      .update({
        ...(input.title != null ? { title: input.title } : {}),
        ...(input.notes !== undefined ? { notes: input.notes } : {}),
        ...(input.listing != null ? { listing: input.listing } : {}),
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
