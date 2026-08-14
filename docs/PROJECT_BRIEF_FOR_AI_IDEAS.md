# SHIXATO — ملخص المشروع وطلب أفكار تطوير

> **الغرض من هذا الملف:** عرضه على ذكاء صناعي آخر لاقتراح أفكار تطوير استراتيجية وتقنية — خصوصًا: كيف أصل لأفضل منتجات في العالم، وهل أستطيع مقارنة صفحات كثيرة على الإنترنت، وكيف أبني متجر محترف كل منتجاته تحل مشاكل والناس تطلبها بسرعة.

---

## 1. من أنا وما الذي أريده؟

أبني **متجر دروب شيبنج** على Shopify (الدومين الحالي: `shxato.myshopify.com`) موجّه للسوق العربي (خصوصًا السعودية). الهدف ليس «أي منتج رخيص»، بل:

1. **منتجات تحل مشاكل حقيقية** — تنظيم، راحة، صحة، أدوات ذكية، حلول يومية.
2. **منتجات يُطلب عليها بسرعة** — مبيعات AliExpress معقولة، تقييمات عالية، أرقام موثوقة (ليست م inflated).
3. **متجر يبدو محترف** — عناوين عربية، وصف تسويقي، هوك إعلاني، صور جيدة، تسعير منطقي.
4. **عملية اختيار ذكية** — ليس بحث عشوائي؛ فلترة + تحليل AI + مقارنة قبل الرفع.

**السؤال الأساسي:** كيف أطوّر النظام الحالي (أو أضيف عليه) بحيث يجيب لي **أفضل المنتجات في العالم** (أو أفضل ما يصل للسعودية من AliExpress) — وهل يمكن **مقارنة عشرات/مئات الصفحات** على الإنترنت (AliExpress، Amazon، TikTok trends، Google Trends، إلخ) للوصول لأفضل النتائج؟

---

## 2. ما الذي بُني حتى الآن؟ (SHIXATO)

### 2.1 الفكرة التقنية

**SHIXATO** = أتمتة: **AliExpress → فلترة AI → Supabase → Shopify**

```
لوحة تحكم (/dashboard)
    ↓ بحث وفلترة
AliExpress (scraping HTML / JSON مضمّن)
    ↓
تحليل AI (Cloudflare Workers AI + OpenAI اختياري)
    ↓
مفضلة / موافقة
    ↓
رفع تلقائي إلى Shopify (GraphQL Admin API)
    ↓
تتبع في Supabase (schema: shixato)
```

### 2.2 التقنيات

| المكوّن | التقنية |
|---------|---------|
| Backend | Cloudflare Workers + Hono + TypeScript |
| قاعدة البيانات | Supabase Postgres — schema منفصل `shixato` |
| المتجر | Shopify Admin GraphQL API |
| AI للتحليل | Cloudflare Workers AI (`@cf/meta/llama-3.1-8b-instruct-fast`) |
| AI للفلترة عند الرفع | OpenAI-compatible API (اختياري) أو heuristic |
| النشر | Wrangler + GitHub Actions |

### 2.3 ما يفعله المستخدم اليوم من اللوحة

1. تسجيل دخول بـ PIN.
2. اختيار **فئة** (~54 فئة: منزل، جوالات، رياضة، حيوانات أليفة، …).
3. بحث AliExpress بفلاتر غنية: سعر، مبيعات، تقييم، شحن، عملة، دولة الشحن (افتراضي SA)، Choice، viral، هامش ربح، …
4. **ثلاث مستويات ذكية (Presets):**
   - 🥉 **مبتدئ** — اكتشاف داخل الفئة، منتجات صادقة
   - 🥈 **متوسط** — توازن تميّز + مصداقية + سنة حالية
   - 🥇 **محترف** — أقوى فلتر، نتائج أقل لكن «رهيبة»
