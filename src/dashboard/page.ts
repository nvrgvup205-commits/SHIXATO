/** SHIXATO admin dashboard — PIN login + rich AliExpress filters */

import { DROPSHIP_PRESETS } from "../data/dropship-presets";
import { PRODUCT_CATEGORIES } from "../data/categories";

export function renderDashboardPage(storeDomain: string): string {
  const store = storeDomain.replace(/^https?:\/\//, "").replace(/\/$/, "");
  const presetsJson = JSON.stringify(
    DROPSHIP_PRESETS.map((p) => ({
      id: p.id,
      labelAr: p.labelAr,
      emoji: p.emoji,
      descAr: p.descAr,
      tipAr: p.tipAr,
    })),
  );
  const categoryOptions = [
    `<option value="">— اختَر فئة (اختياري مع كلمة بحث) —</option>`,
    ...PRODUCT_CATEGORIES.map(
      (c) =>
        `<option value="${c.id}">${c.labelAr}</option>`,
    ),
  ].join("");

  return `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>SHIXATO — لوحة التحكم</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Arabic:wght@400;500;600;700&family=Syne:wght@700;800&display=swap" rel="stylesheet" />
  <style>
    :root {
      --ink: #10231f;
      --muted: #5a6f69;
      --panel: rgba(255,255,255,0.78);
      --line: rgba(16,35,31,0.12);
      --accent: #0f8a6a;
      --accent-2: #e8ff57;
      --danger: #b42318;
      --ok: #067647;
      --shadow: 0 18px 50px rgba(16,35,31,0.12);
      --radius: 18px;
      --font: "IBM Plex Sans Arabic", system-ui, sans-serif;
      --display: "Syne", "IBM Plex Sans Arabic", sans-serif;
    }
    * { box-sizing: border-box; }
    html, body { margin: 0; min-height: 100%; }
    body {
      font-family: var(--font); color: var(--ink);
      background:
        radial-gradient(1200px 600px at 10% -10%, rgba(232,255,87,0.42), transparent 55%),
        radial-gradient(900px 500px at 100% 0%, rgba(15,138,106,0.2), transparent 50%),
        linear-gradient(165deg, #eef5ef 0%, #f7faf7 40%, #e7f0ea 100%);
      background-attachment: fixed;
    }
    .wrap { width: min(1240px, calc(100% - 2rem)); margin: 0 auto; padding: 1.25rem 0 3rem; }
    header.appbar {
      display: flex; align-items: center; justify-content: space-between; gap: 1rem;
      margin-bottom: 1.25rem; animation: rise .55s ease both;
    }
    .brand {
      font-family: var(--display); font-weight: 800;
      font-size: clamp(1.8rem, 4vw, 2.6rem); letter-spacing: -0.04em; margin: 0;
    }
    .brand span { color: var(--accent); }
    .store-pill {
      font-size: .85rem; color: var(--muted); border: 1px solid var(--line);
      background: var(--panel); backdrop-filter: blur(10px);
      padding: .55rem .85rem; border-radius: 999px;
    }
    .panel {
      background: var(--panel); border: 1px solid var(--line); border-radius: var(--radius);
      box-shadow: var(--shadow); backdrop-filter: blur(14px);
      padding: 1.1rem 1.2rem; animation: rise .65s ease both;
    }
    .gate { max-width: 420px; margin: 14vh auto; text-align: center; }
    .pin-input {
      font-size: 1.8rem; letter-spacing: .35em; text-align: center;
      font-weight: 700; padding: 1rem !important;
    }
    label { display: block; font-size: .9rem; font-weight: 600; margin: 0 0 .35rem; }
    input, select, button, textarea {
      font: inherit; border-radius: 12px; border: 1px solid var(--line); background: #fff;
    }
    input, select, textarea {
      width: 100%; padding: .75rem .85rem; color: var(--ink); outline: none;
    }
    input:focus, select:focus, textarea:focus {
      border-color: var(--accent); box-shadow: 0 0 0 3px rgba(15,138,106,.15);
    }
    .btn {
      appearance: none; border: none; cursor: pointer; font-weight: 700;
      padding: .8rem 1.05rem; border-radius: 12px; transition: transform .15s, opacity .15s;
    }
    .btn:active { transform: translateY(1px) scale(.99); }
    .btn:disabled { opacity: .55; cursor: wait; }
    .btn-primary { background: var(--ink); color: #fff; }
    .btn-accent { background: var(--accent); color: #fff; }
    .btn-ghost { background: transparent; border: 1px solid var(--line); color: var(--ink); }
    .tabs { display: flex; gap: .4rem; margin-bottom: 1rem; flex-wrap: wrap; }
    .tab {
      border: 1px solid var(--line); background: rgba(255,255,255,.5);
      padding: .55rem .9rem; border-radius: 999px; cursor: pointer; font-weight: 600;
    }
    .tab.active { background: var(--ink); color: #fff; border-color: var(--ink); }
    .hint { color: var(--muted); font-size: .88rem; margin: .35rem 0 .8rem; }
    .filters {
      display: grid; grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
      gap: .7rem; margin-top: .6rem;
    }
    .filters .wide { grid-column: 1 / -1; }
    .check {
      display: flex; align-items: center; gap: .45rem; font-size: .88rem; font-weight: 600;
      padding: .7rem .75rem; border: 1px solid var(--line); border-radius: 12px; background: #fff;
    }
    .check input { width: auto; }
    .grid {
      display: grid; grid-template-columns: repeat(auto-fill, minmax(210px, 1fr));
      gap: .9rem; margin-top: 1rem;
    }
    .product {
      border: 1px solid var(--line); border-radius: 16px; background: #fff;
      overflow: hidden; cursor: pointer; text-align: start;
      transition: transform .2s, box-shadow .2s; animation: pop .4s ease both;
    }
    .product:hover { transform: translateY(-3px); box-shadow: var(--shadow); }
    .product img { width: 100%; aspect-ratio: 1; object-fit: cover; display: block; background: #e8eee9; }
    .product .meta { padding: .75rem .8rem .9rem; }
    .product h3 {
      margin: 0 0 .35rem; font-size: .9rem; line-height: 1.35;
      display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;
    }
    .price { font-weight: 700; color: var(--accent); }
    .sub { font-size: .78rem; color: var(--muted); margin-top: .2rem; }
    .product-details {
      font-size: .74rem; color: var(--muted); margin-top: .35rem;
      line-height: 1.45; border-top: 1px dashed var(--line); padding-top: .35rem;
    }
    .product-details span { display: block; }
    .ship-free { color: var(--ok); font-weight: 600; }
    .ship-paid { color: #8a4b12; font-weight: 600; }
    .img-gallery {
      display: flex; gap: .35rem; flex-wrap: wrap; margin: .5rem 0;
      max-height: 130px; overflow-y: auto;
    }
    .img-gallery img {
      width: 56px; height: 56px; object-fit: cover; border-radius: 8px;
      border: 1px solid var(--line); cursor: pointer;
    }
    .img-gallery img.active {
      border-color: var(--accent);
      box-shadow: 0 0 0 2px rgba(15,138,106,.25);
    }
    .add-preview {
      margin-top: 1rem; padding: 1rem; border: 1px solid var(--line);
      border-radius: 14px; background: rgba(255,255,255,.55);
    }
    .add-preview .img-gallery img { width: 72px; height: 72px; }
    .badges { display: flex; flex-wrap: wrap; gap: .25rem; margin-top: .4rem; }
    .badge {
      font-size: .68rem; font-weight: 700; padding: .12rem .4rem; border-radius: 999px;
      background: #eef6f2; color: var(--accent);
    }
    .toast {
      position: fixed; bottom: 1rem; left: 50%; transform: translateX(-50%) translateY(120%);
      background: var(--ink); color: #fff; padding: .75rem 1rem; border-radius: 999px;
      z-index: 50; transition: transform .25s; max-width: min(92vw, 520px);
      text-align: center; font-size: .92rem;
    }
    .toast.show { transform: translateX(-50%) translateY(0); }
    .toast.err { background: var(--danger); }
    .hidden { display: none !important; }
    table { width: 100%; border-collapse: collapse; font-size: .9rem; }
    th, td { text-align: start; padding: .65rem .4rem; border-bottom: 1px solid var(--line); vertical-align: top; }
    th { color: var(--muted); font-weight: 600; }
    .status {
      display: inline-block; padding: .15rem .5rem; border-radius: 999px;
      font-size: .75rem; font-weight: 700; background: #eef2ef;
    }
    .status.synced { background: #dcfae6; color: var(--ok); }
    .status.failed, .status.filtered_out { background: #fee4e2; color: var(--danger); }
    .drawer-backdrop {
      position: fixed; inset: 0; background: rgba(16,35,31,.35); z-index: 40;
      opacity: 0; pointer-events: none; transition: opacity .2s;
    }
    .drawer-backdrop.open { opacity: 1; pointer-events: auto; }
    .drawer {
      position: fixed; top: 0; bottom: 0; left: 0; width: min(440px, 100%);
      background: #fff; z-index: 41; transform: translateX(-105%);
      transition: transform .28s cubic-bezier(.2,.8,.2,1);
      padding: 1.2rem; overflow: auto; box-shadow: var(--shadow);
    }
    .drawer.open { transform: translateX(0); }
    .drawer img { width: 100%; border-radius: 14px; aspect-ratio: 1; object-fit: cover; background: #e8eee9; }
    .drawer h2 { font-family: var(--display); font-size: 1.3rem; margin: .8rem 0 .4rem; letter-spacing: -.03em; }
    .stats { display: grid; grid-template-columns: 1fr 1fr; gap: .5rem; margin: .7rem 0; }
    .stat { border: 1px solid var(--line); border-radius: 12px; padding: .55rem .65rem; }
    .stat b { display: block; font-size: .78rem; color: var(--muted); font-weight: 600; }
    details.more { margin-top: .7rem; }
    details.more summary { cursor: pointer; font-weight: 700; color: var(--accent); }
    .smart-search {
      margin: .75rem 0 1rem; padding: 1rem; border-radius: 16px;
      border: 1px dashed rgba(15,138,106,.35); background: rgba(15,138,106,.06);
    }
    .smart-search h3 {
      margin: 0 0 .35rem; font-family: var(--display); font-size: 1.05rem;
    }
    .preset-row { display: flex; gap: .55rem; flex-wrap: wrap; margin-top: .65rem; }
    .preset-btn {
      flex: 1 1 180px; text-align: start; padding: .75rem .85rem;
      border-radius: 14px; border: 1px solid var(--line); background: #fff;
      cursor: pointer; transition: transform .15s, box-shadow .15s, border-color .15s;
    }
    .preset-btn:hover { transform: translateY(-2px); box-shadow: var(--shadow); border-color: var(--accent); }
    .preset-btn:disabled { opacity: .55; cursor: wait; transform: none; }
    .preset-btn .grade { font-weight: 800; font-size: .95rem; display: block; }
    .preset-btn .desc { font-size: .78rem; color: var(--muted); margin-top: .2rem; line-height: 1.35; }
    #presetTip {
      margin-top: .55rem; padding: .55rem .7rem; border-radius: 10px;
      background: rgba(232,255,87,.35); font-size: .84rem; line-height: 1.45;
    }
    .fav-card {
      display: flex; gap: .75rem; align-items: flex-start; padding: .75rem;
      border: 1px solid var(--line); border-radius: 14px; background: #fff; margin-bottom: .65rem;
    }
    .fav-card img { width: 72px; height: 72px; object-fit: cover; border-radius: 10px; flex-shrink: 0; }
    .fav-actions { display: flex; gap: .4rem; flex-wrap: wrap; margin-top: .45rem; }
    .fav-actions .btn { padding: .45rem .7rem; font-size: .82rem; }
    @keyframes rise { from { opacity: 0; transform: translateY(12px);} to { opacity: 1; transform: none;} }
    @keyframes pop { from { opacity: 0; transform: scale(.97);} to { opacity: 1; transform: none;} }
  </style>
</head>
<body>
  <div class="wrap">
    <header class="appbar">
      <h1 class="brand">SHI<span>XATO</span></h1>
      <div style="display:flex;gap:.5rem;align-items:center;flex-wrap:wrap">
        <a class="btn btn-accent" id="openStoreBtn" href="https://${store}" target="_blank" rel="noopener" style="text-decoration:none">دخول المتجر</a>
        <div class="store-pill">${store}</div>
      </div>
    </header>

    <section id="gate" class="panel gate">
      <h2 style="margin:0 0 .35rem;font-family:var(--display);letter-spacing:-.03em;">أدخل الرقم السري</h2>
      <p class="hint" id="loginHint">اكتب الرقم ثم اضغط دخول — الافتراضي: <strong>1111</strong>. يمكن لعدة أشخاص الدخول معًا (لا يوجد قفل جلسة).</p>
      <input id="pin" class="pin-input" type="password" inputmode="numeric" maxlength="12" placeholder="••••" autocomplete="one-time-code" />
      <div style="margin-top:.9rem">
        <button class="btn btn-primary" id="loginBtn" type="button" style="width:100%">دخول وشكراً</button>
      </div>
    </section>

    <section id="app" class="hidden">
      <div class="tabs">
        <button class="tab active" data-tab="search" type="button">بحث المنتجات</button>
        <button class="tab" data-tab="favorites" type="button">المفضلة للمراجعة</button>
        <button class="tab" data-tab="add" type="button">إضافة منتج</button>
        <button class="tab" data-tab="catalog" type="button">منتجاتي</button>
        <button class="tab" data-tab="logs" type="button">سجلات الرفع</button>
        <button class="tab" data-tab="settings" type="button">إعدادات</button>
      </div>

      <section id="tab-search" class="panel">
        <div class="smart-search">
          <h3>بحث ذكي للدروب شيبنج — بدون فئة ثابتة</h3>
          <p class="hint" style="margin:0">يختار كلمة بحث مناسبة تلقائيًا ويطبّق فلاتر جاهزة. العناوين بالعربي من علي إكسبريس.</p>
          <div class="preset-row" id="presetButtons"></div>
          <div id="presetTip" class="hidden"></div>
        </div>

        <div class="filters" style="margin-bottom:.75rem">
          <div class="wide">
            <label for="category">الفئة</label>
            <select id="category">${categoryOptions}</select>
          </div>
          <div class="wide">
            <label for="query">كلمة البحث (اختياري إذا اخترت فئة)</label>
            <div style="display:flex;gap:.6rem;flex-wrap:wrap">
              <input id="query" type="search" placeholder="اتركه فارغًا لاستخدام الفئة… أو اكتب كلمة مثل phone case" style="flex:1 1 240px" />
              <button class="btn btn-accent" id="searchBtn" type="button">بحث بالفلاتر</button>
            </div>
          </div>
        </div>
        <p class="hint">لو كلمة البحث فاضية: لازم تختار <strong>فئة</strong> — ويجيب تصنيفات تحتها مع باقي الفلاتر كما هي.</p>

        <div class="filters" id="filters">
          <div>
            <label for="locale">لغة العناوين</label>
            <select id="locale">
              <option value="ar" selected>عربي (من علي إكسبريس)</option>
              <option value="en">English</option>
            </select>
          </div>
          <div>
            <label for="sort">الترتيب</label>
            <select id="sort">
              <option value="orders" selected>الأكثر مبيعًا</option>
              <option value="default">أفضل تطابق</option>
              <option value="price_asc">السعر ↑</option>
              <option value="price_desc">السعر ↓</option>
              <option value="newest">الأحدث</option>
            </select>
          </div>
          <div>
            <label for="minPrice">أقل سعر</label>
            <input id="minPrice" type="number" min="0" step="0.01" placeholder="1" />
          </div>
          <div>
            <label for="maxPrice">أعلى سعر</label>
            <input id="maxPrice" type="number" min="0" step="0.01" placeholder="50" />
          </div>
          <div>
            <label for="currency">العملة</label>
            <select id="currency">
              <option value="USD" selected>USD</option>
              <option value="SAR">SAR</option>
              <option value="AED">AED</option>
              <option value="EUR">EUR</option>
              <option value="GBP">GBP</option>
              <option value="EGP">EGP</option>
            </select>
          </div>
          <div>
            <label for="shipToCountry">بلد الشحن إلى</label>
            <select id="shipToCountry">
              <option value="SA" selected>السعودية SA</option>
              <option value="AE">الإمارات AE</option>
              <option value="EG">مصر EG</option>
              <option value="US">أمريكا US</option>
              <option value="GB">بريطانيا GB</option>
              <option value="DE">ألمانيا DE</option>
              <option value="FR">فرنسا FR</option>
            </select>
          </div>
          <div>
            <label for="shipFromCountry">الشحن من</label>
            <select id="shipFromCountry">
              <option value="">أي بلد</option>
              <option value="CN">الصين CN</option>
              <option value="SA">السعودية SA</option>
              <option value="AE">الإمارات AE</option>
              <option value="US">أمريكا US</option>
              <option value="ES">إسبانيا ES</option>
              <option value="PL">بولندا PL</option>
            </select>
          </div>
          <div>
            <label for="minSold">أقل مبيعات</label>
            <input id="minSold" type="number" min="0" step="1" placeholder="500" />
          </div>
          <div>
            <label for="maxSold">أعلى مبيعات</label>
            <input id="maxSold" type="number" min="0" step="1" placeholder="" />
          </div>
          <div>
            <label for="minRating">أقل تقييم ★</label>
            <input id="minRating" type="number" min="0" max="5" step="0.1" placeholder="4.5" />
          </div>
          <div>
            <label for="minReviews">أقل عدد تقييمات</label>
            <input id="minReviews" type="number" min="0" step="1" placeholder="50" />
          </div>
          <div>
            <label for="maxNegativeRate">أقصى % تقييمات سلبية</label>
            <input id="maxNegativeRate" type="number" min="0" max="100" step="1" placeholder="20" />
          </div>
          <div>
            <label for="minDiscountPercent">أقل خصم %</label>
            <input id="minDiscountPercent" type="number" min="0" max="95" step="1" placeholder="30" />
          </div>
          <div>
            <label for="targetSellingPrice">سعر بيع مستهدف</label>
            <input id="targetSellingPrice" type="number" min="0" step="0.01" placeholder="29.99" />
          </div>
          <div>
            <label for="minMarginPercent">أقل هامش ربح %</label>
            <input id="minMarginPercent" type="number" min="0" max="95" step="1" placeholder="40" />
          </div>
          <div>
            <label for="includeKeywords">كلمات يجب أن تظهر (اختياري)</label>
            <input id="includeKeywords" placeholder="اتركه فارغًا إن لم تحتج" />
          </div>
          <div>
            <label for="excludeKeywords">استبعاد كلمات (اختياري)</label>
            <input id="excludeKeywords" placeholder="اتركه فارغًا إن لم تحتج" />
          </div>

          <label class="check"><input id="freeShipping" type="checkbox" /> شحن مجاني</label>
          <label class="check"><input id="choiceOnly" type="checkbox" /> Choice فقط</label>
          <label class="check"><input id="highRatedSellers" type="checkbox" /> بائعون بتقييم عالي</label>
          <label class="check"><input id="unitPrice" type="checkbox" /> سعر الوحدة</label>
          <label class="check"><input id="requireViralBadge" type="checkbox" /> منتجات فايرل / رائجة</label>
          <label class="check"><input id="requireFreeShippingBadge" type="checkbox" /> شارة شحن مجاني</label>
        </div>

        <p class="hint">نصيحة: ابدأ بفئة + ترتيب فقط، ولو ما في نتائج خفّف «كلمات يجب أن تظهر» وعدد التقييمات/المبيعات — كثير من الفلاتر المحلية تستبعد كل البطاقات.</p>
        <div id="searchStatus" class="hint"></div>
        <div id="searchUrlRow" class="hidden" style="margin:.35rem 0">
          <a class="btn btn-ghost" id="openSearchAe" href="#" target="_blank" rel="noopener" style="text-decoration:none;font-size:.85rem">
            فتح رابط البحث على علي إكسبريس (مع الفلاتر)
          </a>
        </div>
        <div id="filterActions" class="hidden" style="margin:.5rem 0">
          <button class="btn btn-ghost" id="showRawBtn" type="button">عرض النتائج بدون فلتر محلي</button>
          <button class="btn btn-ghost" id="clearLocalFiltersBtn" type="button">مسح الفلاتر المحلية القاسية</button>
        </div>
        <div id="results" class="grid"></div>
      </section>

      <section id="tab-favorites" class="panel hidden">
        <p class="hint">منتجات حفظتها للمراجعة قبل الرفع إلى Shopify. راجعها ثم ارفع أو احذف.</p>
        <div style="display:flex;gap:.55rem;flex-wrap:wrap;margin-bottom:.75rem">
          <button class="btn btn-ghost" id="refreshFavorites" type="button">تحديث المفضلة</button>
        </div>
        <div id="favoritesList"></div>
      </section>

      <section id="tab-add" class="panel hidden">
        <p class="hint">ألصق <strong>رابط المنتج</strong> من علي إكسبريس أو <strong>رقم المنتج</strong> فقط — ثم معاينة أو رفع مباشرة إلى Shopify.</p>
        <div style="display:flex;gap:.6rem;flex-wrap:wrap;margin-bottom:.75rem">
          <input id="addUrl" type="url" placeholder="https://www.aliexpress.com/item/1005006123456789.html" style="flex:1 1 280px" />
          <button class="btn btn-ghost" id="addPreviewBtn" type="button">معاينة</button>
          <button class="btn btn-accent" id="addImportBtn" type="button">رفع إلى Shopify</button>
        </div>
        <label for="addSell">سعر البيع (اختياري)</label>
        <input id="addSell" type="number" min="0" step="0.01" placeholder="اتركه فارغًا للهامش التلقائي" />
        <div id="addPreview" class="add-preview hidden"></div>
      </section>

      <section id="tab-catalog" class="panel hidden">
        <div style="display:flex;gap:.6rem;flex-wrap:wrap">
          <input id="catalogQ" type="search" placeholder="فلترة منتجاتي..." style="flex:1" />
          <button class="btn btn-ghost" id="refreshCatalog" type="button">تحديث</button>
        </div>
        <div style="overflow:auto;margin-top:1rem">
          <table>
            <thead><tr><th>المنتج</th><th>السعر</th><th>الحالة</th><th>AliExpress</th></tr></thead>
            <tbody id="catalogBody"></tbody>
          </table>
        </div>
      </section>

      <section id="tab-logs" class="panel hidden">
        <button class="btn btn-ghost" id="refreshLogs" type="button">تحديث السجلات</button>
        <div style="overflow:auto;margin-top:1rem">
          <table>
            <thead><tr><th>الوقت</th><th>الإجراء</th><th>الحالة</th><th>التفاصيل</th></tr></thead>
            <tbody id="logsBody"></tbody>
          </table>
        </div>
      </section>

      <section id="tab-settings" class="panel hidden">
        <p class="hint">المتجر: <strong>${store}</strong></p>
        <div style="display:flex;gap:.55rem;flex-wrap:wrap;margin-bottom:1rem">
          <a class="btn btn-accent" href="https://${store}" target="_blank" rel="noopener" style="text-decoration:none">دخول المتجر</a>
          <a class="btn btn-ghost" href="https://${store}/admin" target="_blank" rel="noopener" style="text-decoration:none">لوحة Shopify Admin</a>
        </div>

        <h3 style="margin:0 0 .5rem;font-family:var(--display)">تغيير الرقم السري</h3>
        <div class="filters">
          <div>
            <label for="currentPin">الرقم الحالي</label>
            <input id="currentPin" type="password" inputmode="numeric" placeholder="1111" />
          </div>
          <div>
            <label for="newPin">الرقم الجديد</label>
            <input id="newPin" type="password" inputmode="numeric" placeholder="مثلاً 2222" />
          </div>
          <div>
            <label for="newPin2">تأكيد الرقم الجديد</label>
            <input id="newPin2" type="password" inputmode="numeric" placeholder="أعد الكتابة" />
          </div>
        </div>
        <div style="display:flex;gap:.55rem;flex-wrap:wrap;margin-top:.8rem">
          <button class="btn btn-primary" id="changePinBtn" type="button">تغيير كلمة السر</button>
          <button class="btn btn-ghost" id="logoutBtn" type="button">خروج</button>
        </div>
        <p class="hint">يُحفظ الرقم في Supabase (<code>shixato.app_settings</code>). نفّذ migration الجدول إن لم يكن موجودًا.</p>
      </section>
    </section>
  </div>

  <div class="drawer-backdrop" id="backdrop"></div>
  <aside class="drawer" id="drawer">
    <button class="btn btn-ghost" id="closeDrawer" type="button">إغلاق</button>
    <img id="dImg" alt="" />
    <div class="img-gallery" id="dGallery"></div>
    <h2 id="dTitle"></h2>
    <div class="price" id="dPrice"></div>
    <div class="stats">
      <div class="stat"><b>المبيعات</b><span id="dSold">—</span></div>
      <div class="stat"><b>التقييم</b><span id="dRating">—</span></div>
      <div class="stat"><b>عدد التقييمات</b><span id="dReviews">—</span></div>
      <div class="stat"><b>% سلبية تقديري</b><span id="dNeg">—</span></div>
      <div class="stat"><b>الشحن</b><span id="dShip">—</span></div>
      <div class="stat"><b>التوصيل</b><span id="dDelivery">—</span></div>
    </div>
    <div class="badges" id="dBadges"></div>
    <div class="hint" id="dShipDetail" style="margin-top:.5rem"></div>
    <label for="dSell" style="margin-top:1rem">سعر البيع (اختياري)</label>
    <input id="dSell" type="number" min="0" step="0.01" placeholder="اتركه فارغًا للهامش التلقائي" />
    <label class="check" style="margin-top:.65rem">
      <input id="dAlsoFavorite" type="checkbox" />
      أضف للمفضلة أيضًا بعد الرفع (للمراجعة لاحقًا)
    </label>
    <div style="display:flex;gap:.55rem;flex-wrap:wrap;margin-top:.8rem">
      <button class="btn btn-accent" id="importBtn" type="button">رفع إلى Shopify</button>
      <button class="btn btn-ghost" id="favoriteBtn" type="button">حفظ في المفضلة فقط</button>
      <a class="btn btn-ghost" id="openAe" href="#" target="_blank" rel="noopener" style="text-decoration:none;text-align:center">فتح علي إكسبريس</a>
    </div>
    <p class="hint" id="dHint"></p>
  </aside>
  <div class="toast" id="toast"></div>

  <script>
    const PRESETS = ${presetsJson};
    const state = { listing: null, lastSearch: null, addPreview: null, lastPreset: null };

    const $ = (id) => document.getElementById(id);
    const toast = (msg, err=false) => {
      const el = $("toast");
      el.textContent = msg;
      el.classList.toggle("err", !!err);
      el.classList.add("show");
      setTimeout(() => el.classList.remove("show"), 3200);
    };

    async function api(path, options = {}) {
      const res = await fetch(path, {
        credentials: "include",
        headers: { "Content-Type": "application/json", ...(options.headers || {}) },
        ...options,
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || body.ok === false) throw new Error(body.error || ("HTTP " + res.status));
      return body;
    }

    function showApp(on) {
      $("gate").classList.toggle("hidden", on);
      $("app").classList.toggle("hidden", !on);
    }

    function escapeHtml(s) {
      return String(s || "")
        .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
    }

    async function loadLoginHint() {
      try {
        const hint = await fetch("/api/auth/hint", { credentials: "include" })
          .then((r) => r.json())
          .catch(() => null);
        if (hint?.ok && hint.data?.hint) {
          $("loginHint").innerHTML = escapeHtml(hint.data.hint) +
            " · يمكن لعدة أشخاص الدخول معًا.";
        }
        if (hint?.data && !hint.data.supabaseReachable) {
          $("loginHint").innerHTML +=
            ' <span style="color:var(--danger)">(Supabase غير متصل — استخدم 1111)</span>';
        }
      } catch (_) { /* ignore */ }
    }

    async function boot() {
      await loadLoginHint();
      try {
        const me = await api("/api/auth/me");
        if (me.data && me.data.authenticated) {
          showApp(true);
          return;
        }
      } catch (_) {
        $("loginHint").textContent =
          "تعذّر الاتصال بالخادم — تأكد أن Worker مُحدَّث ويعمل ثم أعد المحاولة.";
      }
      showApp(false);
    }

    async function login() {
      const pin = $("pin").value.trim();
      if (!pin) return toast("اكتب الرقم السري", true);
      $("loginBtn").disabled = true;
      try {
        await api("/api/auth/login", { method: "POST", body: JSON.stringify({ pin }) });
        const me = await api("/api/auth/me");
        if (!me.data || !me.data.authenticated) {
          toast(
            "تم قبول الرقم لكن الجلسة لم تُحفظ — امسح كوكيز الموقع أو جرّب متصفح/نافذة خاصة",
            true,
          );
          return;
        }
        showApp(true);
        toast("تم الدخول — ابحث عن منتجاتك");
      } catch (e) {
        toast(e.message || "فشل الدخول", true);
      } finally {
        $("loginBtn").disabled = false;
      }
    }
    $("loginBtn").onclick = login;
    $("pin").addEventListener("keydown", (e) => { if (e.key === "Enter") login(); });
    $("logoutBtn").onclick = async () => {
      await api("/api/auth/logout", { method: "POST", body: "{}" });
      location.reload();
    };

    document.querySelectorAll(".tab").forEach((btn) => {
      btn.addEventListener("click", () => {
        document.querySelectorAll(".tab").forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        ["search","favorites","add","catalog","logs","settings"].forEach((name) => {
          $("tab-" + name).classList.toggle("hidden", btn.dataset.tab !== name);
        });
        if (btn.dataset.tab === "catalog") loadCatalog();
        if (btn.dataset.tab === "logs") loadLogs();
        if (btn.dataset.tab === "favorites") loadFavorites();
      });
    });

    function num(id) {
      const v = $(id).value;
      if (v === "" || v == null) return undefined;
      const n = Number(v);
      return Number.isFinite(n) ? n : undefined;
    }

    function collectFilters() {
      return {
        query: $("query").value.trim(),
        category: $("category").value || undefined,
        page: 1,
        sort: $("sort").value,
        minPrice: num("minPrice"),
        maxPrice: num("maxPrice"),
        currency: $("currency").value,
        shipToCountry: $("shipToCountry").value,
        shipFromCountry: $("shipFromCountry").value || undefined,
        freeShipping: $("freeShipping").checked,
        choiceOnly: $("choiceOnly").checked,
        highRatedSellers: $("highRatedSellers").checked,
        unitPrice: $("unitPrice").checked,
        minSold: num("minSold"),
        maxSold: num("maxSold"),
        minRating: num("minRating"),
        minReviews: num("minReviews"),
        maxNegativeRate: num("maxNegativeRate"),
        minDiscountPercent: num("minDiscountPercent"),
        requireViralBadge: $("requireViralBadge").checked,
        requireFreeShippingBadge: $("requireFreeShippingBadge").checked,
        includeKeywords: $("includeKeywords").value.trim() || undefined,
        excludeKeywords: $("excludeKeywords").value.trim() || undefined,
        targetSellingPrice: num("targetSellingPrice"),
        minMarginPercent: num("minMarginPercent"),
        locale: $("locale").value || "ar",
      };
    }

    function applyFiltersToForm(filters) {
      $("category").value = "";
      $("query").value = filters.query || "";
      if (filters.sort) $("sort").value = filters.sort;
      if (filters.locale) $("locale").value = filters.locale;
      const setNum = (id, v) => { $(id).value = v != null ? String(v) : ""; };
      setNum("minPrice", filters.minPrice);
      setNum("maxPrice", filters.maxPrice);
      if (filters.currency) $("currency").value = filters.currency;
      if (filters.shipToCountry) $("shipToCountry").value = filters.shipToCountry;
      $("shipFromCountry").value = filters.shipFromCountry || "";
      setNum("minSold", filters.minSold);
      setNum("maxSold", filters.maxSold);
      setNum("minRating", filters.minRating);
      setNum("minReviews", filters.minReviews);
      setNum("maxNegativeRate", filters.maxNegativeRate);
      setNum("minDiscountPercent", filters.minDiscountPercent);
      setNum("targetSellingPrice", filters.targetSellingPrice);
      setNum("minMarginPercent", filters.minMarginPercent);
      $("includeKeywords").value = filters.includeKeywords || "";
      $("excludeKeywords").value = filters.excludeKeywords || "";
      const checks = ["freeShipping","choiceOnly","highRatedSellers","unitPrice","requireViralBadge","requireFreeShippingBadge"];
      checks.forEach((id) => { $(id).checked = !!filters[id]; });
    }

    function showPresetTip(text) {
      const el = $("presetTip");
      if (!text) { el.classList.add("hidden"); el.textContent = ""; return; }
      el.textContent = text;
      el.classList.remove("hidden");
    }

    function renderPresetButtons() {
      const root = $("presetButtons");
      root.innerHTML = "";
      PRESETS.forEach((p) => {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "preset-btn";
        btn.dataset.grade = p.id;
        btn.innerHTML =
          '<span class="grade">' + escapeHtml(p.emoji + " " + p.labelAr) + "</span>" +
          '<span class="desc">' + escapeHtml(p.descAr) + "</span>";
        btn.onclick = () => runSmartSearch(p.id);
        root.appendChild(btn);
      });
    }

    async function saveFavorite(listing, presetGrade) {
      await api("/api/favorites", {
        method: "POST",
        body: JSON.stringify({ listing, presetGrade: presetGrade || null }),
      });
    }

    async function runSmartSearch(grade) {
      document.querySelectorAll(".preset-btn").forEach((b) => { b.disabled = true; });
      const preset = PRESETS.find((p) => p.id === grade);
      showPresetTip(preset ? ("💡 " + preset.tipAr) : "");
      $("searchStatus").textContent = "جاري البحث الذكي (" + (preset?.labelAr || grade) + ")…";
      $("filterActions").classList.add("hidden");
      try {
        const res = await api("/api/favorites/smart-search", {
          method: "POST",
          body: JSON.stringify({
            grade,
            shipToCountry: $("shipToCountry").value,
            currency: $("currency").value,
          }),
        });
        const data = res.data || {};
        state.lastSearch = data;
        state.lastPreset = grade;
        const items = data.results || [];
        applyFiltersToForm({
          ...data.filtersApplied,
          query: data.query,
          locale: "ar",
        });
        const via = data.presetLabelAr ? (" · " + data.presetLabelAr) : "";
        $("searchStatus").textContent =
          "نتائج ذكية: " + (data.totalAfterFilter ?? items.length) +
          " بعد الفلتر / " + (data.totalParsed ?? items.length) + " قبل الفلتر" +
          " · بحث: " + (data.query || "") + via +
          (data.warning ? (" — " + data.warning) : "");

        if (data.searchUrl) {
          $("searchUrlRow").classList.remove("hidden");
          $("openSearchAe").href = data.searchUrl;
        } else {
          $("searchUrlRow").classList.add("hidden");
        }

        const wiped = (data.totalParsed > 0 && items.length === 0);
        $("filterActions").classList.toggle("hidden", !wiped && !data.warning);
        renderResults(items);
        if (!items.length) {
          toast(data.warning || "لا نتائج — جرّب درجة أخف (مبتدئ)", true);
        } else {
          toast("تم العثور على " + items.length + " منتج — عناوين عربية");
        }
      } catch (e) {
        $("searchStatus").textContent = "";
        toast(e.message || "فشل البحث الذكي", true);
      } finally {
        document.querySelectorAll(".preset-btn").forEach((b) => { b.disabled = false; });
      }
    }

    function money(n, c="USD") {
      const numv = Number(n);
      if (!Number.isFinite(numv)) return "—";
      try {
        return new Intl.NumberFormat("en-US", { style: "currency", currency: c || "USD" }).format(numv);
      } catch {
        return numv + " " + c;
      }
    }

    function aeProductUrl(item) {
      const id = item.aliexpressId || "";
      if (item.url && item.url.indexOf("/item/") >= 0) return item.url;
      return "https://www.aliexpress.com/item/" + id + ".html";
    }

    function formatDeliveryText(text) {
      if (!text) return "";
      return String(text).replace(/^Delivery:\\s*/i, "توصيل: ");
    }

    function formatShippingType(item) {
      if (item.shippingType === "free") return "مجاني";
      if (item.shippingType === "conditional_free") {
        return item.shippingNote || "مجاني بشروط";
      }
      if (item.shippingType === "paid") {
        if (item.shippingCost != null && item.shippingCost > 0) {
          return "مدفوع (~" + money(item.shippingCost, item.shippingCostCurrency) + ")";
        }
        return "مدفوع";
      }
      if (item.isFreeShipping) return "مجاني (تقريبي)";
      return "—";
    }

    function buildShippingSummary(item) {
      const parts = [];
      if (item.shipFrom) parts.push("من " + item.shipFrom);
      if (item.shipTo) parts.push("إلى " + item.shipTo);
      if (item.shippingMethod) parts.push(item.shippingMethod);
      if (item.shippingCarrier) parts.push("ناقل: " + item.shippingCarrier);
      return parts.join(" · ");
    }

    function buildProductDetailLines(item) {
      const lines = [];
      const route =
        (item.shipFrom ? ("من " + item.shipFrom) : "") +
        (item.shipTo ? (" → إلى " + item.shipTo) : "");
      if (route.trim()) lines.push("🚚 " + route.trim());

      if (item.deliveryEstimate) {
        lines.push("📅 " + formatDeliveryText(item.deliveryEstimate));
      }

      const shipLabel = formatShippingType(item);
      if (shipLabel !== "—") {
        const cls =
          item.shippingType === "free" || item.shippingType === "conditional_free"
            ? "ship-free"
            : item.shippingType === "paid" ? "ship-paid" : "";
        lines.push({ text: "💰 الشحن: " + shipLabel, cls });
      }

      if (item.shippingNote && item.shippingType !== "free") {
        lines.push("ℹ️ " + item.shippingNote);
      }

      if (item.isLocalWarehouse) lines.push("📍 مستودع محلي / شحن سريع");
      if (item.isChoice) lines.push("✓ Choice");
      if (item.discountPercent != null && item.discountPercent > 0) {
        lines.push("🏷 خصم " + item.discountPercent + "%");
      }
      if (item.listPrice && item.listPrice > item.originalPrice) {
        lines.push("💵 كان " + money(item.listPrice, item.currency));
      }
      if (item.storeLaunchDate) {
        lines.push("🕐 أُدرج: " + item.storeLaunchDate.split(" ")[0]);
      }

      return lines;
    }

    function renderResults(items) {
      const root = $("results");
      root.innerHTML = "";
      items.forEach((item, idx) => {
        const el = document.createElement("article");
        el.className = "product";
        el.style.animationDelay = (idx * 0.025) + "s";
        const badgeHtml = (item.badges || []).slice(0, 3).map((b) =>
          '<span class="badge">' + escapeHtml(b) + "</span>"
        ).join("");
        const detailLines = buildProductDetailLines(item);
        const detailsHtml = detailLines.map((line) => {
          if (typeof line === "string") {
            return "<span>" + escapeHtml(line) + "</span>";
          }
          return '<span class="' + escapeHtml(line.cls || "") + '">' +
            escapeHtml(line.text) + "</span>";
        }).join("");
        el.innerHTML =
          '<img src="' + escapeHtml(item.image || "") + '" alt="" loading="lazy" />' +
          '<div class="meta">' +
          "<h3>" + escapeHtml(item.title) + "</h3>" +
          '<div class="price">' + money(item.originalPrice, item.currency) + "</div>" +
          '<div class="sub">' +
            escapeHtml(item.sold || (item.soldCount != null ? (item.soldCount + " sold") : "")) +
            (item.rating != null ? (" · ★ " + item.rating) : "") +
            (item.reviewCount != null ? (" · " + item.reviewCount + " تقييم") : "") +
            (item.negativeRateEstimate != null ? (" · سلبي≈" + item.negativeRateEstimate + "%") : "") +
            (item.images && item.images.length > 1 ? (" · " + item.images.length + " صور") : "") +
          "</div>" +
          (detailsHtml ? ('<div class="product-details">' + detailsHtml + "</div>") : "") +
          '<div class="badges">' + badgeHtml + "</div>" +
          "</div>";
        el.onclick = () => openDrawer(item);
        root.appendChild(el);
      });
    }

    async function runSearch() {
      const filters = collectFilters();
      if ((!filters.query || filters.query.length < 2) && !filters.category) {
        return toast("اختر فئة أو اكتب كلمة بحث", true);
      }
      $("searchBtn").disabled = true;
      $("searchStatus").textContent = "جاري البحث وتصفية النتائج...";
      $("filterActions").classList.add("hidden");
      try {
        const res = await api("/api/products/search", {
          method: "POST",
          body: JSON.stringify(filters),
        });
        const data = res.data || {};
        state.lastSearch = data;
        const items = data.results || [];
        const via = (data.filtersApplied && data.filtersApplied.categoryLabelAr)
          ? (" · فئة: " + data.filtersApplied.categoryLabelAr)
          : "";
        $("searchStatus").textContent =
          "نتائج: " + (data.totalAfterFilter ?? items.length) +
          " بعد الفلتر / " + (data.totalParsed ?? items.length) + " قبل الفلتر المحلي" +
          " · بحث: " + (data.query || "") + via +
          (data.warning ? (" — " + data.warning) : "");

        if (data.searchUrl) {
          $("searchUrlRow").classList.remove("hidden");
          $("openSearchAe").href = data.searchUrl;
          $("openSearchAe").textContent = data.usedFallbackUrl
            ? "فتح رابط البحث المبسّط على علي إكسبريس (الفلاتر طُبّقت محليًا)"
            : "فتح رابط البحث على علي إكسبريس (مع الفلاتر)";
        } else {
          $("searchUrlRow").classList.add("hidden");
        }

        const wiped = (data.totalParsed > 0 && items.length === 0);
        $("filterActions").classList.toggle("hidden", !wiped && !data.warning);

        renderResults(items);
        if (wiped) {
          toast("الفلاتر استبعدت كل النتائج — جرّب العرض بدون فلتر محلي", true);
        } else if (!items.length) {
          toast(data.warning || "لا نتائج — خفّف الفلاتر أو غيّر الفئة", true);
        }
      } catch (e) {
        $("searchStatus").textContent = "";
        $("filterActions").classList.add("hidden");
        toast(e.message || "فشل البحث", true);
      } finally {
        $("searchBtn").disabled = false;
      }
    }
    $("searchBtn").onclick = runSearch;
    $("query").addEventListener("keydown", (e) => { if (e.key === "Enter") runSearch(); });

    $("showRawBtn").onclick = () => {
      const raw = (state.lastSearch && state.lastSearch.resultsBeforeFilter) || [];
      if (!raw.length) return toast("لا توجد نتائج خام", true);
      renderResults(raw);
      $("searchStatus").textContent =
        "عرض " + raw.length + " نتيجة بدون فلتر محلي (يمكنك الرفع مباشرة)";
      toast("تم عرض النتائج قبل الفلتر المحلي");
    };

    $("clearLocalFiltersBtn").onclick = () => {
      ["minSold","maxSold","minRating","minReviews","maxNegativeRate","minDiscountPercent","targetSellingPrice","minMarginPercent","includeKeywords","excludeKeywords"].forEach((id) => {
        $(id).value = "";
      });
      ["freeShipping","choiceOnly","highRatedSellers","unitPrice","requireViralBadge","requireFreeShippingBadge"].forEach((id) => {
        $(id).checked = false;
      });
      toast("تم مسح الفلاتر المحلية — اضغط بحث مرة أخرى");
    };

    $("changePinBtn").onclick = async () => {
      const currentPin = $("currentPin").value.trim();
      const newPin = $("newPin").value.trim();
      const newPin2 = $("newPin2").value.trim();
      if (!currentPin || !newPin) return toast("أكمل الحقول", true);
      if (newPin !== newPin2) return toast("تأكيد الرقم غير متطابق", true);
      try {
        await api("/api/auth/change-pin", {
          method: "POST",
          body: JSON.stringify({ currentPin, newPin }),
        });
        $("currentPin").value = "";
        $("newPin").value = "";
        $("newPin2").value = "";
        toast("تم تغيير الرقم السري بنجاح");
      } catch (e) {
        toast(e.message || "فشل تغيير الرقم", true);
      }
    };

    function renderImageGallery(container, images, onSelect) {
      container.innerHTML = "";
      if (!images || !images.length) return;
      images.forEach((src, i) => {
        const thumb = document.createElement("img");
        thumb.src = src;
        thumb.alt = "";
        if (i === 0) thumb.classList.add("active");
        thumb.onclick = (e) => {
          e.stopPropagation();
          onSelect(src);
          container.querySelectorAll("img").forEach((t) => t.classList.remove("active"));
          thumb.classList.add("active");
        };
        container.appendChild(thumb);
      });
    }

    function openDrawer(item) {
      state.listing = item;
      const imgs = (item.images && item.images.length)
        ? item.images
        : (item.image ? [item.image] : []);
      $("dImg").src = imgs[0] || "";
      renderImageGallery($("dGallery"), imgs, (src) => { $("dImg").src = src; });
      $("dTitle").textContent = item.title;
      $("dPrice").textContent = money(item.originalPrice, item.currency) +
        (item.listPrice ? (" · كان " + money(item.listPrice, item.currency)) : "") +
        (item.discountPercent != null ? (" · خصم " + item.discountPercent + "%") : "");
      $("dSold").textContent = item.sold || (item.soldCount != null ? String(item.soldCount) : "—");
      $("dRating").textContent = item.rating != null ? ("★ " + item.rating) : "—";
      $("dReviews").textContent = item.reviewCount != null ? String(item.reviewCount) : "—";
      $("dNeg").textContent = item.negativeRateEstimate != null ? (item.negativeRateEstimate + "%") : "—";
      $("dShip").textContent = formatShippingType(item);
      $("dDelivery").textContent = item.deliveryEstimate
        ? formatDeliveryText(item.deliveryEstimate)
        : "—";
      $("dShipDetail").textContent = buildShippingSummary(item);
      $("dBadges").innerHTML = (item.badges || []).map((b) =>
        '<span class="badge">' + escapeHtml(b) + "</span>"
      ).join("");
      $("dSell").value = "";
      $("openAe").href = aeProductUrl(item);
      $("dHint").textContent = "الرفع يستخدم بيانات بطاقة البحث + فلاترك. ID: " + item.aliexpressId;
      $("drawer").classList.add("open");
      $("backdrop").classList.add("open");
    }
    function closeDrawer() {
      $("drawer").classList.remove("open");
      $("backdrop").classList.remove("open");
      state.listing = null;
    }
    $("closeDrawer").onclick = closeDrawer;
    $("backdrop").onclick = closeDrawer;

    $("importBtn").onclick = async () => {
      if (!state.listing) return;
      $("importBtn").disabled = true;
      try {
        const selling = $("dSell").value ? Number($("dSell").value) : undefined;
        const res = await api("/api/products/import", {
          method: "POST",
          body: JSON.stringify({
            aliexpressId: state.listing.aliexpressId,
            force: true,
            sellingPrice: selling,
            listing: state.listing,
          }),
        });
        if ($("dAlsoFavorite").checked) {
          await saveFavorite(state.listing, state.lastPreset);
        }
        toast(res.data && res.data.synced ? "تم الرفع إلى Shopify" : "تم الحفظ بدون مزامنة كاملة");
        closeDrawer();
      } catch (e) {
        toast(e.message || "فشل الرفع", true);
      } finally {
        $("importBtn").disabled = false;
      }
    };

    $("favoriteBtn").onclick = async () => {
      if (!state.listing) return;
      $("favoriteBtn").disabled = true;
      try {
        await saveFavorite(state.listing, state.lastPreset);
        toast("تم الحفظ في المفضلة للمراجعة");
        closeDrawer();
      } catch (e) {
        toast(e.message || "فشل الحفظ", true);
      } finally {
        $("favoriteBtn").disabled = false;
      }
    };

    async function loadCatalog() {
      const q = $("catalogQ").value.trim();
      try {
        const res = await api("/api/products?limit=100" + (q ? ("&q=" + encodeURIComponent(q)) : ""));
        const body = $("catalogBody");
        body.innerHTML = "";
        (res.data || []).forEach((p) => {
          const tr = document.createElement("tr");
          const img = (p.images && p.images[0])
            ? '<img src="' + escapeHtml(p.images[0]) + '" alt="" style="width:42px;height:42px;object-fit:cover;border-radius:8px;vertical-align:middle;margin-inline-end:8px" />'
            : "";
          tr.innerHTML =
            "<td>" + img + "<strong>" + escapeHtml(p.title) + "</strong></td>" +
            "<td>" + money(p.selling_price) + "</td>" +
            '<td><span class="status ' + escapeHtml(p.status) + '">' + escapeHtml(p.status) + "</span></td>" +
            '<td><a href="' + escapeHtml("https://www.aliexpress.com/item/" + p.aliexpress_id + ".html") + '" target="_blank" rel="noopener">' +
            p.aliexpress_id + "</a></td>";
          body.appendChild(tr);
        });
        if (!(res.data || []).length) {
          body.innerHTML = '<tr><td colspan="4" class="hint">لا منتجات بعد.</td></tr>';
        }
      } catch (e) { toast(e.message || "فشل التحميل", true); }
    }
    $("refreshCatalog").onclick = loadCatalog;

    async function loadFavorites() {
      const root = $("favoritesList");
      root.innerHTML = '<p class="hint">جاري التحميل…</p>';
      try {
        const res = await api("/api/favorites?limit=100");
        const rows = res.data || [];
        if (!rows.length) {
          root.innerHTML = '<p class="hint">لا منتجات في المفضلة — احفظ من نتائج البحث للمراجعة.</p>';
          return;
        }
        root.innerHTML = "";
        rows.forEach((fav) => {
          const listing = fav.listing || {};
          const img = listing.image || (listing.images && listing.images[0]) || "";
          const card = document.createElement("div");
          card.className = "fav-card";
          card.innerHTML =
            '<img src="' + escapeHtml(img) + '" alt="" loading="lazy" />' +
            '<div style="flex:1;min-width:0">' +
            "<strong style='display:block;line-height:1.35'>" + escapeHtml(fav.title) + "</strong>" +
            '<div class="sub">' + money(fav.original_price, fav.currency) +
            " · ID " + escapeHtml(fav.aliexpress_id) + "</div>" +
            '<div class="fav-actions">' +
            '<button class="btn btn-accent fav-import" type="button">رفع Shopify</button>' +
            '<button class="btn btn-ghost fav-open" type="button">معاينة</button>' +
            '<button class="btn btn-ghost fav-del" type="button">حذف</button>' +
            "</div></div>";
          card.querySelector(".fav-open").onclick = () => openDrawer(listing);
          card.querySelector(".fav-import").onclick = async () => {
            try {
              const r = await api("/api/favorites/" + fav.id + "/import", {
                method: "POST",
                body: JSON.stringify({ force: true }),
              });
              toast(r.data && r.data.synced ? "تم الرفع من المفضلة" : "تم الحفظ");
            } catch (e) { toast(e.message || "فشل الرفع", true); }
          };
          card.querySelector(".fav-del").onclick = async () => {
            try {
              await api("/api/favorites/" + fav.id, { method: "DELETE" });
              toast("تم الحذف");
              loadFavorites();
            } catch (e) { toast(e.message || "فشل الحذف", true); }
          };
          root.appendChild(card);
        });
      } catch (e) {
        root.innerHTML = '<p class="hint" style="color:var(--danger)">' + escapeHtml(e.message || "فشل التحميل") + "</p>";
      }
    }
    $("refreshFavorites").onclick = loadFavorites;

    function renderAddPreview(product) {
      const box = $("addPreview");
      if (!product) {
        box.classList.add("hidden");
        box.innerHTML = "";
        return;
      }
      box.classList.remove("hidden");
      const imgs = (product.images || []).slice(0, 16);
      const gallery = imgs.map((src) =>
        '<img src="' + escapeHtml(src) + '" alt="" loading="lazy" />'
      ).join("");
      const reviews = product.attributes?.reviewCount || product.attributes?.rating;
      box.innerHTML =
        "<h3 style='margin:0 0 .5rem'>" + escapeHtml(product.title) + "</h3>" +
        '<div class="price">' + money(product.originalPrice, product.currency) +
        (product.images ? (" · " + product.images.length + " صورة") : "") + "</div>" +
        '<div class="img-gallery" style="margin-top:.5rem">' + gallery + "</div>" +
        '<p class="hint" style="margin-top:.5rem">ID: ' + escapeHtml(product.aliexpressId) + "</p>";
    }

    async function previewAddProduct() {
      const raw = $("addUrl").value.trim();
      if (!raw) return toast("ألصق رابط أو رقم المنتج", true);
      $("addPreviewBtn").disabled = true;
      try {
        const res = await api("/api/products/preview", {
          method: "POST",
          body: JSON.stringify(
            /^\\d{6,20}$/.test(raw) ? { aliexpressId: raw } : { url: raw },
          ),
        });
        state.addPreview = res.data;
        renderAddPreview(state.addPreview);
        toast("تم جلب المنتج — " + (state.addPreview.images?.length || 0) + " صورة");
      } catch (e) {
        state.addPreview = null;
        renderAddPreview(null);
        toast(e.message || "فشل المعاينة — جرّب الرابط أو استخدم البحث", true);
      } finally {
        $("addPreviewBtn").disabled = false;
      }
    }

    async function importAddProduct() {
      const raw = $("addUrl").value.trim();
      if (!raw && !state.addPreview) return toast("ألصق رابط أو رقم المنتج", true);
      $("addImportBtn").disabled = true;
      try {
        const selling = $("addSell").value ? Number($("addSell").value) : undefined;
        const body = state.addPreview
          ? {
              aliexpressId: state.addPreview.aliexpressId,
              force: true,
              sellingPrice: selling,
              listing: {
                aliexpressId: state.addPreview.aliexpressId,
                title: state.addPreview.title,
                url: state.addPreview.url,
                image: (state.addPreview.images && state.addPreview.images[0]) || "",
                images: state.addPreview.images || [],
                originalPrice: state.addPreview.originalPrice,
                currency: state.addPreview.currency,
              },
            }
          : {
              ...( /^\\d{6,20}$/.test(raw) ? { aliexpressId: raw } : { url: raw }),
              force: true,
              sellingPrice: selling,
            };
        const res = await api("/api/products/import", {
          method: "POST",
          body: JSON.stringify(body),
        });
        toast(res.data && res.data.synced ? "تم الرفع إلى Shopify" : "تم الحفظ");
        $("addUrl").value = "";
        $("addSell").value = "";
        state.addPreview = null;
        renderAddPreview(null);
      } catch (e) {
        toast(e.message || "فشل الرفع", true);
      } finally {
        $("addImportBtn").disabled = false;
      }
    }

    $("addPreviewBtn").onclick = previewAddProduct;
    $("addImportBtn").onclick = importAddProduct;
    $("addUrl").addEventListener("keydown", (e) => {
      if (e.key === "Enter") previewAddProduct();
    });

    $("catalogQ").addEventListener("keydown", (e) => { if (e.key === "Enter") loadCatalog(); });

    async function loadLogs() {
      try {
        const res = await api("/api/sync/logs?limit=50");
        const body = $("logsBody");
        body.innerHTML = "";
        (res.data || []).forEach((l) => {
          const tr = document.createElement("tr");
          tr.innerHTML =
            "<td>" + new Date(l.created_at).toLocaleString() + "</td>" +
            "<td>" + escapeHtml(l.action) + "</td>" +
            '<td><span class="status ' + escapeHtml(l.status) + '">' + escapeHtml(l.status) + "</span></td>" +
            "<td>" + escapeHtml(l.error_message || l.aliexpress_id || "") + "</td>";
          body.appendChild(tr);
        });
        if (!(res.data || []).length) {
          body.innerHTML = '<tr><td colspan="4" class="hint">لا سجلات بعد.</td></tr>';
        }
      } catch (e) { toast(e.message || "فشل التحميل", true); }
    }
    $("refreshLogs").onclick = loadLogs;

    renderPresetButtons();
    boot();
  </script>
</body>
</html>`;
}
