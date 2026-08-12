import { describe, expect, it } from "vitest";
import { renderDashboardPage } from "./page";

describe("renderDashboardPage", () => {
  it("embeds valid JavaScript (no broken quotes from template literal)", () => {
    const html = renderDashboardPage("test.myshopify.com");
    const scriptMatch = html.match(/<script>\s*([\s\S]*?)<\/script>/);
    expect(scriptMatch).toBeTruthy();
    const script = scriptMatch![1]!;

    expect(script).not.toMatch(/class="" \+/);

    expect(() => new Function(script)).not.toThrow();
  });

  it("includes post-search local filter bar", () => {
    const html = renderDashboardPage("test.myshopify.com");
    expect(html).toContain('id="postSearchFilters"');
    expect(html).toContain('id="postSort"');
    expect(html).toContain('id="postShipping"');
  });

  it("includes login button handler", () => {
    const html = renderDashboardPage("test.myshopify.com");
    expect(html).toContain('id="loginBtn"');
    expect(html).toContain('("loginBtn").onclick = login');
  });
});