5. تحليل منتج بـ 🤖 AI: عنوان عربي، هوك، نسخة إعلان، وصف، إيجابيات/سلبيات، سعر بيع مقترح، score.
6. إضافة للمفضلة (بعد التحليل).
7. رفع إلى Shopify من المفضلة أو مباشرة من نتائج البحث.

### 2.4 منطق «جودة المنتج» الموجود حاليًا

#### أ) فلاتر البحث (AliExpress)

- جلب **2–3 صفحات** نتائج ودمجها (`fetchPages`).
- وضع **soft filter**: لا يحذف كل شيء؛ يُسجّل النتائج ويُرتبها.
- استبعاد كلمات: replica, fake, wholesale, bulk, random style, stickers, …
- حدود: `minSold`, `minRating`, `minReviews`, `maxNegativeRate`, `minDiscountPercent`, `minMarginPercent`, `targetSellingPrice`.
- تفضيل منتجات **سنة الإطلاق الحالية** (`minLaunchYear`).

#### ب) اكتشاف الجودة (`listing-discovery`)

- **Trust score** — نسبة مبيعات/مراجعات معقولة (كشف الأرقام الم inflated على AliExpress).
- **Uniqueness score** — تجنب العناوين العامة (ملصقات، عشوائي، wholesale).
- **Problem-solving detection** — regex على العنوان: organize, solve, smart, ergonomic, holder, anti-, instant, …
- **Discovery score** — مجموع للترتيب.

#### ج) تحليل AI (`workers-ai`)

- يقيّم: هل المنتج يحل مشكلة؟ هل الأرقام مشبوهة؟ هل العنوان عام؟
- يولّد: `hookAr` (لهجة سعودية)، `adCopyAr`, `descriptionAr`, `suggestedTitle`, `suggestedSellingPrice`.
- Score من 0–100؛ الموافقة عادة ≥ 58.

#### د) فلتر الرفع (`ai-filter`)

- قبل إنشاء المنتج على Shopify: موافقة/رفض (LLM أو heuristic).
- يرفض: adult, weapons, counterfeit, قوائم فارغة.

### 2.5 API endpoints الرئيسية

| Method | Path | الوظيفة |
|--------|------|---------|
| POST | `/api/products/search` | بحث AliExpress |
| POST | `/api/favorites/smart-search` | بحث بالـ preset (مبتدئ/متوسط/محترف) |
| POST | `/api/ai/analyze` | تحليل منتج بالذكاء الاصطناعي |
| GET/POST | `/api/favorites` | مفضلة |
| POST | `/api/favorites/:id/import` | رفع من المفضلة إلى Shopify |
| POST | `/api/products/import` | رفع مباشر |
| GET | `/api/products` | المنتجات المخزنة |
| GET | `/api/sync/logs` | سجل الرفع |

### 2.6 قاعدة البيانات (Supabase `shixato`)

- `products` — منتجات مع status: pending, filtered_out, approved, synced, failed
- `sync_logs` — تدقيق كل عملية
- `favorites` — مفضلة مع listing JSON كامل + تحليل AI
- `app_settings` — إعدادات التطبيق

---

## 3. القيود والفجوات الحالية

### 3.1 مصدر واحد فقط

- **AliExpress فقط** — لا Amazon، لا Temu، لا موردين محليين، لا TikTok Shop API.
- Scraping HTML — قد يتكسر مع تغيير AliExpress؛ لا API رسمي.

### 3.2 عمق المقارنة محدود

- يُجلب 2–3 صفحات نتائج AliExpress (~40–120 منتج تقريبًا حسب الصفحة).
- **لا مقارنة cross-platform** (نفس المنتج على Amazon vs AliExpress).
- **لا مقارنة بين موردين** لنفس الفئة بشكل منهجي.
- **لا تحليل مراجعات** (نص التقييمات) — فقط أرقام aggregate.

### 3.3 AI محدود

- نموذج Workers AI صغير (Llama 8B) — جيد للهوك والوصف لكن ليس deep product research.
- لا رؤية صور (vision) لجودة المنتج من الصور.
- لا embeddings / clustering لاكتشاف «نفس المنتج مكرر 50 مرة».

