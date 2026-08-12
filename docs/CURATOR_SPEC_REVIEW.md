# Curator Spec — المواصفة المحفوظة + تقييم تقني (قبل التنفيذ)

> **حالة:** مراجعة فقط — **لم يُنفَّذ بعد**
> **تاريخ المراجعة:** أغسطس 2026

---

## الجزء 1: المواصفة الأصلية (كما اتفق عليها مع المستخدم)

### السياق

نظام **Curator** للمنتجات على AliExpress → Shopify.

| المكوّن | الاختيار |
|---------|----------|
| Backend | TypeScript + Hono (Cloudflare Workers) |
| DB | Supabase |
| AI | Anthropic API (Claude 3.5 Sonnet) |
| Trends | Google Trends — **يدوي** (ملف JSON، ليس API مدفوع) |

### الهدف النهائي

- كل يوم الساعة **2 صباحًا** (cron)
- 20 keyword من الفئة **primary**
- بحث AliExpress (safe scraping)
- فلترة صارمة (**90+ score فقط**)
- **5–7 منتجات** يوميًا
- **~40 منتج 90+** في الأسبوع

### الفئة Primary (قابلة للتغيير)

- افتراضي: **Car Organizer** (`car accessories`)
- الكود يدعم: manual search من أي فئة من ال54 + Dashboard للاختبار

### القيود (الأمان أولاً)

1. Rate limiting:
   - 2.5 ثانية بين كل keyword search
   - 3 ثواني بين كل AI request
   - **بدون parallel**
2. User-Agent + delay عشوائي (1–3 ثواني) لكل request
3. على 403/429/timeout: **إعادة بعد ساعة** — **محاولة واحدة فقط**
4. **بدون** proxy/VPN (direct من السعودية)

### Routes

| Route | الوظيفة |
|-------|---------|
| `POST /api/curator/run` | تشغيل يدوي (testing) |
| `POST /api/curator/cron` | cron يومي 2 AM — الفئة primary |
| `POST /api/search-manual` | manual: category + keywords count — فوري |
| `GET /api/results` | نتائج اليوم + التاريخ |
| `GET /dashboard` | UI |

### Supabase Schema (كما في المواصفة)

```sql
-- categories: id, name, ar_name, keyword_list JSONB (20), is_primary
-- curator_daily_results: date, category_id, products JSONB[], scores, ai_approved, run_time_seconds
-- approved_products: aliexpress_id UNIQUE, title, title_ar, price, margin, sales, rating, reviews, ai_score, category_id, image, link, approved_date, imported_to_shopify
```

### Scraping

```javascript
const jsonMatch = html.match(/window\.pageData\s*=\s*({.*?});/s);
const data = JSON.parse(jsonMatch[1]);
```

### AI (Anthropic)

- Prompt 1: «هل يحل مشكلة؟» (yes/no) — timeout 3s
- Prompt 2: هوك عربي (جملة واحدة)
- Model: `claude-3-5-sonnet-20241022`

### Final Score

```
FINAL_SCORE =
  TRUST_SCORE * 0.25 +
  PROBLEM_FIT (AI) * 0.25 +
  MARGIN_SCORE * 0.20 +
  SALES_CREDIBILITY * 0.15 +
  RATING_QUALITY * 0.15

Cutoff: >= 90
```

### Data

- `data/trending-keywords.json` — 20 keyword per category (manual update weekly)
- `data/categories.ts` — 54 فئة

### Services (مقترحة في المواصفة)

- `services/multi-keyword-curator-safe.ts`
- `services/aliexpress-scraper.ts`
- `services/ai-filter.ts`
- `services/scoring.ts`
- `utils/rate-limiter.ts`
- `utils/errors.ts`
- `dashboard/curator.tsx` (React)

### Output JSON يومي

```json
{
  "date": "2025-08-14",
  "category": "car-organizer",
  "execution_time_seconds": 245,
  "total_scanned": 180,
  "total_filtered": 18,
  "approved_90plus": 7,
  "products": [ ... ]
}
```

---

## الجزء 2: تقييمي التقني (صح / غلط / يحتاج تعديل)

### الحكم العام

**الفكرة استراتيجيًا صحيحة ومتناسقة مع SHIXATO** — curator يومي، فئة مركّزة، keywords من Trends، score صارم، 5–7 منتجات فقط. هذا أفضل بكثير من رفع عشوائي.

**لكن ~40% من التفاصيل التقنية تحتاج تعديل** قبل التنفيذ، و**~15% خطأ** مقارنة بما يعمل فعلًا في المشروع وعلى Cloudflare.

| التقييم | النسبة التقريبية |
|---------|------------------|
| ✅ صح / منطقي | ~45% |
| ⚠️ يحتاج تعديل | ~40% |
| ❌ غلط أو غير واقعي | ~15% |

