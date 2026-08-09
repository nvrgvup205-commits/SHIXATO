/** SHIXATO admin dashboard — PIN login + rich AliExpress filters */

import { PRODUCT_CATEGORIES } from "../data/categories";

export function renderDashboardPage(storeDomain: string): string {
  const store = storeDomain.replace(/^https?:\/\//, "").replace(/\/$/, "");
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
    @keyframes rise { from { opacity: 0; transform: translateY(12px);} to { opacity: 1; transform: none;} }
    @keyframes pop { from { opacity: 0; transform: scale(.97);} to { opacity: 1; transform: none;} }
  </style>
</head>
<body>
  <div class="wrap">
    <header class="appbar">
      <h1 class="brand">SHI<span>XATO</span></h1>
      <div class="store-pill">${store}</div>
    </header>

    <section id="gate" class="panel gate">
      <h2 style="margin:0 0 .35rem;font-family:var(--display);letter-spacing:-.03em;">أدخل الرقم السري</h2>
      <p class="hint">اكتب الرقم ثم اضغط دخول — الافتراضي: <strong>1111</strong></p>
      <input id="pin" class="pin-input" type="password" inputmode="numeric" maxlength="12" placeholder="••••" autocomplete="one-time-code" />
      <div style="margin-top:.9rem">
        <button class="btn btn-primary" id="loginBtn" type="button" style="width:100%">دخول وشكراً</button>
      </div>
    </section>

    <section id="app" class="hidden">
      <div class="tabs">
        <button class="tab active" data-tab="search" type="button">بحث المنتجات</button>
        <button class="tab" data-tab="catalog" type="button">منتجاتي</button>
        <button class="tab" data-tab="logs" type="button">سجلات الرفع</button>
        <button class="tab" data-tab="settings" type="button">إعدادات</button>
      </div>

      <section id="tab-search" class="panel">
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
            <label for="includeKeywords">كلمات يجب أن تظهر</label>
            <input id="includeKeywords" placeholder="wireless, bluetooth" />
          </div>
          <div>
            <label for="excludeKeywords">استبعاد كلمات</label>
            <input id="excludeKeywords" placeholder="kids, wholesale lot" />
          </div>

          <label class="check"><input id="freeShipping" type="checkbox" /> شحن مجاني</label>
          <label class="check"><input id="choiceOnly" type="checkbox" /> Choice فقط</label>
          <label class="check"><input id="highRatedSellers" type="checkbox" /> بائعون بتقييم عالي</label>
          <label class="check"><input id="unitPrice" type="checkbox" /> سعر الوحدة</label>
          <label class="check"><input id="requireViralBadge" type="checkbox" /> منتجات فايرل / رائجة</label>
          <label class="check"><input id="requireFreeShippingBadge" type="checkbox" /> شارة شحن مجاني</label>
        </div>

        <p class="hint">أكثر من 20 فلتر: سعر، مبيعات، تقييم، تقييمات سلبية تقديرية، بلد/عملة، Choice، فايرل، هامش ربح…</p>
        <div id="searchStatus" class="hint"></div>
        <div id="results" class="grid"></div>
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
        <p class="hint">لتغيير الرقم السري عيّن Secret اسمه <code>DASHBOARD_PIN</code> في Cloudflare.</p>
        <button class="btn btn-ghost" id="logoutBtn" type="button">خروج</button>
      </section>
    </section>
  </div>

  <div class="drawer-backdrop" id="backdrop"></div>
  <aside class="drawer" id="drawer">
    <button class="btn btn-ghost" id="closeDrawer" type="button">إغلاق</button>
    <img id="dImg" alt="" />
    <h2 id="dTitle"></h2>
    <div class="price" id="dPrice"></div>
    <div class="stats">
      <div class="stat"><b>المبيعات</b><span id="dSold">—</span></div>
      <div class="stat"><b>التقييم</b><span id="dRating">—</span></div>
      <div class="stat"><b>عدد التقييمات</b><span id="dReviews">—</span></div>
      <div class="stat"><b>% سلبية تقديري</b><span id="dNeg">—</span></div>
    </div>
    <div class="badges" id="dBadges"></div>
    <label for="dSell" style="margin-top:1rem">سعر البيع (اختياري)</label>
    <input id="dSell" type="number" min="0" step="0.01" placeholder="اتركه فارغًا للهامش التلقائي" />
    <div style="display:flex;gap:.55rem;flex-wrap:wrap;margin-top:.8rem">
      <button class="btn btn-accent" id="importBtn" type="button">رفع إلى Shopify</button>
      <a class="btn btn-ghost" id="openAe" href="#" target="_blank" rel="noopener" style="text-decoration:none;text-align:center">فتح علي إكسبريس</a>
    </div>
    <p class="hint" id="dHint"></p>
  </aside>
  <div class="toast" id="toast"></div>

  <script>
    const state = { listing: null };

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

    async function boot() {
      try {
        const me = await api("/api/auth/me");
        if (me.data && me.data.authenticated) {
          showApp(true);
          return;
        }
      } catch (_) {}
      showApp(false);
    }

    async function login() {
      const pin = $("pin").value.trim();
      if (!pin) return toast("اكتب الرقم السري", true);
      try {
        await api("/api/auth/login", { method: "POST", body: JSON.stringify({ pin }) });
        showApp(true);
        toast("تم الدخول — ابحث عن منتجاتك");
      } catch (e) {
        toast(e.message || "فشل الدخول", true);
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
        ["search","catalog","logs","settings"].forEach((name) => {
          $("tab-" + name).classList.toggle("hidden", btn.dataset.tab !== name);
        });
        if (btn.dataset.tab === "catalog") loadCatalog();
        if (btn.dataset.tab === "logs") loadLogs();
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
      };
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

    function escapeHtml(s) {
      return String(s || "")
        .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
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
        el.innerHTML =
          '<img src="' + escapeHtml(item.image || "") + '" alt="" loading="lazy" />' +
          '<div class="meta">' +
          "<h3>" + escapeHtml(item.title) + "</h3>" +
          '<div class="price">' + money(item.originalPrice, item.currency) + "</div>" +
          '<div class="sub">' +
            escapeHtml(item.sold || (item.soldCount != null ? (item.soldCount + " sold") : "")) +
            (item.rating != null ? (" · ★ " + item.rating) : "") +
            (item.negativeRateEstimate != null ? (" · سلبي≈" + item.negativeRateEstimate + "%") : "") +
          "</div>" +
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
      try {
        const res = await api("/api/products/search", {
          method: "POST",
          body: JSON.stringify(filters),
        });
        const data = res.data || {};
        const items = data.results || [];
        const via = (data.filtersApplied && data.filtersApplied.categoryLabelAr)
          ? (" · فئة: " + data.filtersApplied.categoryLabelAr)
          : "";
        $("searchStatus").textContent =
          "نتائج: " + (data.totalAfterFilter ?? items.length) +
          " بعد الفلتر / " + (data.totalParsed ?? items.length) + " قبل الفلتر المحلي" +
          " · بحث: " + (data.query || "") + via;
        renderResults(items);
        if (!items.length) toast("لا نتائج مطابقة — خفّف الفلاتر", true);
      } catch (e) {
        $("searchStatus").textContent = "";
        toast(e.message || "فشل البحث", true);
      } finally {
        $("searchBtn").disabled = false;
      }
    }
    $("searchBtn").onclick = runSearch;
    $("query").addEventListener("keydown", (e) => { if (e.key === "Enter") runSearch(); });

    function openDrawer(item) {
      state.listing = item;
      $("dImg").src = item.image || "";
      $("dTitle").textContent = item.title;
      $("dPrice").textContent = money(item.originalPrice, item.currency) +
        (item.listPrice ? (" · كان " + money(item.listPrice, item.currency)) : "") +
        (item.discountPercent != null ? (" · خصم " + item.discountPercent + "%") : "");
      $("dSold").textContent = item.sold || (item.soldCount != null ? String(item.soldCount) : "—");
      $("dRating").textContent = item.rating != null ? ("★ " + item.rating) : "—";
      $("dReviews").textContent = item.reviewCount != null ? String(item.reviewCount) : "—";
      $("dNeg").textContent = item.negativeRateEstimate != null ? (item.negativeRateEstimate + "%") : "—";
      $("dBadges").innerHTML = (item.badges || []).map((b) =>
        '<span class="badge">' + escapeHtml(b) + "</span>"
      ).join("");
      $("dSell").value = "";
      $("openAe").href = item.url || ("https://www.aliexpress.com/item/" + item.aliexpressId + ".html");
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
        toast(res.data && res.data.synced ? "تم الرفع إلى Shopify" : "تم الحفظ بدون مزامنة كاملة");
        closeDrawer();
      } catch (e) {
        toast(e.message || "فشل الرفع", true);
      } finally {
        $("importBtn").disabled = false;
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
            '<td><a href="https://www.aliexpress.com/item/' + p.aliexpress_id + '.html" target="_blank" rel="noopener">' +
            p.aliexpress_id + "</a></td>";
          body.appendChild(tr);
        });
        if (!(res.data || []).length) {
          body.innerHTML = '<tr><td colspan="4" class="hint">لا منتجات بعد.</td></tr>';
        }
      } catch (e) { toast(e.message || "فشل التحميل", true); }
    }
    $("refreshCatalog").onclick = loadCatalog;
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

    boot();
  </script>
</body>
</html>`;
}
