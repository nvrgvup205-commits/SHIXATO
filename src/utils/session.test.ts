import { describe, expect, it } from "vitest";
import { getEnvDashboardPin, isValidDashboardPin } from "./session";
import type { Env } from "../types";

const baseEnv = {
  ENVIRONMENT: "test",
  SHOPIFY_STORE_DOMAIN: "test.myshopify.com",
  SHOPIFY_API_VERSION: "2025-01",
  SHOPIFY_ADMIN_API_TOKEN: "x",
  SUPABASE_URL: "",
  SUPABASE_SERVICE_ROLE_KEY: "",
  API_KEY: "",
  DASHBOARD_PIN: "1111",
} as Env;

describe("isValidDashboardPin", () => {
  it("accepts env DASHBOARD_PIN when Supabase is unavailable", async () => {
    expect(await isValidDashboardPin(baseEnv, "1111")).toBe(true);
    expect(await isValidDashboardPin(baseEnv, "9999")).toBe(false);
  });

  it("reads env pin via getEnvDashboardPin", () => {
    expect(getEnvDashboardPin(baseEnv)).toBe("1111");
    expect(getEnvDashboardPin({ ...baseEnv, DASHBOARD_PIN: "4242" })).toBe("4242");
  });
});
