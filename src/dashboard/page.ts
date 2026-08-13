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
    .btn-auto-discover {
      background: linear-gradient(135deg, #10231f 0%, #0f8a6a 100%);
      color: #e8ff57; font-weight: 800;
    }
    .auto-discover-banner {
      margin: 0 0 .75rem; padding: .85rem 1rem; border-radius: 14px;
      border: 1px solid rgba(232,255,87,.45);
      background: linear-gradient(120deg, rgba(16,35,31,.94), rgba(15,138,106,.88));
      color: #f7faf7;
    }
    .auto-discover-banner p { margin: .25rem 0 0; font-size: .88rem; opacity: .92; }
    .turbo-head {
      display: flex; flex-wrap: wrap; gap: .6rem; align-items: center; justify-content: space-between;
    }
    .turbo-stats {
      display: flex; flex-wrap: wrap; gap: .45rem; align-items: center; margin-top: .7rem;
      padding-top: .65rem; border-top: 1px solid rgba(255,255,255,.18);
    }
    .turbo-toggle {
      display: inline-flex; align-items: center; gap: .4rem;
      font-size: .86rem; font-weight: 700; cursor: pointer; margin-inline-end: .25rem;
    }
    .turbo-toggle input { width: auto; accent-color: #e8ff57; }
    .turbo-chip {
      display: inline-flex; align-items: center; gap: .25rem;
      padding: .28rem .62rem; border-radius: 999px;
      background: rgba(255,255,255,.14); border: 1px solid rgba(255,255,255,.22);
      font-size: .8rem; font-weight: 600; white-space: nowrap;
    }
    .turbo-chip b { font-size: .95rem; color: #e8ff57; }
    .turbo-chip.accent { background: rgba(232,255,87,.18); border-color: rgba(232,255,87,.35); }
    .turbo-chip.off { opacity: .45; }
    .search-topbar {
      display: flex; gap: .5rem; flex-wrap: wrap; align-items: center;
      position: sticky; top: 0; z-index: 5; padding: .65rem;
      margin: -.3rem -.2rem .75rem; border-radius: 14px;
      background: rgba(255,255,255,.92); border: 1px solid var(--line);
      backdrop-filter: blur(12px); box-shadow: 0 8px 24px rgba(16,35,31,.06);
    }
  .search-topbar #query { flex: 1 1 180px; min-width: 140px; margin: 0; }
  .search-topbar #category { flex: 1 1 200px; min-width: 170px; margin: 0; }
  .search-topbar select { width: auto; min-width: 110px; margin: 0; padding: .65rem .7rem; }
  .search-topbar .btn { white-space: nowrap; padding: .65rem .9rem; }
  .preset-chips { display: flex; gap: .35rem; flex-wrap: wrap; }
  .preset-chip {
    border: 1px solid var(--line); background: #fff; border-radius: 999px;
    padding: .45rem .75rem; font-weight: 700; font-size: .82rem; cursor: pointer;
  }
  .preset-chip:hover, .preset-chip.active { border-color: var(--accent); background: #eef8f4; }
  .preset-chip:disabled { opacity: .55; cursor: wait; }
  #aiStatusHint { margin: 0 0 .5rem; }
  .ai-panel {
    margin: .75rem 0; padding: .75rem; border-radius: 12px;
    border: 1px solid rgba(15,138,106,.25); background: #f3fbf7; font-size: .88rem;
  }
  .ai-panel .score { font-size: 1.4rem; font-weight: 800; color: var(--accent); }
  .ai-panel ul { margin: .35rem 0 0; padding-inline-start: 1.1rem; }
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
    .post-filters {
      margin: .5rem 0 .75rem; padding: .65rem .75rem; border-radius: 12px;
      border: 1px solid var(--line); background: rgba(255,255,255,.9);
    }
    .post-filters.hidden { display: none; }
    .post-filters-row {
      display: flex; gap: .5rem; flex-wrap: wrap; align-items: center;
    }
    .post-filters-row label {
      font-size: .82rem; margin: 0; display: flex; align-items: center; gap: .35rem;
      font-weight: 600;
    }
    .post-filters-row select {
      width: auto; min-width: 150px; padding: .45rem .55rem; font-size: .85rem;
    }
    .post-filters-row .check {
      padding: .35rem .55rem; font-size: .82rem; width: auto;
    }
    .post-filters-row .check input { width: auto; }
      display: flex; gap: .75rem; align-items: flex-start; padding: .75rem;
      border: 1px solid var(--line); border-radius: 14px; background: #fff; margin-bottom: .65rem;
    }
    .fav-card img { width: 72px; height: 72px; object-fit: cover; border-radius: 10px; flex-shrink: 0; }
    .fav-actions { display: flex; gap: .4rem; flex-wrap: wrap; margin-top: .45rem; }
    .fav-actions .btn { padding: .45rem .7rem; font-size: .82rem; }
    .score-badge {
      display: inline-block; font-size: .72rem; font-weight: 700;
      padding: .18rem .45rem; border-radius: 999px; margin-inline-end: .35rem;
      background: rgba(15,138,106,.14); color: var(--accent);
    }
    .fav-edit-modal {
      position: fixed; inset: 0; z-index: 70; background: rgba(16,35,31,.45);
      display: flex; align-items: center; justify-content: center; padding: 1rem;
    }
    .fav-edit-modal.hidden { display: none; }
    .fav-edit-box { width: min(540px, 100%); max-height: 90vh; overflow: auto; }
    .fav-edit-box textarea { min-height: 140px; resize: vertical; line-height: 1.5; }
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
        <div class="auto-discover-banner">
          <div class="turbo-head">
            <div>
              <strong style="font-size:1.05rem">⚡ اكتشاف تلقائي — وضع توربو</strong>
              <p>بحث عميق بكلمات ترندية + منتجات تحل مشاكل + بيانات كاملة للتحليل</p>
            </div>
            <button class="btn btn-auto-discover" id="autoDiscoverBtn" type="button">ابدأ الاكتشاف (3–5 دقائق)</button>
          </div>
          <div class="turbo-stats">
            <label class="turbo-toggle" for="turboDiscover">
              <input id="turboDiscover" type="checkbox" checked />
              <span>تفعيل التوربو</span>
            </label>
            <span class="turbo-chip" id="turboChipKeywords"><b>20</b> كلمة بحث</span>
            <span class="turbo-chip" id="turboChipPages"><b>6</b> صفحات لكل كلمة</span>
            <span class="turbo-chip" id="turboChipTotal">≈ <b>120</b> صفحة إجمالاً</span>
            <span class="turbo-chip accent" id="turboChipFocus">تحل مشاكل ✅</span>
          </div>
        </div>
        <div class="search-topbar">
          <select id="category" title="الفئة — مطلوب للبحث الذكي">${categoryOptions}</select>
          <input id="query" type="search" placeholder="كلمات إضافية داخل الفئة (اختياري)…" />
          <select id="shipToCountry" title="الشحن إلى">
            <option value="SA" selected>🇸🇦 SA</option>
            <option value="AE">🇦🇪 AE</option>
            <option value="EG">🇪🇬 EG</option>
            <option value="US">🇺🇸 US</option>
          </select>
          <select id="locale" title="لغة العناوين">
            <option value="ar" selected>عربي</option>
            <option value="en">EN</option>
          </select>
          <div class="preset-chips" id="presetButtons"></div>
          <button class="btn btn-accent" id="searchBtn" type="button">بحث</button>
        </div>
        <div id="presetTip" class="hidden"></div>
        <p class="hint" id="aiStatusHint">⚡ إبهار المتجر: هل المنتج يثبت الإنسان ويحل مشكلة؟ — مش أرقام مبيعات</p>

        <details class="more" id="advancedFilters">
          <summary>فلاتر متقدمة</summary>
          <div class="filters" style="margin-top:.75rem;margin-bottom:.5rem">
            <label class="check wide"><input id="strictFilters" type="checkbox" /> فلتر صارم (قد يقلّل النتائج)</label>
          </div>

        <div class="filters" id="filters">
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
        </details>

        <p class="hint">نصيحة: اختر الفئة ثم 🥈 متوسط — أو اترك «فلتر صارم» غير مفعّل لنتائج أكثر.</p>
        <div id="searchStatus" class="hint"></div>
        <div id="searchUrlRow" class="hidden" style="margin:.35rem 0">
          <a class="btn btn-ghost" id="openSearchAe" href="#" target="_blank" rel="noopener" style="text-decoration:none;font-size:.85rem">
            فتح رابط البحث على علي إكسبريس (مع الفلاتر)
          </a>
        </div>
        <div id="filterActions" class="hidden" style="margin:.5rem 0;display:flex;gap:.5rem;flex-wrap:wrap">
          <button class="btn btn-ghost" id="showRawBtn" type="button">عرض النتائج بدون فلتر محلي</button>
          <button class="btn btn-ghost hidden" id="showRejectedDiscoverBtn" type="button">عرض المُتجاهَل</button>
          <button class="btn btn-ghost hidden" id="showApprovedDiscoverBtn" type="button">عرض المقبول فقط</button>
          <button class="btn btn-ghost" id="clearLocalFiltersBtn" type="button">مسح الفلاتر المحلية القاسية</button>
        </div>
        <div id="postSearchFilters" class="post-filters hidden">
          <div class="post-filters-row">
            <label>ترتيب
              <select id="postSort">
                <option value="discovery_desc" selected>الأقوى اكتشافًا 🔥</option>
                <option value="default">كما ظهرت</option>
                <option value="price_asc">السعر ↑ (أرخص أولًا)</option>
                <option value="price_desc">السعر ↓ (أغلى أولًا)</option>
                <option value="sold_desc">الأكثر مبيعًا</option>
                <option value="sold_asc">الأقل مبيعًا</option>
                <option value="rating_desc">أعلى تقييم</option>
              </select>
            </label>
            <label>الشحن
              <select id="postShipping">
                <option value="all">الكل</option>
                <option value="free">مجاني فقط</option>
                <option value="paid">مدفوع / غير مجاني</option>
              </select>
            </label>
            <label class="check"><input id="postChoiceOnly" type="checkbox" /> Choice فقط</label>
            <label class="check"><input id="postHighRated" type="checkbox" /> تقييم 4.5+</label>
            <label class="check"><input id="postHideSuspicious" type="checkbox" checked /> إخفاء أرقام مشبوهة</label>
            <label class="check"><input id="postCurrentYear" type="checkbox" /> سنة 2026 فقط</label>
            <button class="btn btn-ghost" id="postFilterReset" type="button">إعادة ضبط</button>
          </div>
          <div id="postFilterStatus" class="hint" style="margin:.35rem 0 0"></div>
        </div>
        <div id="results" class="grid"></div>
      </section>

      <section id="tab-favorites" class="panel hidden">
        <p class="hint">منتجات حفظتها للمراجعة — مرتبة حسب تقييم الذكاء الاصطناعي. عدّل العنوان والوصف قبل الرفع إلى Shopify.</p>
        <div style="display:flex;gap:.55rem;flex-wrap:wrap;margin-bottom:.75rem">
          <button class="btn btn-ghost" id="refreshFavorites" type="button">تحديث المفضلة</button>
        </div>
        <div id="favoritesList"></div>
      </section>

      <div id="favEditModal" class="fav-edit-modal hidden" role="dialog" aria-modal="true">
        <div class="fav-edit-box panel">
          <h3 style="margin:0 0 .75rem;font-family:var(--display)">تعديل قبل الرفع</h3>
          <input id="favEditId" type="hidden" />
          <label for="favEditTitle">العنوان العربي (Shopify)</label>
          <input id="favEditTitle" type="text" />
          <label for="favEditHook" style="margin-top:.65rem">الهوك — مشكلة + حل (مختصر)</label>
          <input id="favEditHook" type="text" placeholder="مثال: تعبك من الفوضى بالسيارة؟ هالقطعة تحلها لك" />
          <label for="favEditDesc" style="margin-top:.65rem">وصف المنتج بالعربي (يُرفع كاملًا على Shopify)</label>
          <textarea id="favEditDesc" placeholder="الوصف الكامل للمنتج…"></textarea>
          <label for="favEditSell" style="margin-top:.65rem">سعر البيع ($)</label>
          <input id="favEditSell" type="number" min="0" step="0.01" placeholder="اتركه فارغًا للهامش التلقائي" />
          <div style="display:flex;gap:.55rem;flex-wrap:wrap;margin-top:.85rem">
            <button class="btn btn-primary" id="favEditSave" type="button">حفظ التعديلات</button>
            <button class="btn btn-ghost" id="favEditCancel" type="button">إلغاء</button>
          </div>
        </div>
      </div>

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

        <hr style="border:none;border-top:1px solid var(--line);margin:1.25rem 0" />

        <h3 style="margin:0 0 .5rem;font-family:var(--display)">ربط AliExpress API</h3>
        <p class="hint" id="aeStatusHint">جاري التحقق من حالة الربط…</p>
        <div id="aeStatusBox" class="hint" style="margin:.5rem 0;padding:.75rem;border:1px solid var(--line);border-radius:12px;background:rgba(255,255,255,.5)"></div>
        <div style="display:flex;gap:.55rem;flex-wrap:wrap;margin:.75rem 0">
          <a class="btn btn-accent" id="aeConnectBtn" href="/api/auth/aliexpress/connect" target="_blank" rel="noopener" style="text-decoration:none">ربط OAuth (محاولة)</a>
          <button class="btn btn-ghost" id="aeRefreshStatusBtn" type="button">تحديث الحالة</button>
          <button class="btn btn-ghost" id="aeTestApiBtn" type="button">اختبار API</button>
        </div>
        <label for="aeAccessToken">أو الصق Access Token يدوياً (من API Testing Tool)</label>
        <textarea id="aeAccessToken" rows="3" placeholder="الصق access_token هنا…" style="width:100%;margin-top:.35rem;font-family:monospace;font-size:.85rem"></textarea>
        <div style="display:flex;gap:.55rem;flex-wrap:wrap;margin-top:.65rem">
          <button class="btn btn-primary" id="aeSaveTokenBtn" type="button">حفظ التوكن</button>
        </div>
        <p class="hint" style="margin-top:.75rem">
          <a href="/api/auth/aliexpress/setup" target="_blank" rel="noopener">صفحة إعداد OAuth (انسخ Callback URL)</a> ·
          <a href="https://openservice.aliexpress.com/app/list" target="_blank" rel="noopener">تطبيقات AliExpress</a> ·
          <a href="https://openservice.aliexpress.com/doc/doc.htm" target="_blank" rel="noopener">التوثيق</a> ·
          <a href="https://ds.aliexpress.com/" target="_blank" rel="noopener">DS Center</a>
        </p>

        <hr style="border:none;border-top:1px solid var(--line);margin:1.25rem 0" />

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
    <div id="dAiPanel" class="ai-panel hidden"></div>
    <button class="btn btn-ghost" id="aiAnalyzeBtn" type="button" style="width:100%;margin-top:.65rem">🤖 حلّل واكتب عنوان سعودي + هوك</button>
    <label for="dSell" style="margin-top:1rem">سعر البيع (اختياري)</label>
    <input id="dSell" type="number" min="0" step="0.01" placeholder="اتركه فارغًا للهامش التلقائي" />
    <label class="check" style="margin-top:.65rem">
      <input id="dAlsoFavorite" type="checkbox" />
      أضف للمفضلة بعد الرفع (يتطلب تحليل 🤖 أولًا)
    </label>
    <div style="display:flex;gap:.55rem;flex-wrap:wrap;margin-top:.8rem">
      <button class="btn btn-accent" id="importBtn" type="button">رفع إلى Shopify</button>
      <button class="btn btn-ghost" id="favoriteBtn" type="button" disabled title="حلّل بالذكاء الاصطناعي أولًا">⭐ حفظ في المفضلة</button>
      <a class="btn btn-ghost" id="openAe" href="#" target="_blank" rel="noopener" style="text-decoration:none;text-align:center">فتح علي إكسبريس</a>
    </div>
    <p class="hint" id="dHint"></p>
  </aside>
  <div class="toast" id="toast"></div>

  <script>
    const PRESETS = ${presetsJson};
    const state = {
      listing: null,
      lastSearch: null,
      addPreview: null,
      lastPreset: null,
      lastAiAnalysis: null,
      resultItems: [],
      discoverApproved: [],
      discoverRejected: [],
    };

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
      if (on) {
        loadAliExpressStatus().catch(() => {});
        const params = new URLSearchParams(location.search);
        if (params.get("aliexpress") === "connected") {
          toast("تم ربط AliExpress بنجاح ✅");
          history.replaceState({}, "", location.pathname);
        }
      }
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
        if (btn.dataset.tab === "settings") loadAliExpressStatus();
      });
    });

    function num(id) {
      const v = $(id).value;
      if (v === "" || v == null) return undefined;
      const n = Number(v);
      return Number.isFinite(n) ? n : undefined;
    }

    function collectFilters() {
      const strict = $("strictFilters").checked;
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
        applyUrlFilters: strict,
        filterMode: strict ? "strict" : "soft",
        discoveryMode: !strict,
        minLaunchYear: strict ? undefined : new Date().getUTCFullYear(),
        fetchPages: strict ? 1 : 2,
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
        btn.className = "preset-chip";
        btn.dataset.grade = p.id;
        btn.textContent = p.emoji + " " + p.labelAr;
        btn.title = p.descAr;
        btn.onclick = () => runSmartSearch(p.id);
        root.appendChild(btn);
      });
    }

    function resolveAiForFavorite(listing, aiAnalysis) {
      if (aiAnalysis?.suggestedTitle?.trim()) return aiAnalysis;
      const stored = listing?.aiAnalyzed;
      if (stored?.suggestedTitle?.trim()) return stored;
      return null;
    }

    function applyAiToListing(listing, a) {
      if (!listing || !a) return listing;
      return {
        ...listing,
        titleEn: listing.titleEn || listing.title,
        aiAnalyzed: a,
        hookAr: a.hookAr || listing.hookAr,
        adCopyAr: a.adCopyAr || listing.adCopyAr,
        descriptionAr: a.descriptionAr || listing.descriptionAr,
        pros: a.pros || listing.pros,
        aiScore: a.score ?? listing.aiScore,
        sellingPrice: a.suggestedSellingPrice ?? listing.sellingPrice,
      };
    }

    function updateFavoriteBtnState() {
      const btn = $("favoriteBtn");
      const ai = resolveAiForFavorite(state.listing, state.lastAiAnalysis);
      const ready = Boolean(ai?.suggestedTitle?.trim());
      btn.disabled = !ready;
      btn.title = ready ? "حفظ بالعنوان السعودي والهوك" : "اضغط 🤖 حلّل أولًا ثم احفظ";
    }

    async function saveFavorite(listing, presetGrade, aiAnalysis) {
      const ai = resolveAiForFavorite(listing, aiAnalysis);
      if (!ai?.suggestedTitle?.trim()) {
        throw new Error("اضغط 🤖 حلّل بالذكاء الاصطناعي أولًا — بعدها يتفعّل زر المفضلة");
      }
      const enriched = {
        ...listing,
        titleEn: listing.titleEn || listing.title,
        title: ai.suggestedTitle.trim(),
        hookAr: ai.hookAr || undefined,
        adCopyAr: ai.adCopyAr || undefined,
        descriptionAr: ai.descriptionAr || undefined,
        pros: ai.pros || undefined,
        aiScore: ai.score,
        sellingPrice: ai.suggestedSellingPrice ?? listing.sellingPrice,
        aiAnalyzed: ai,
      };
      await api("/api/favorites", {
        method: "POST",
        body: JSON.stringify({
          listing: enriched,
          presetGrade: presetGrade || null,
          aiAnalysis: {
            suggestedTitle: ai.suggestedTitle,
            hookAr: ai.hookAr,
            adCopyAr: ai.adCopyAr,
            descriptionAr: ai.descriptionAr,
            pros: ai.pros,
            score: ai.score,
            suggestedSellingPrice: ai.suggestedSellingPrice,
          },
          notes: ai.adCopyAr || ai.hookAr || null,
        }),
      });
    }

    async function runSmartSearch(grade) {
      const category = $("category").value;
      const extraQuery = $("query").value.trim();
      if (!category && extraQuery.length < 2) {
        toast("اختر الفئة أولًا من القائمة 👆", true);
        $("category").focus();
        return;
      }

      document.querySelectorAll(".preset-chip").forEach((b) => { b.disabled = true; });
      const preset = PRESETS.find((p) => p.id === grade);
      const catLabel = $("category").selectedOptions[0]?.textContent || "";
      showPresetTip(preset ? ("💡 " + preset.tipAr) : "");
      $("searchStatus").textContent =
        "جاري البحث الذكي في «" + (catLabel || extraQuery) + "» (" + (preset?.labelAr || grade) + ")…";
      $("filterActions").classList.add("hidden");
      try {
        const res = await api("/api/favorites/smart-search", {
          method: "POST",
          body: JSON.stringify({
            grade,
            category: category || undefined,
            query: extraQuery || undefined,
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
        const via = (data.filtersApplied && data.filtersApplied.categoryLabelAr)
          ? (" · فئة: " + data.filtersApplied.categoryLabelAr)
          : (data.presetLabelAr ? (" · " + data.presetLabelAr) : "");
        $("searchStatus").textContent =
          "نتائج ذكية: " + (data.totalAfterFilter ?? items.length) +
          " بعد الفلتر / " + (data.totalParsed ?? items.length) + " قبل الفلتر" +
          via +
          (data.query ? (" · " + data.query) : "") +
          (data.warning ? (" — " + data.warning) : "");

        if (data.searchUrl) {
          $("searchUrlRow").classList.remove("hidden");
          $("openSearchAe").href = data.searchUrl;
        } else {
          $("searchUrlRow").classList.add("hidden");
        }

        const wiped = (data.totalParsed > 0 && items.length === 0);
        $("filterActions").classList.toggle("hidden", !wiped && !data.warning);
        setSearchResults(items);
        if (!items.length) {
          toast(data.warning || "لا نتائج — جرّب درجة أخف (مبتدئ)", true);
        } else {
          toast("تم العثور على " + items.length + " منتج");
        }
      } catch (e) {
        $("searchStatus").textContent = "";
        toast(e.message || "فشل البحث الذكي", true);
      } finally {
        document.querySelectorAll(".preset-chip").forEach((b) => { b.disabled = false; });
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

    function itemPrice(item) {
      const p = Number(item.originalPrice);
      return Number.isFinite(p) ? p : 0;
    }

    function itemSold(item) {
      if (item.soldCount != null) return Number(item.soldCount) || 0;
      const s = String(item.sold || "");
      const m = s.match(/([\\d,.]+)\\s*([kK])?/);
      if (!m) return 0;
      let n = parseFloat(m[1].replace(/,/g, ""));
      if (!Number.isFinite(n)) return 0;
      if (m[2]) n *= 1000;
      return n;
    }

    function itemIsFreeShipping(item) {
      return item.shippingType === "free" ||
        item.shippingType === "conditional_free" ||
        Boolean(item.isFreeShipping);
    }

    function itemIsSuspicious(item) {
      if (item.suspiciousMetrics != null) return Boolean(item.suspiciousMetrics);
      const sold = item.soldCount ?? 0;
      const reviews = item.reviewCount ?? 0;
      if (sold < 150) return false;
      if (reviews < 3) return sold >= 800;
      return (sold / reviews) > 45;
    }

    function itemDiscoveryScore(item) {
      const wow = Number(item.wowScore);
      if (Number.isFinite(wow) && wow > 0) return wow * 10;
      const final = Number(item.discoverFinalScore);
      if (Number.isFinite(final) && final > 0) return final;
      return Number(item.discoveryScore) || 0;
    }

    function updateDiscoverActionButtons() {
      const rejected = state.discoverRejected || [];
      const approved = state.discoverApproved || [];
      const rejBtn = $("showRejectedDiscoverBtn");
      const appBtn = $("showApprovedDiscoverBtn");
      if (rejected.length) {
        rejBtn.classList.remove("hidden");
        rejBtn.textContent = "عرض المُتجاهَل (" + rejected.length + ")";
      } else {
        rejBtn.classList.add("hidden");
      }
      if (approved.length && (state.resultItems || []).some((i) => i.discoverRejected)) {
        appBtn.classList.remove("hidden");
      } else {
        appBtn.classList.add("hidden");
      }
      $("filterActions").classList.toggle("hidden", !rejected.length && !state.lastSearch?.resultsBeforeFilter);
    }

    function updateTurboChips() {
      const turbo = $("turboDiscover").checked;
      const kw = turbo ? 20 : 15;
      const pages = turbo ? 6 : 3;
      const total = kw * pages;
      $("turboChipKeywords").innerHTML = "<b>" + kw + "</b> كلمة بحث";
      $("turboChipPages").innerHTML = "<b>" + pages + "</b> صفحات لكل كلمة";
      $("turboChipTotal").innerHTML = "≈ <b>" + total + "</b> صفحة إجمالاً";
      $("turboChipFocus").classList.toggle("off", !turbo);
      $("turboChipFocus").textContent = turbo ? "تحل مشاكل ✅" : "بحث عادي";
      $("autoDiscoverBtn").textContent = turbo
        ? "ابدأ الاكتشاف (3–5 دقائق)"
        : "ابدأ الاكتشاف (1–2 دقيقة)";
    }

    async function runAutoDiscover() {
      const category = $("category").value;
      if (!category) {
        toast("اختر الفئة أولًا (مثلاً سيارات واكسسوارات) 👆", true);
        $("category").focus();
        return;
      }

      const btn = $("autoDiscoverBtn");
      btn.disabled = true;
      const catLabel = $("category").selectedOptions[0]?.textContent || category;
      const turbo = $("turboDiscover").checked;
      showPresetTip(
        turbo
          ? "⚡ توربو: 20 كلمة × 6 صفحات — لا تغلق الصفحة (قد يستغرق 3–5 دقائق)"
          : "⚡ جاري البحث في عشرات الكلمات — لا تغلق الصفحة (1–2 دقيقة)",
      );
      $("searchStatus").textContent = "اكتشاف " + (turbo ? "توربو " : "") + "في «" + catLabel + "»…";
      $("filterActions").classList.add("hidden");

      try {
        const res = await api("/api/discover/auto", {
          method: "POST",
          body: JSON.stringify({
            category,
            shipToCountry: $("shipToCountry").value,
            currency: $("currency").value,
            keywordLimit: turbo ? 20 : 15,
            fetchPages: turbo ? 6 : 3,
            turbo,
            requireProblemSolving: turbo,
            minWow: 7,
            maxResults: 12,
          }),
        });
        const data = res.data || {};
        state.lastSearch = data;
        state.lastPreset = "auto-discover";
        const items = data.results || [];

        state.discoverApproved = items;
        state.discoverRejected = data.rejectedResults || [];

        const stats = data.wowStats || data.scoreStats || {};
        const minUsed = data.minWowUsed ?? data.minScoreUsed ?? 7;
        $("searchStatus").textContent =
          (data.turbo ? "توربو · " : "") +
          "إبهار: " + items.length + " منتج يثبت (≥ " + minUsed + "/10) · مُتجاهَل " +
          (state.discoverRejected.length || 0) +
          " · أعلى إبهار " + (stats.maxWow ?? stats.maxScore ?? "—") + "/10" +
          " · متوسط " + (stats.medianWow ?? stats.medianScore ?? "—") +
          " · " + (data.keywordSource === "workers-ai" ? "كلمات AI" : "كلمات احتياطية") +
          " · " + (data.keywordsScanned || 0) + " كلمات × " + (data.pagesPerKeyword || "?") + " صفحات · " +
          (data.totalUnique || 0) + " فريد · " +
          (data.executionTimeSeconds || 0) + " ثانية" +
          (data.warning ? (" — " + data.warning) : "");

        $("searchUrlRow").classList.add("hidden");
        setSearchResults(items);
        updateDiscoverActionButtons();

        if (!items.length && state.discoverRejected.length) {
          toast("لا مقبول — اضغط «عرض المُتجاهَل» لترى أفضل ما تم رفضه", true);
        } else if (!items.length) {
          toast(data.warning || "لا نتائج", true);
        } else {
          toast("⚡ " + items.length + " منتج مقبول");
        }
      } catch (e) {
        $("searchStatus").textContent = "";
        toast(e.message || "فشل الاكتشاف التلقائي", true);
      } finally {
        btn.disabled = false;
      }
    }

    function itemLaunchYear(item) {
      if (item.launchYear) return Number(item.launchYear);
      const d = item.storeLaunchDate || "";
      const m = String(d).match(/\\b(20\\d{2})\\b/);
      return m ? Number(m[1]) : 0;
    }

    function readPostFilterOptions() {
      return {
        sort: $("postSort").value,
        shipping: $("postShipping").value,
        choiceOnly: $("postChoiceOnly").checked,
        highRated: $("postHighRated").checked,
        hideSuspicious: $("postHideSuspicious").checked,
        currentYearOnly: $("postCurrentYear").checked,
      };
    }

    function applyPostFilters() {
      const base = state.resultItems || [];
      const opts = readPostFilterOptions();
      const currentYear = new Date().getUTCFullYear();
      let items = base.slice();

      if (opts.hideSuspicious) items = items.filter((i) => !itemIsSuspicious(i));
      if (opts.currentYearOnly) {
        items = items.filter((i) => itemLaunchYear(i) === currentYear || i.isCurrentYear);
      }
      if (opts.shipping === "free") items = items.filter(itemIsFreeShipping);
      else if (opts.shipping === "paid") items = items.filter((i) => !itemIsFreeShipping(i));

      if (opts.choiceOnly) items = items.filter((i) => i.isChoice);
      if (opts.highRated) items = items.filter((i) => (Number(i.rating) || 0) >= 4.5);

      if (opts.sort === "discovery_desc") {
        items.sort((a, b) => itemDiscoveryScore(b) - itemDiscoveryScore(a));
      } else if (opts.sort === "price_asc") items.sort((a, b) => itemPrice(a) - itemPrice(b));
      else if (opts.sort === "price_desc") items.sort((a, b) => itemPrice(b) - itemPrice(a));
      else if (opts.sort === "sold_desc") items.sort((a, b) => itemSold(b) - itemSold(a));
      else if (opts.sort === "sold_asc") items.sort((a, b) => itemSold(a) - itemSold(b));
      else if (opts.sort === "rating_desc") items.sort((a, b) => (Number(b.rating) || 0) - (Number(a.rating) || 0));

      renderResults(items);
      $("postFilterStatus").textContent =
        "عرض " + items.length + " من " + base.length + " نتيجة (فلترة محلية — صادقة + تميّز)";
    }

    function resetPostFilters() {
      $("postSort").value = "discovery_desc";
      $("postShipping").value = "all";
      $("postChoiceOnly").checked = false;
      $("postHighRated").checked = false;
      $("postHideSuspicious").checked = true;
      $("postCurrentYear").checked = false;
      applyPostFilters();
    }

    function setSearchResults(items) {
      state.resultItems = items || [];
      const bar = $("postSearchFilters");
      if (state.resultItems.length) {
        bar.classList.remove("hidden");
        resetPostFilters();
      } else {
        bar.classList.add("hidden");
        $("postFilterStatus").textContent = "";
        renderResults([]);
      }
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
        const flags = [];
        if (item.discoverRejectReason) {
          flags.push('<span class="badge" style="background:#fee4e2;color:#b42318">⛔ ' + escapeHtml(item.discoverRejectReason) + "</span>");
        }
        if (item.wowScore != null) {
          flags.push('<span class="badge" style="background:#10231f;color:#e8ff57">✨ ' + escapeHtml(String(item.wowScore)) + "/10</span>");
        } else if (item.discoverFinalScore != null) {
          flags.push('<span class="badge" style="background:#10231f;color:#e8ff57">⭐ ' + escapeHtml(String(item.discoverFinalScore)) + "</span>");
        }
        if (item.wowProblemAr) {
          flags.push('<span class="badge" style="background:#eef8f4;color:#0f8a6a">💡 ' + escapeHtml(item.wowProblemAr.slice(0, 48)) + "</span>");
        }
        if (item.wowStopReasonAr) {
          flags.push('<span class="badge" style="background:#e8ff57;color:#10231f">👀 ' + escapeHtml(item.wowStopReasonAr.slice(0, 56)) + "</span>");
        } else if (item.discoveryScore != null && !item.wowScore) {
          flags.push('<span class="badge" style="background:#e8ff57;color:#10231f">🔥 ' + escapeHtml(String(item.discoveryScore)) + "</span>");
        }
        if (item.matchedKeyword) {
          flags.push('<span class="badge">🔎 ' + escapeHtml(item.matchedKeyword) + "</span>");
        }
        if (itemIsSuspicious(item)) {
          flags.push('<span class="badge" style="background:#fee4e2;color:#b42318">⚠️ أرقام مشبوهة</span>');
        }
        if (item.isCurrentYear || itemLaunchYear(item) === new Date().getUTCFullYear()) {
          flags.push('<span class="badge">🆕 ' + new Date().getUTCFullYear() + "</span>");
        }
        if (item.problemSolvingTitle) {
          flags.push('<span class="badge">💡 يحل مشكلة</span>');
        }
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
          '<div class="badges">' + flags.join("") + badgeHtml + "</div>" +
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

        setSearchResults(items);
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
    $("autoDiscoverBtn").onclick = runAutoDiscover;
    $("turboDiscover").onchange = updateTurboChips;
    updateTurboChips();
    $("query").addEventListener("keydown", (e) => { if (e.key === "Enter") runSearch(); });

    $("showRejectedDiscoverBtn").onclick = () => {
      const rejected = state.discoverRejected || [];
      if (!rejected.length) return toast("لا توجد نتائج مُتجاهَلة", true);
      setSearchResults(rejected);
      $("searchStatus").textContent =
        "عرض " + rejected.length + " منتج مُتجاهَل (أعلى score أولًا) — راجع سبب الرفض على كل كارت";
      toast("المُتجاهَل: " + rejected.length + " منتج");
    };

    $("showApprovedDiscoverBtn").onclick = () => {
      const approved = state.discoverApproved || [];
      if (!approved.length) return toast("لا مقبول", true);
      setSearchResults(approved);
      $("searchStatus").textContent = "عرض " + approved.length + " منتج مقبول فقط";
    };

    $("showRawBtn").onclick = () => {
      const raw = (state.lastSearch && state.lastSearch.resultsBeforeFilter) || [];
      if (!raw.length) return toast("لا توجد نتائج خام", true);
      setSearchResults(raw);
      $("searchStatus").textContent =
        "عرض " + raw.length + " نتيجة بدون فلتر محلي (يمكنك الرفع مباشرة)";
      toast("تم عرض النتائج قبل الفلتر المحلي");
    };

    ["postSort", "postShipping"].forEach((id) => {
      $(id).addEventListener("change", () => {
        if ((state.resultItems || []).length) applyPostFilters();
      });
    });
    ["postChoiceOnly", "postHighRated", "postHideSuspicious", "postCurrentYear"].forEach((id) => {
      $(id).addEventListener("change", () => {
        if ((state.resultItems || []).length) applyPostFilters();
      });
    });
    $("postFilterReset").onclick = resetPostFilters;

    $("clearLocalFiltersBtn").onclick = () => {
      ["minSold","maxSold","minRating","minReviews","maxNegativeRate","minDiscountPercent","targetSellingPrice","minMarginPercent","includeKeywords","excludeKeywords"].forEach((id) => {
        $(id).value = "";
      });
      ["freeShipping","choiceOnly","highRatedSellers","unitPrice","requireViralBadge","requireFreeShippingBadge"].forEach((id) => {
        $(id).checked = false;
      });
      toast("تم مسح الفلاتر المحلية — اضغط بحث مرة أخرى");
    };

    async function loadAliExpressStatus() {
      const hint = $("aeStatusHint");
      const box = $("aeStatusBox");
      if (!hint || !box) return;
      try {
        const res = await api("/api/auth/aliexpress/status");
        const d = res.data || {};
        const ok = d.hasAccessToken;
        const keyOk = d.appKeyMatches !== false;
        hint.textContent = !keyOk
          ? "⚠️ AppKey غير مطابق — المفروض " + (d.expectedAppKey || "542618") + " (راجع Cloudflare Variables)"
          : ok
            ? "✅ API الرسمي جاهز — الشحن والتفاصيل تُحمّل تلقائياً عند فتح المنتج"
            : d.configured
              ? "⚠️ AppKey موجود — تحتاج Access Token (OAuth أو لصق يدوي)"
              : "❌ أضف App Secret في Cloudflare Secrets أولاً";
        box.innerHTML =
          "<div><strong>AppKey:</strong> " + escapeHtml(String(d.appKey || "—")) +
          (d.expectedAppKey ? " <span style='opacity:.8'>(المطلوب: " + escapeHtml(d.expectedAppKey) + ")</span>" : "") +
          (!keyOk ? " <span style='color:#ffb4a8'>❌ غير مطابق</span>" : " ✅") + "</div>" +
          "<div><strong>Token:</strong> " + (ok ? "موجود ✅" : "مفقود ❌") + "</div>" +
          (d.tokenExpiresAt ? "<div><strong>ينتهي:</strong> " + escapeHtml(d.tokenExpiresAt) + "</div>" : "") +
          (d.secretLength ? "<div><strong>Secret:</strong> " + escapeHtml(d.secretSource || "—") +
            " · طول " + d.secretLength + " حرف</div>" : "") +
          "<div><strong>Callback:</strong> <code style='font-size:.8rem'>" + escapeHtml(d.callbackUrl || "") + "</code></div>";
      } catch (e) {
        hint.textContent = "تعذّر قراءة حالة AliExpress";
        box.textContent = e.message || "";
      }
    }

    $("aeRefreshStatusBtn").onclick = loadAliExpressStatus;
    $("aeTestApiBtn").onclick = async () => {
      try {
        const res = await fetch("/api/auth/aliexpress/test", {
          credentials: "include",
          headers: { "Content-Type": "application/json" },
        });
        const body = await res.json().catch(() => ({}));
        if (body.data && body.data.valid) {
          toast("✅ API يعمل — التوكن صالح");
        } else if (body.data?.errorKind === "bad_app_secret" || /signature|platform standards/i.test(body.data?.error || "")) {
          toast("❌ App Secret غلط — انسخه من AliExpress Console → Cloudflare Secret", true);
          if (body.data?.hintAr) setTimeout(() => toast(body.data.hintAr, true), 500);
        } else {
          toast("❌ " + (body.data?.error || body.error || "التوكن غير صالح — اعمل OAuth من جديد"), true);
        }
        loadAliExpressStatus();
      } catch (e) {
        toast(e.message || "فشل الاختبار", true);
      }
    };
    $("aeSaveTokenBtn").onclick = async () => {
      const token = ($("aeAccessToken").value || "").trim();
      if (!token) return toast("الصق access token أولاً", true);
      try {
        const res = await api("/api/auth/aliexpress/token", {
          method: "POST",
          body: JSON.stringify({ accessToken: token }),
        });
        $("aeAccessToken").value = "";
        toast((res.data && res.data.message_ar) || "تم حفظ التوكن");
        if (res.data && !res.data.valid && res.data.error) {
          setTimeout(() => toast("تفاصيل: " + res.data.error, true), 400);
        }
        loadAliExpressStatus();
      } catch (e) {
        toast(e.message || "فشل حفظ التوكن", true);
      }
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

    async function enrichDrawerFromApi(item) {
      if (!item || !item.aliexpressId) return;
      try {
        const res = await api("/api/products/profile/" + encodeURIComponent(item.aliexpressId));
        const d = res.data || {};
        const ship = d.shippingToSaudi || d.shipping;
        if (d.sales != null && !item.soldCount) {
          item.soldCount = d.sales;
          $("dSold").textContent = String(d.sales);
        }
        if (d.reviews != null && item.reviewCount == null) {
          item.reviewCount = d.reviews;
          $("dReviews").textContent = String(d.reviews);
        }
        if (d.rating != null && item.rating == null) {
          item.rating = d.rating;
          $("dRating").textContent = "★ " + d.rating;
        }
        if (ship) {
          const days = ship.estimatedDeliveryDays || ship.estimated_delivery_days;
          const cost = ship.amount != null ? ship.amount : ship.cost;
          const cur = ship.currency || "SAR";
          if (days) {
            item.deliveryEstimate = days;
            $("dDelivery").textContent = formatDeliveryText(days);
          }
          if (cost != null) {
            item.shippingCost = cost;
            item.shippingCostCurrency = cur;
            $("dShip").textContent = cost === 0 ? "شحن مجاني" : (cost + " " + cur);
          }
          $("dShipDetail").textContent =
            (ship.serviceName || ship.service_name || "شحن") +
            (days ? " · " + formatDeliveryText(days) : "") +
            " · مصدر: API رسمي ✅";
        }
      } catch (_) {
        /* scraping data كافية بدون token */
      }
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
      $("dHint").textContent = "1) اضغط 🤖 للتحليل  2) ثم ⭐ للمفضلة بالعنوان السعودي · ID: " + item.aliexpressId;
      enrichDrawerFromApi(item);
      state.lastAiAnalysis = null;
      $("dAiPanel").classList.add("hidden");
      $("dAiPanel").innerHTML = "";
      $("drawer").classList.add("open");
      $("backdrop").classList.add("open");
      updateFavoriteBtnState();
    }
    function closeDrawer() {
      $("drawer").classList.remove("open");
      $("backdrop").classList.remove("open");
      state.listing = null;
      state.lastAiAnalysis = null;
      updateFavoriteBtnState();
    }
    $("closeDrawer").onclick = closeDrawer;
    $("backdrop").onclick = closeDrawer;

    $("aiAnalyzeBtn").onclick = async () => {
      if (!state.listing) return;
      $("aiAnalyzeBtn").disabled = true;
      const panel = $("dAiPanel");
      panel.classList.remove("hidden");
      panel.innerHTML = "جاري التحليل بالذكاء الاصطناعي…";
      try {
        const res = await api("/api/ai/analyze", {
          method: "POST",
          body: JSON.stringify({
            listing: state.listing,
            shipToCountry: $("shipToCountry").value,
            targetMarginPercent: num("minMarginPercent") || 40,
          }),
        });
        const a = res.data || {};
        state.lastAiAnalysis = a;
        if (a.listing) {
          state.listing = { ...state.listing, ...a.listing };
          $("dSold").textContent =
            state.listing.sold ||
            (state.listing.soldCount != null ? String(state.listing.soldCount) : "—");
          $("dReviews").textContent =
            state.listing.reviewCount != null ? String(state.listing.reviewCount) : "—";
          $("dRating").textContent =
            state.listing.rating != null ? String(state.listing.rating) : "—";
        }
        state.listing = applyAiToListing(state.listing, a);
        updateFavoriteBtnState();
        const pros = (a.pros || []).map((x) => "<li>✅ " + escapeHtml(x) + "</li>").join("");
        const cons = (a.cons || []).map((x) => "<li>⚠️ " + escapeHtml(x) + "</li>").join("");
        panel.innerHTML =
          '<div class="score">' + escapeHtml(String(a.score || 0)) + '/100 ' +
          (a.approved ? "✅ مناسب" : "⏸ راجع") + "</div>" +
          "<div>" + escapeHtml(a.reason || "") + "</div>" +
          (a.hookAr ? ("<div style='margin-top:.5rem'><b>الهوك:</b> " + escapeHtml(a.hookAr) + "</div>") : "") +
          (a.suggestedTitle ? ("<div style='margin-top:.4rem'><b>عنوان سعودي للمتجر:</b> " + escapeHtml(a.suggestedTitle) + "</div>") : "") +
          (a.descriptionAr ? ("<div style='margin-top:.4rem'><b>وصف Shopify:</b> <div class='sub' style='white-space:pre-wrap;margin-top:.25rem'>" + escapeHtml(a.descriptionAr.replace(/<[^>]+>/g, " ").replace(/\\s+/g, " ").trim()) + "</div></div>") : "") +
          (a.suggestedSellingPrice ? ("<div><b>سعر بيع مقترح:</b> " + money(a.suggestedSellingPrice) + "</div>") : "") +
          (a.adCopyAr ? ("<div style='margin-top:.4rem'><b>نص إعلان:</b> " + escapeHtml(a.adCopyAr) + "</div>") : "") +
          (pros ? ("<ul>" + pros + "</ul>") : "") +
          (cons ? ("<ul>" + cons + "</ul>") : "") +
          '<div class="sub">' + (a.aiEnabled ? "Workers AI — اضغط ⭐ لحفظ العنوان في المفضلة" : "تحليل تلقائي (فعّل Workers AI)") + "</div>";
        if (a.suggestedSellingPrice) $("dSell").value = String(a.suggestedSellingPrice);
        $("dHint").textContent = "تم التحليل ✅ — زر ⭐ المفضلة اتفعّل، اضغطه للحفظ";
        toast("تم التحليل — زر المفضلة جاهز");
      } catch (e) {
        panel.innerHTML = escapeHtml(e.message || "فشل التحليل");
        toast(e.message || "فشل التحليل", true);
      } finally {
        $("aiAnalyzeBtn").disabled = false;
      }
    };

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
          const ai = resolveAiForFavorite(state.listing, state.lastAiAnalysis);
          if (!ai?.suggestedTitle) {
            toast("حلّل بالذكاء الاصطناعي أولًا قبل الإضافة للمفضلة", true);
          } else {
            await saveFavorite(state.listing, state.lastPreset, ai);
          }
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
        await saveFavorite(state.listing, state.lastPreset, state.lastAiAnalysis);
        toast("تم الحفظ في المفضلة بالعنوان السعودي 🇸🇦");
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

    function stripHtml(s) {
      return String(s || "").replace(/<[^>]+>/g, " ").replace(/\\s+/g, " ").trim();
    }

    function openFavoriteEdit(fav) {
      const listing = fav.listing || {};
      $("favEditId").value = fav.id;
      $("favEditTitle").value = fav.title || "";
      $("favEditHook").value = listing.hookAr || "";
      $("favEditDesc").value = listing.descriptionAr
        ? stripHtml(listing.descriptionAr)
        : [listing.hookAr, listing.adCopyAr].filter(Boolean).join("\\n\\n");
      $("favEditSell").value = listing.sellingPrice ? String(listing.sellingPrice) : "";
      $("favEditModal").classList.remove("hidden");
    }

    function closeFavoriteEdit() {
      $("favEditModal").classList.add("hidden");
    }

    $("favEditCancel").onclick = closeFavoriteEdit;
    $("favEditModal").onclick = (e) => {
      if (e.target === $("favEditModal")) closeFavoriteEdit();
    };
    $("favEditSave").onclick = async () => {
      const id = $("favEditId").value;
      if (!id) return;
      $("favEditSave").disabled = true;
      try {
        await api("/api/favorites/" + id, {
          method: "PATCH",
          body: JSON.stringify({
            title: $("favEditTitle").value.trim(),
            hookAr: $("favEditHook").value.trim(),
            descriptionAr: $("favEditDesc").value.trim(),
            sellingPrice: $("favEditSell").value ? Number($("favEditSell").value) : undefined,
          }),
        });
        toast("تم حفظ التعديلات");
        closeFavoriteEdit();
        loadFavorites();
      } catch (e) {
        toast(e.message || "فشل الحفظ", true);
      } finally {
        $("favEditSave").disabled = false;
      }
    };

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
          const score = listing.aiScore != null ? Number(listing.aiScore) : null;
          const hook = listing.hookAr || "";
          const card = document.createElement("div");
          card.className = "fav-card";
          card.innerHTML =
            '<img src="' + escapeHtml(img) + '" alt="" loading="lazy" />' +
            '<div style="flex:1;min-width:0">' +
            (score != null ? ('<span class="score-badge">' + escapeHtml(String(score)) + "/100</span>") : "") +
            "<strong style='display:inline;line-height:1.35'>" + escapeHtml(fav.title) + "</strong>" +
            (hook ? ("<div class='sub' style='margin-top:.25rem;color:var(--accent)'>" + escapeHtml(hook) + "</div>") : "") +
            '<div class="sub">' + money(fav.original_price, fav.currency) +
            (listing.sellingPrice ? (" · بيع " + money(listing.sellingPrice)) : "") +
            " · ID " + escapeHtml(fav.aliexpress_id) + "</div>" +
            '<div class="fav-actions">' +
            '<button class="btn btn-accent fav-import" type="button">رفع Shopify</button>' +
            '<button class="btn btn-ghost fav-edit" type="button">تعديل</button>' +
            '<button class="btn btn-ghost fav-open" type="button">معاينة</button>' +
            '<button class="btn btn-ghost fav-del" type="button">حذف</button>' +
            "</div></div>";
          card.querySelector(".fav-edit").onclick = () => openFavoriteEdit(fav);
          card.querySelector(".fav-open").onclick = () => openDrawer(listing);
          card.querySelector(".fav-import").onclick = async () => {
            try {
              const r = await api("/api/favorites/" + fav.id + "/import", {
                method: "POST",
                body: JSON.stringify({
                  force: true,
                  sellingPrice: listing.sellingPrice || undefined,
                }),
              });
              toast(r.data && r.data.synced ? "تم الرفع على Shopify بالعربي" : "تم الحفظ");
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

    async function loadAiStatus() {
      try {
        const res = await api("/api/ai/status");
        const d = res.data || {};
        $("aiStatusHint").textContent = d.workersAi
          ? "✅ Workers AI — الترجمة السعودية + الهوك عند 🤖 ثم ⭐ المفضلة فقط"
          : "⚠️ Workers AI غير مفعّل — التحليل والترجمة السعودية غير متاحة";
      } catch (_) { /* ignore */ }
    }

    renderPresetButtons();
    loadAiStatus();
    boot();
  </script>
</body>
</html>`;
}
