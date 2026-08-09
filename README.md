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
    supabase.ts            # Persistence on schema `shixato`
    pipeline.ts            # End-to-end orchestration
  types/index.ts
  utils/
supabase/
  config.toml              # Local Supabase; exposes schema `shixato`
  migrations/              # Source of truth for DB
schema.sql                 # SQL Editor bootstrap (same as migration)
wrangler.toml              # Worker config (no secrets)
.env.example               # Local secret template → copy to .dev.vars
```

## Prerequisites

1. Cloudflare account + API token (`CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` for CI)
2. Supabase project with independent schema `shixato` (steps below)
3. Shopify custom app Admin API token (write products)

## Supabase — independent schema (`shixato`)

الجداول **ليست** في `public`. كلها تحت `shixato.products` و `shixato.sync_logs`.

### أ) تطبيق الـ SQL (مرة واحدة)

**خيار 1 — SQL Editor (الأسرع):**
1. Supabase Dashboard → **SQL Editor** → New query
2. الصق محتوى `schema.sql` كاملًا → **Run**
3. Settings → **API** → **Exposed schemas** → أضف `shixato` → Save

**خيار 2 — CLI من نفس المشروع:**
```bash
npx supabase login
npx supabase link --project-ref <YOUR_PROJECT_REF>
npm run db:push
```
ثم نفس خطوة Exposed schemas: أضف `shixato`.

### ب) تحقق
في SQL Editor:
```sql
SELECT table_schema, table_name
FROM information_schema.tables
WHERE table_schema = 'shixato';
```
يجب أن ترى `products` و `sync_logs`.

## Setup

```bash
npm install
cp .env.example .dev.vars
# edit .dev.vars with real values

# Apply shixato schema (above), then:
npm run dev
```

### Production secrets

Never commit tokens. After the first Workers Builds deploy succeeds, set these
secrets on the `shixato` Worker (Dashboard → Settings → Variables and Secrets,
or CLI):

```bash
npx wrangler secret put SHOPIFY_ADMIN_API_TOKEN
npx wrangler secret put SUPABASE_URL
npx wrangler secret put SUPABASE_SERVICE_ROLE_KEY
npx wrangler secret put API_KEY
# optional:
npx wrangler secret put OPENAI_API_KEY
```

`SHOPIFY_STORE_DOMAIN` is a non-secret `[vars]` value in `wrangler.toml`.
Worker name in config is `shixato` (must match the Cloudflare project name).

## Dashboard

Open **`/dashboard`** on the Worker (browsers hitting `/` redirect there).

1. Paste your Cloudflare `API_KEY`
2. Search AliExpress by keyword
3. Open a product → set selling price (optional) → **رفع إلى Shopify**
4. Review **منتجاتي** and **سجلات الرفع**

## API

All mutating / data routes require `Authorization: Bearer <API_KEY>`.

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/dashboard` | Admin UI |
| `GET` | `/health` | Liveness |
| `POST` | `/api/products/search` | AliExpress keyword search |
| `POST` | `/api/products/preview` | Preview from URL/id/listing |
| `POST` | `/api/products/import` | Import → AI → DB → Shopify |
| `GET` | `/api/products` | List stored products (`?q=` filter) |
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
