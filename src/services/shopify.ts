import type {
  AliExpressProduct,
  Env,
  ShopifyCreatedProduct,
  ShopifyGraphQLResponse,
} from "../types";
import { clampImages, fetchWithTimeout, HttpError } from "../utils/http";

type ProductCreateData = {
  productCreate: {
    product: ShopifyCreatedProduct | null;
    userErrors: Array<{ field: string[] | null; message: string }>;
  };
};

type ProductVariantsBulkUpdateData = {
  productVariantsBulkUpdate: {
    productVariants: Array<{ id: string; price: string; sku: string | null }> | null;
    userErrors: Array<{ field: string[] | null; message: string }>;
  };
};

type ProductCreateMediaData = {
  productCreateMedia: {
    media: Array<{ id: string; status: string }> | null;
    mediaUserErrors: Array<{ field: string[] | null; message: string }>;
  };
};

/**
 * Shopify Admin GraphQL client for product create / variant / media sync.
 */
export class ShopifyService {
  private endpoint: string;
  private token: string;
  private maxImages: number;

  constructor(env: Env) {
    const domain = env.SHOPIFY_STORE_DOMAIN?.replace(/^https?:\/\//, "").replace(
      /\/$/,
      "",
    );
    const version = env.SHOPIFY_API_VERSION || "2025-01";

    if (!domain) {
      throw new HttpError(500, "SHOPIFY_STORE_DOMAIN is not configured");
    }
    if (!env.SHOPIFY_ADMIN_API_TOKEN) {
      throw new HttpError(500, "SHOPIFY_ADMIN_API_TOKEN is not configured");
    }

    this.endpoint = `https://${domain}/admin/api/${version}/graphql.json`;
    this.token = env.SHOPIFY_ADMIN_API_TOKEN;
    this.maxImages = Number(env.MAX_PRODUCT_IMAGES ?? "8") || 8;
  }

  async createProductFromAliExpress(options: {
    product: AliExpressProduct;
    sellingPrice: number;
    tags?: string[];
  }): Promise<ShopifyCreatedProduct> {
    const { product, sellingPrice, tags = [] } = options;
    const images = clampImages(product.images, this.maxImages);

    const mutation = `
      mutation ProductCreate($product: ProductCreateInput!, $media: [CreateMediaInput!]) {
        productCreate(product: $product, media: $media) {
          product {
            id
            handle
            title
            status
            variants(first: 50) {
              nodes {
                id
                sku
                price
              }
            }
          }
          userErrors {
            field
            message
          }
        }
      }
    `;

    const media = images.map((url) => ({
      originalSource: url,
      mediaContentType: "IMAGE",
      alt: product.title,
    }));

    const variables = {
      product: {
        title: product.title,
        descriptionHtml: product.descriptionHtml,
        vendor: "شيكساتو",
        productType: product.category ?? "منتجات مستوردة",
        tags: ["aliexpress", "عربي", `ae:${product.aliexpressId}`, ...tags],
        status: "ACTIVE",
        // Single default variant price; multi-variant expansion can be layered later
      },
      media,
    };

    const data = await this.graphql<ProductCreateData>(mutation, variables);
    const payload = data.productCreate;

    if (payload.userErrors?.length) {
      throw new HttpError(502, "Shopify productCreate userErrors", payload.userErrors);
    }
    if (!payload.product) {
      throw new HttpError(502, "Shopify productCreate returned no product");
    }

    // Normalize variants connection → flat array for callers
    const created = payload.product as ShopifyCreatedProduct & {
      variants?: { nodes?: Array<{ id: string; sku: string | null; price: string }> };
    };

    const nodes = created.variants?.nodes ?? [];
    const normalized: ShopifyCreatedProduct = {
      id: created.id,
      handle: created.handle,
      title: created.title,
      status: created.status,
      variants: nodes.map((n) => ({ id: n.id, sku: n.sku, price: n.price })),
    };

    // Ensure selling price is applied to the default variant
    if (normalized.variants[0]?.id) {
      await this.updateVariantPrices(
        normalized.id,
        normalized.variants.map((v) => ({
          id: v.id,
          price: sellingPrice.toFixed(2),
          sku: `AE-${product.aliexpressId}`,
        })),
      );
      normalized.variants = normalized.variants.map((v) => ({
        ...v,
        price: sellingPrice.toFixed(2),
        sku: `AE-${product.aliexpressId}`,
      }));
    }

    return normalized;
  }

  async updateVariantPrices(
    productId: string,
    variants: Array<{ id: string; price: string; sku?: string }>,
  ): Promise<void> {
    const mutation = `
      mutation ProductVariantsBulkUpdate($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
        productVariantsBulkUpdate(productId: $productId, variants: $variants) {
          productVariants {
            id
            price
            sku
          }
          userErrors {
            field
            message
          }
        }
      }
    `;

    const data = await this.graphql<ProductVariantsBulkUpdateData>(mutation, {
      productId,
      variants: variants.map((v) => ({
        id: v.id,
        price: v.price,
        inventoryItem: v.sku ? { sku: v.sku } : undefined,
      })),
    });

    if (data.productVariantsBulkUpdate.userErrors?.length) {
      throw new HttpError(
        502,
        "Shopify productVariantsBulkUpdate userErrors",
        data.productVariantsBulkUpdate.userErrors,
      );
    }
  }

  async attachImages(productId: string, imageUrls: string[]): Promise<void> {
    const images = clampImages(imageUrls, this.maxImages);
    if (images.length === 0) return;

    const mutation = `
      mutation ProductCreateMedia($productId: ID!, $media: [CreateMediaInput!]!) {
        productCreateMedia(productId: $productId, media: $media) {
          media {
            ... on MediaImage {
              id
              status
            }
          }
          mediaUserErrors {
            field
            message
          }
        }
      }
    `;

    const data = await this.graphql<ProductCreateMediaData>(mutation, {
      productId,
      media: images.map((url) => ({
        originalSource: url,
        mediaContentType: "IMAGE",
      })),
    });

    if (data.productCreateMedia.mediaUserErrors?.length) {
      throw new HttpError(
        502,
        "Shopify productCreateMedia userErrors",
        data.productCreateMedia.mediaUserErrors,
      );
    }
  }

  async graphql<T>(
    query: string,
    variables?: Record<string, unknown>,
  ): Promise<T> {
    const res = await fetchWithTimeout(
      this.endpoint,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Shopify-Access-Token": this.token,
          Accept: "application/json",
        },
        body: JSON.stringify({ query, variables }),
      },
      30_000,
    );

    const body = (await res.json()) as ShopifyGraphQLResponse<T>;

    if (!res.ok) {
      throw new HttpError(502, `Shopify HTTP ${res.status}`, body);
    }
    if (body.errors?.length) {
      throw new HttpError(502, "Shopify GraphQL errors", body.errors);
    }
    if (!body.data) {
      throw new HttpError(502, "Shopify GraphQL returned empty data", body);
    }

    return body.data;
  }
}
