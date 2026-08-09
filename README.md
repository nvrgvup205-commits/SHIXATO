# SHIXATO — AliExpress → Shopify Automation

Cloudflare Worker (Hono + TypeScript) that scrapes AliExpress products, optionally filters them with AI, stores them in Supabase, and creates them on Shopify via Admin GraphQL.

## Architecture

```
src/
  index.ts                 # Worker entry + Hono app
  routes/
    products.ts            # /api/products/*
    sync.ts                # /api/sync/*
  services/
    aliexpress.ts          # HTML / embedded JSON extractor
    ai-filter.ts           # LLM or heuristic gate
    shopify.ts             # Admin GraphQL (create / variants / media)
    supabase.ts            # Persistence + sync logs
    pipeline.ts            # End-to-end orchestration
  types/index.ts
  utils/
schema.sql                 # Supabase tables + indexes + RLS
wrangler.toml              # Worker config (no secrets)
.env.example               # Local secret template → copy to .dev.vars
```

## Prerequisites

1. Cloudflare account + API token (`CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` for CI)
2. Supabase project — run `schema.sql` in the SQL editor
3. Shopify custom app Admin API token (write products)

## Setup

```bash
npm install
cp .env.example .dev.vars
# edit .dev.vars with real values

# Apply schema.sql in Supabase, then:
npm run dev
```

### Production secrets

Never commit tokens. Set Worker secrets:

```bash
npx wrangler secret put SHOPIFY_ADMIN_API_TOKEN
npx wrangler secret put SUPABASE_URL
npx wrangler secret put SUPABASE_SERVICE_ROLE_KEY
npx wrangler secret put API_KEY
# optional:
npx wrangler secret put OPENAI_API_KEY
```

`SHOPIFY_STORE_DOMAIN` is a non-secret `[vars]` value in `wrangler.toml`.

## API

All mutating / data routes require `Authorization: Bearer <API_KEY>`.

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/health` | Liveness |
| `POST` | `/api/products/preview` | Scrape only |
| `POST` | `/api/products/import` | Scrape → AI → DB → Shopify |
| `GET` | `/api/products` | List stored products |
| `GET` | `/api/sync/logs` | Sync audit trail |

### Import body

```json
{
  "url": "https://www.aliexpress.com/item/1005006123456789.html",
  "force": false,
  "sellingPrice": 29.99,
  "markup": 1.4
}
```

## Deploy

- Local: `npm run deploy`
- CI: push to `main` → `.github/workflows/deploy.yml` runs `cloudflare/wrangler-action`

GitHub repo secrets required: `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`.

## Security notes

- Shopify / Supabase credentials are Wrangler **secrets**, not `vars`.
- Supabase RLS is enabled; the Worker uses `service_role` server-side only.
- Rotate any token that was shared in chat or committed by mistake.
