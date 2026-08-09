import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type {
  Env,
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
}