---

### ✅ ما هو صح وننفّذه بنفس الروح

1. **Cron يومي + فئة primary + 20 keywords** — اتجاه ممتاز.
2. **Rate limiting بدون parallel** — ضروري لAliExpress؛ يقلل 429.
3. **Google Trends يدوي في JSON** — عملي ومجاني؛ منطقي.
4. **فلترة محلية قبل AI** — يقلّل التكلفة (المواصفة تلمّح له في الأرقام: 180 → 18).
5. **معادلة FINAL_SCORE** — منطقية؛ الوزن 25% لـ problem-fit مناسب.
6. **5–7 منتجات يوميًا** — كتالوج مركّز = متجر محترف.
7. **Tabs في Dashboard** (Today's / Manual / Settings) — UX واضح.
8. **حفظ نتائج يومية + approved_products** — audit trail مهم.
9. **TypeScript strict + tests** — متوافق مع المشروع الحالي.

---

### ⚠️ يحتاج تعديل (مهم قبل الكود)

#### 1. زمن التشغيل على Cloudflare Workers

المواصفة تتوقع `execution_time_seconds: 245` (~4 دقائق).

- Cron على Workers Paid: **حتى 15 دقيقة wall time** (cron يومي) — **ممكن** تقنيًا.
- لكن HTTP manual run (`/api/curator/run`) إذا ينتظر المستخدم: يحتاج **streaming** أو **job id + polling** أو **Queue** — لا يرجع 245 ثانية في request عادي بدون UX سيء.

**التعديل المقترح:**
- Cron → `scheduled()` handler في Worker (ليس POST route فقط).
- Manual run → يبدأ job ويرجع `{ jobId }` أو يستخدم Queue.
- أو: manual يشغّل **3 keywords فقط** للاختبار السريع.

#### 2. «إعادة بعد ساعة» على 429

Worker **لا ينتظر ساعة** داخل نفس ال invocation.

**التعديل المقترح:**
- Cloudflare **Queues** (retry message بعد delay) أو
- **Durable Object + alarm** بعد 3600s أو
- تسجيل `failed_run` في Supabase + cron ثاني «recovery» بعد ساعة.

#### 3. Scraping: `window.pageData` — **غير مطابق للكود الحالي**

SHIXATO يستخدم فعلًا:
- `appData` → `loaderData` → `searchResult` → `mods.itemList.content`
- + fallback parsers + `extractBalancedJson`

regex `window.pageData` قد **يفشل** على صفحات wholesale الحالية.

**التعديل:** **لا** `aliexpress-scraper.ts` جديد من الصفر — **وسّع** `services/aliexpress.ts` الموجود (~1400 سطر).

#### 4. Supabase Schema — تعارض مع `shixato`

المشروع يستخدم schema منفصل `shixato` (ليس `public`).

**التعديل:**
```sql
shixato.curator_categories
shixato.curator_daily_runs
shixato.curator_products  -- أو توسيع shixato.products
```
+ `keyword_list` كـ `JSONB` (array داخل jsonb) وليس `JSONB[]` كما في المواصفة (نوع SQL غير صحيح).

#### 5. Anthropic timeout 3 ثواني — **قصير جداً**

Claude عادة 2–8+ ثواني. timeout 3s = فشل متكرر → heuristic fallback أو 0 منتجات.

**التعديل:** timeout 15–25s لكل AI call، مع **batch** على أعلى 15–25 منتج بعد الفلترة المحلية فقط.

#### 6. cutoff 90+ — **صارم جداً**

النظام الحالي:
- `discoveryScore` عادة 40–70
- preset `pro` يبدأ من `minScore` 62
- Workers AI prompt يقول صراحة: 85–100 نادر

**النتيجة المتوقعة:** كثير من الأيام **0 منتجات** بـ 90+.

**التعديل المقترح (اختر واحد):**
- **A)** cutoff 90 للـ «ذهبي» + tier 75–89 «مراجعة يدوية»
- **B)** خفّض cutoff لـ 82–85 للإنتاج اليومي
- **C)** احتفظ بـ 90 لكن زِد `fetchPages` و keywords واقبل 2–4 منتجات بعض الأيام

#### 7. Dashboard React (`curator.tsx`) — **لا يطابق المشروع**

لا يوجد React في `package.json`. Dashboard حالي = HTML string في `dashboard/page.ts`.

**التعديل:** Tab جديد في اللوحة الحالية (نفس الأسلوب) أو إضافة Vite+React (تعقيد غير ضروري الآن).

#### 8. `services/ai-filter.ts` — **موجود مسبقاً**

يوجد `ai-filter.ts` (OpenAI/heuristic للرفع) + `workers-ai.ts` (تحليل عربي).

**التعديل:** `services/anthropic-curator.ts` أو `services/curator-ai.ts` — لا تكرار اسم الملف.