### 3.4 لا أتمتة كاملة للمتجر

- الاختيار **يدوي** من اللوحة (بحث → تحليل → مفضلة → رفع).
- لا cron يومي «يجيب أفضل 10 منتجات» تلقائيًا.
- لا ربط مع إعلانات Meta/TikTok لاختبار demand قبل الرفع.

### 3.5 Shopify فقط

- لا تحسين SEO متقدم، لا A/B للصفحات، لا bundles، لا upsells مدمجة في الأتمتة.

### 3.6 السوق والمنتج

- التركيز على **دروب شيبنج عام** — ليس niche محدد بعمق (مثلاً: «حلول تنظيم السيارة للسعودية» فقط).
- لا بيانات حقيقية من المتجر (conversion rate، ما الذي يُباع فعلًا) في loop التحسين.

---

## 4. الأهداف الاستراتيجية (ما أريد الوصول له)

### 4.1 «أفضل منتجات في العالم»

تعريف عملي أقترحه:

| المعيار | ماذا يعني |
|---------|-----------|
| **Problem-fit** | يحل مشكلة واضحة يعاني منها المستهلك |
| **Proof** | مبيعات + مراجعات حقيقية، ليس inflated |
| **Margin** | هامش ≥ 30–40% بعد الشحن |
| **Logistics** | شحن معقول لـ SA، Choice/شحن مجاني إن أمكن |
| **Differentiation** | ليس generic bulk/sticker/random |
| **Trend timing** | جديد أو trending (2025–2026) |
| **Content-ready** | صور ≥ 3، عنوان يُترجم لتسويق عربي |

### 4.2 «مقارنة صفحات كثيرة على الإنترنت»

أريد أفكار حول:

- جلب **10–50 صفحة** نتائج AliExpress لنفس الفئة/الكلمات.
- مقارنة **مصادر متعددة**: AliExpress + Amazon bestsellers + Google Trends + TikTok hashtags.
- **تجميع** منتجات متشابهة واختيار «الأفضل ممثل» لكل cluster.
- **Scoring موحّد** يجمع: بيانات المنصة + AI + مراجعات + صور.

### 4.3 «متجر محترف — الناس تطلب بسرعة»

- كتالوج **مركّز** (50–200 منتج ممتاز) وليس 5000 منتج عشوائي.
- كل منتج: قصة، مشكلة، حل، CTA عربي.
- تسعير وشحن واضح للسعودية.
- منتجات تُختار بناءً على **demand signals** وليس فقط «رخيص».

---

## 5. أسئلة محددة لذكاء صناعي آخر

> **اقترح عليّ أفكار عملية (استراتيجية + تقنية) للأسئلة التالية:**

### استراتيجية المنتج

1. كيف أحدد **niche** أو **فئات فرعية** داخل الـ 54 فئة الحالية لأعلى conversion في السعودية؟
2. ما **مصادر إشارات demand** التي يجب أن أضيفها (TikTok, Google Trends, Amazon SA, Salla competitors, …)؟
3. كيف أبني **معيار score موحّد** يجمع كل الإشارات؟
4. كم منتج في المتجر للبداية — 30، 50، 100 — وكيف أختار التوزيع بين الفئات؟

### تقنية وجمع البيانات

5. هل **مقارنة 20–50 صفحة AliExpress** واقعية على Workers (timeouts, rate limits) — وما البنية المقترحة (Queues, Cron, Batch jobs)؟
6. أفضل طريقة لـ **cross-platform comparison** بدون APIs رسمية (scraping ethics, proxies, third-party APIs مثل Rainforest/ScraperAPI)؟
7. كيف أستخدم **embeddings** لتجميع المنتجات المتشابهة واختيار واحد فقط؟
8. هل **vision AI** على صور المنتج يحسّن الاختيار فعلًا — ومتى؟
9. كيف أحلل **نص المراجعات** (sentiment, مشاكل متكررة) قبل الرفع؟

### الأتمتة والعمليات

