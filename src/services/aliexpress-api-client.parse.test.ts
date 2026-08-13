import { describe, expect, it, vi } from "vitest";
import { AliExpressApiClientService } from "./aliexpress-api-client";

const SAMPLE_RAW = {
  aliexpress_ds_product_get_response: {
    result: {
      ae_item_base_info_dto: {
        product_id: 1005006123456789,
        category_id: 200001,
        subject: "Mesh storage bag organizer for toys",
        currency_code: "SAR",
        product_status_type: "onSelling",
        evaluation_count: "228",
        avg_evaluation_rating: "4.9",
        detail: "<p>Product detail</p>",
      },
      ae_multimedia_info_dto: {
        image_urls: "https://img/a.jpg;https://img/b.jpg",
      },
      ae_store_info: {
        store_id: 933191,
        store_name: "Home Organizer Store",
        item_as_described_rating: "4.8",
      },
      package_info_dto: {
        gross_weight: "0.25",
        package_length: 22,
        package_width: 18,
        package_height: 20,
      },
      logistics_info_dto: {
        delivery_time: 7,
        ship_to_country: "SA",
      },
      ae_item_properties: [
        { attr_name: "Material", attr_value: "Mesh" },
        { attr_name: "Color", attr_value: "Gray" },
      ],
      ae_item_sku_info_dtos: [
        {
          id: "12000036569570278",
          offer_sale_price: "6.10",
          sku_price: "7.10",
          currency_code: "SAR",
          sku_available_stock: 120,
          aeop_s_k_u_propertys: [
            { sku_property_name: "Color", sku_property_value: "Gray" },
          ],
        },
      ],
      sales_count: 1500,
    },
  },
};

describe("AliExpressApiClientService.parseProductNode", () => {
  it("maps official DS product payload into a rich profile", async () => {
    const transport = {
      callSync: vi.fn(),
      calculateFreight: vi.fn().mockResolvedValue([
        {
          serviceName: "AliExpress Standard Shipping",
          amount: 0,
          currency: "SAR",
          estimatedDeliveryTime: "15-25",
          trackingAvailable: true,
        },
      ]),
    };

    const client = new AliExpressApiClientService(
      { DEFAULT_MARKUP: "1.4" } as never,
      transport as never,
    );

    transport.callSync.mockResolvedValueOnce(SAMPLE_RAW);

    const profile = await client.getFullProductProfile("1005006123456789");

    expect(profile.productId).toBe("1005006123456789");
    expect(profile.title).toContain("Mesh storage");
    expect(profile.price).toBe(6.1);
    expect(profile.listPrice).toBe(7.1);
    expect(profile.discountPercent).toBe(14);
    expect(profile.sales).toBe(1500);
    expect(profile.reviews).toBe(228);
    expect(profile.rating).toBe(4.9);
    expect(profile.reviewsBreakdown?.estimatedNegativeReviews).toBe(5);
    expect(profile.images).toHaveLength(2);
    expect(profile.store?.name).toBe("Home Organizer Store");
    expect(profile.logistics?.deliveryTimeDays).toBe(7);
    expect(profile.attributes).toHaveLength(2);
    expect(profile.shippingOptions[0]?.estimatedDeliveryDays).toBe("15-25");
    expect(profile.shippingToSaudi?.serviceName).toBe("AliExpress Standard Shipping");
    expect(profile.can_analyze).toBe(true);
    expect(profile.dataSource).toBe("aliexpress_ds_api");
  });
});