#### 9. AI provider: Anthropic vs Workers AI

المواصفة تطلب Anthropic؛ المشروع مفعّل عليه Workers AI مجاني.

**التعديل:** Anthropic للـ curator (جودة أعلى) + Workers AI fallback إذا لا مفتاح — أو قرار واحد للتكلفة.

**تكلفة تقديرية Anthropic:** ~18 منتج × 2 prompts × ~$0.003–0.01 ≈ **$0.05–0.20/يوم** — معقول.

#### 10. `POST /api/curator/cron` كـ route

Cron على Cloudflare = `export default { fetch, scheduled }` + `wrangler.toml`:
```toml
[triggers]
crons = ["0 2 * * *"]  # UTC — 2 AM UTC ≠ 2 AM Saudi
```

**التعديل:** cron trigger يستدعي نفس `CuratorService.run()` — route POST اختياري للاختبار فقط. **2 AM Saudi = 23:00 UTC (أو 22:00 حسب DST).**

---

### ❌ غلط أو مضلل

| النقطة | المشكلة |
|--------|---------|
| `window.pageData` regex | parser خاطئ لصفحات AE الحالية |
| `products JSONB[]` في SQL | نوع غير صحيح في Postgres |
| AI على كل 180 منتج | غير مذكور صراحة لكن التوقيت يفترضه — غير واقعي |
| «محاولة واحدة فقط بعد ساعة» | بدون Queue/Alarm = لن يحدث تلقائيًا |
| 40 منتج/أسبوع بـ 90+ | ممكن لكن **optimistic** — توقع 15–25 أول شهر |

---

### التوافق مع SHIXATO الحالي

| موجود | المواصفة | القرار |
|--------|----------|--------|
| `aliexpress.ts` search + parse | `aliexpress-scraper.ts` | **وسّع الموجود** |
| `listing-discovery.ts` (trust, problem-solving) | TRUST_SCORE, SALES_CREDIBILITY | **أعد استخدامه** |
| `dropship-presets.ts` | scoring thresholds | **ادمج أو استلهم** |
| `categories.ts` 54 فئة | categories + keywords | **أضف trending-keywords.json** |
| `favorites` + import | approved_products | **اربط** approved → favorite → Shopify |
| `workers-ai.ts` | Anthropic | **قرار:** Anthropic primary للcurator |
| Dashboard HTML | React curator.tsx | **HTML tabs** |

---

### معمارية مقترحة عند التنفيذ (إذا اتفقنا)

```
wrangler.toml
  [triggers] crons = ["0 23 * * *"]  # 2 AM Arabia ≈ UTC+3
  [limits] cpu_ms = 300000  # 5 min CPU

src/
  services/
    curator/
      curator-pipeline.ts      # orchestration
      curator-scoring.ts       # FINAL_SCORE (يستخدم listing-discovery)
      curator-ai.ts            # Anthropic (+ fallback workers-ai)
    aliexpress.ts              # + searchMultiKeywords() مع delays

  routes/
    curator.ts                 # /api/curator/*

  data/
    trending-keywords.json

supabase/migrations/
  xxx_curator_tables.sql       # تحت shixato.*

dashboard/page.ts              # Tab: Curator
```

**تدفق التشغيل:**
1. 20 keywords × (fetch + 2.5s delay)
2. دمج + dedupe by `aliexpress_id`
3. فلترة محلية → ~20–40 candidat
4. Anthropic على الأعلى 20 فقط (3s delay بين calls)
5. FINAL_SCORE → حفظ ≥ cutoff
6. إذا أقل من 5: سجّل «يوم ضعيف» ولا تخفّض cutoff تلقائيًا (أو tier ثاني — قرار منتج)

---

### أسئلة للاتفاق قبل التنفيذ

1. **Cutoff:** 90 صارم أم 85 مع tier مراجعة؟
2. **AI:** Anthropic فقط أم Anthropic + Workers AI fallback؟
3. **Cron timezone:** 2 AM **توقيت السعودية**؟
4. **Manual test:** 3 keywords سريع أم full 20؟
5. **بعد الاعتماد:** رفع تلقائي Shopify أم مراجعة يدوية من Tab Today's؟
6. **تكرار المنتج:** نفس `aliexpress_id` في يومين — skip أم تحديث score؟

---

### الخلاصة للمستخدم

| السؤال | الجواب |
|--------|--------|
| الفكرة صح؟ | **نعم** — أفضل اتجاه للمتجر |
| المواصفة جاهزة للنسخ كما هي؟ | **لا** — تحتاج التعديلات أعلاه |
| ننفّذ؟ | **بعد الاتفاق** على الأسئلة الستة + cutoff |

---

*ملف مرجعي — لا تنفيذ حتى موافقة صريحة.*