10. تصميم **pipeline يومي/أسبوعي**: discover → score → auto-shortlist → مراجعة بشرية → رفع.
11. ربط مع **Shopify analytics** و Meta Pixel لإعادة تدريب اختيار المنتجات على ما يُباع فعلًا.
12. **A/B testing** للهوك والعناوين قبل تثبيت المنتج في المتجر.

### Shopify والتسويق

13. بنية **collection** محترفة (حلول مشاكل: «نظم بيتك»، «راحة السيارة»، …) وليس فئات AliExpress خام.
14. upsells, bundles, و landing pages لكل منتج «viral».
15. محتوى UGC / فيديو قصير — كيف يدخل في loop الاختيار؟

### المخاطر والقانون

16. منتجات يجب تجنبها في السعودية (جمارك، مواصفات، بلدية، …).
17. حدود scraping AliExpress وبدائل قانونية (AliExpress Dropshipping Center API، CJ Dropshipping، …).

---

## 6. ما أريد منك (الذكاء الاصطناعي الذي يقرأ هذا)

### المطلوب في الرد:

1. **خطة تطوير** على 3 مستويات: سريع (أسبوع)، متوسط (شهر)، طويل (3+ أشهر) — **بدون تقدير أيام/أسابيع كجدول زمني**؛ ركّز على **ما يُبنى وما يعتمد على ما**.
2. **10–15 فكرة ملموسة** لتحسين اختيار المنتجات (ليس عامات مثل «استخدم AI»).
3. **معمارية مقترحة** لمقارنة مصادر متعددة وصفحات كثيرة — components، queues، storage.
4. **Scorecard** — معادلة أو معايير وزنية لـ «أفضل منتج».
5. **Workflow يومي** لمشغل واحد: من الفئة إلى منتج على Shopify في أقل خطوات.
6. **أول 3 تجارب** (experiments) أبدأ بها غدًا بأقل تكلفة.
7. **تحذيرات** — ما الذي لا يعمل في الدروب شيبنج 2026 وما الذي يُبالغ فيه.

### تنسيق الرد المفضل

- عربي واضح.
- نقاط مرقّمة + جداول حيث يلزم.
- اقتراحات **قابلة للتنفيذ** على Stack الحالي (Workers + Supabase + Shopify).
- إن اقترحت أداة خارجية، اذكر: التكلفة التقريبية، الصعوبة، والبديل بدونها.

---

## 7. ملحق — هيكل الكود (للمطور / AI تقني)

```
src/
  index.ts                 # Hono app
  dashboard/page.ts        # لوحة RTL عربية
  routes/
    products.ts            # search, preview, import, list
    favorites.ts           # smart-search, CRUD, import
    ai.ts                  # analyze, status
    sync.ts                # logs
  services/
    aliexpress.ts          # search + scrape (~1400 سطر)
    pipeline.ts            # orchestration
    workers-ai.ts          # تحليل عربي
    ai-filter.ts           # فلتر الرفع
    shopify.ts             # GraphQL
    supabase.ts            # persistence
  data/
    categories.ts          # 54 فئة
    dropship-presets.ts    # starter/balanced/pro
  utils/
    listing-discovery.ts   # trust, uniqueness, problem-solving
    result-filters.ts      # post-filter sort
    arabic-product.ts      # وصف HTML عربي
```

**اختبارات:** Vitest على الفلاتر، AliExpress URL، Arabic product، session.

---

## 8. سياق السوق

- **الجمهور:** السعودية والخليج (عربي، لهجة سعودية في الإعلانات).
- **العملة:** USD في AliExpress، عرض SAR/AED على المتجر.
- **الشحن:** `shipToCountry: SA` افتراضيًا.
- **المنافسة:** متاجر دروب شيبنج عامة + Salla/Zid محليين — التمييز = **منتجات محلولة مشاكل + محتوى عربي قوي**.

---

*آخر تحديث للملخص: أغسطس 2026 — مشروع SHIXATO على Cloudflare Workers.*
