import { describe, expect, it, vi } from "vitest";
import { AliExpressApi, __testables } from "./aliexpress-api";

const CREDS = {
  appKey: "542618",
  appSecret: "test-secret",
  callbackUrl: "https://example.com/callback",
  accessToken: "test-session-token",
  refreshToken: null,
  tokenExpiresAt: null,
};

const SAMPLE_SEARCH_RAW = {
  aliexpress_ds_recommend_feed_get_response: {
    result: {
      products: [
        {
          product_id: 1005006123456789,
          product_title: "Mesh toy storage bag organizer",
          sale_price: "6.10",
          target_sale_price: "6.10",
          volume: 1500,
          evaluate_rate: "4.9",
          review_count: 228,
          product_main_image_url: "https://img/a.jpg",
        },
        {
          product_id: 999,
          product_title: "Unrelated phone case",
          sale_price: "3.00",
          product_main_image_url: "https://img/b.jpg",
        },
      ],
    },
  },
};

const SAMPLE_PRODUCT_RAW = {
  aliexpress_ds_product_get_response: {
    result: {
      ae_item_base_info_dto: {
        product_id: 1005006123456789,
        subject: "Mesh toy storage bag",
        currency_code: "USD",
        evaluation_count: "228",
        avg_evaluation_rating: "4.9",
        sales_count: 1500,
      },
      ae_multimedia_info_dto: { image_urls: "https://img/a.jpg;https://img/b.jpg" },
      ae_item_sku_info_dtos: [
        { offer_sale_price: "6.10", sku_price: "7.10", sku_available_stock: 50 },
      ],
    },
  },
};

describe("AliExpressApi", () => {
  it("filters search results by keyword", async () => {
    const api = new AliExpressApi(CREDS);
    vi.spyOn(api, "callSync").mockResolvedValue(SAMPLE_SEARCH_RAW);

    const rows = await api.searchProducts("storage bag", 1);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.product_id).toBe("1005006123456789");
    expect(rows[0]!.price).toBe(6.1);
    expect(rows[0]!.sales).toBe(1500);
    expect(rows[0]!.image_url).toBe("https://img/a.jpg");
  });

  it("caches identical search keyword", async () => {
    const api = new AliExpressApi(CREDS);
    const spy = vi.spyOn(api, "callSync").mockResolvedValue(SAMPLE_SEARCH_RAW);

    await api.searchProducts("mesh", 1);
    await api.searchProducts("mesh", 1);
    expect(spy).toHaveBeenCalledTimes(3);
  });

  it("parses product details", async () => {
    const api = new AliExpressApi(CREDS);
    vi.spyOn(api, "callSync").mockResolvedValue(SAMPLE_PRODUCT_RAW);

    const product = await api.getProductDetails("1005006123456789");
    expect(product.title).toContain("Mesh");
    expect(product.price).toBe(6.1);
    expect(product.reviews).toBe(228);
    expect(product.images).toHaveLength(2);
  });

  it("returns cheapest shipping option to SA", async () => {
    const api = new AliExpressApi(CREDS);
    vi.spyOn(api, "callSync").mockResolvedValue({
      aliexpress_logistics_buyer_freight_calculate_response: {
        result: {
          aeop_freight_calculate_result_for_buyer_d_t_o_list: [
            {
              service_name: "Standard",
              estimated_delivery_time: "15-25",
              freight: { amount: 12.5, currency_code: "SAR" },
            },
            {
              service_name: "Express",
              estimated_delivery_time: "7-12",
              freight: { amount: 25, currency_code: "SAR" },
            },
          ],
        },
      },
    });

    const shipping = await api.getShippingCost("1005006123456789", 2);
    expect(shipping.cost).toBe(12.5);
    expect(shipping.currency).toBe("SAR");
    expect(shipping.estimated_delivery_days).toBe("15-25");
    expect(shipping.all_options).toHaveLength(2);
  });

  it("requires access token for shipping", async () => {
    const api = new AliExpressApi({ ...CREDS, accessToken: null });
    await expect(api.getShippingCost("123")).rejects.toMatchObject({ status: 401 });
  });
});

describe("aliexpress-api helpers", () => {
  it("picks min sale price from SKUs", () => {
    const price = __testables.pickSalePrice(
      [{ offer_sale_price: "5.5" }, { offer_sale_price: "4.2" }],
      {},
      {},
    );
    expect(price).toBe(4.2);
  });
});
