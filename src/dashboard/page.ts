/** SHIXATO admin dashboard — single HTML document served by the Worker */

export function renderDashboardPage(storeDomain: string): string {
  const store = storeDomain.replace(/^https?:\/\//, "").replace(/\/$/, "");
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
      --paper: #f3f6f2;
      --panel: rgba(255,255,255,0.72);
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
      font-family: var(--font);
      color: var(--ink);
      background:
        radial-gradient(1200px 600px at 10% -10%, rgba(232,255,87,0.45), transparent 55%),
        radial-gradient(900px 500px at 100% 0%, rgba(15,138,106,0.22), transparent 50%),
        linear-gradient(165deg, #eef5ef 0%, #f7faf7 40%, #e7f0ea 100%);
      background-attachment: fixed;
    }
    body::before {
      content: "";
      position: fixed; inset: 0; pointer-events: none; opacity: 0.35;
      background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.45'/%3E%3C/svg%3E");
      mix-blend-mode: soft-light;
    }
    .wrap { width: min(1180px, calc(100% - 2rem)); margin: 0 auto; padding: 1.25rem 0 3rem; position: relative; }
    header.appbar {
      display: flex; align-items: center; justify-content: space-between; gap: 1rem;
      margin-bottom: 1.5rem; animation: rise 0.6s ease both;
    }
    .brand {
      font-family: var(--display); font-weight: 800; font-size: clamp(1.8rem, 4vw, 2.6rem);
      letter-spacing: -0.04em; line-height: 0.95; margin: 0;
    }
    .brand span { color: var(--accent); }
    .store-pill {
      font-size: 0.85rem; color: var(--muted); border: 1px solid var(--line);
      background: var(--panel); backdrop-filter: blur(10px);
      padding: 0.55rem 0.85rem; border-radius: 999px;
    }
    .panel {
      background: var(--panel); border: 1px solid var(--line); border-radius: var(--radius);
      box-shadow: var(--shadow); backdrop-filter: blur(14px);
      padding: 1.1rem 1.2rem; animation: rise 0.7s ease both;
    }
    .panel + .panel { margin-top: 1rem; }
    .gate { max-width: 460px; margin: 12vh auto; }
    label { display: block; font-size: 0.92rem; font-weight: 600; margin-bottom: 0.4rem; }
    input, select, button, textarea {
      font: inherit; border-radius: 12px; border: 1px solid var(--line); background: #fff;
    }
    input, select, textarea {
      width: 100%; padding: 0.85rem 0.95rem; color: var(--ink);
      outline: none; transition: border-color .2s, box-shadow .2s;
    }
    input:focus, select:focus, textarea:focus {
      border-color: var(--accent); box-shadow: 0 0 0 3px rgba(15,138,106,0.15);
    }
    .row { display: flex; gap: 0.65rem; flex-wrap: wrap; align-items: stretch; }
    .row > * { flex: 1 1 180px; }
    .btn {
      appearance: none; border: none; cursor: pointer; font-weight: 700;
      padding: 0.85rem 1.1rem; border-radius: 12px; transition: transform .15s ease, opacity .15s;
    }
    .btn:active { transform: translateY(1px) scale(0.99); }
    .btn:disabled { opacity: 0.55; cursor: wait; }
    .btn-primary { background: var(--ink); color: #fff; }
    .btn-accent { background: var(--accent); color: #fff; }
    .btn-ghost { background: transparent; border: 1px solid var(--line); color: var(--ink); }
    .tabs { display: flex; gap: 0.4rem; margin-bottom: 1rem; flex-wrap: wrap; }
    .tab {
      border: 1px solid var(--line); background: rgba(255,255,255,0.5);
      padding: 0.55rem 0.9rem; border-radius: 999px; cursor: pointer; font-weight: 600;
    }
    .tab.active { background: var(--ink); color: #fff; border-color: var(--ink); }
    .hint { color: var(--muted); font-size: 0.9rem; margin: 0.35rem 0 0.9rem; }
    .grid {
      display: grid; grid-template-columns: repeat(auto-fill, minmax(210px, 1fr));
      gap: 0.9rem; margin-top: 1rem;
    }
    .product {
      border: 1px solid var(--line); border-radius: 16px; background: #fff;
      overflow: hidden; cursor: pointer; text-align: start;
      transition: transform .2s ease, box-shadow .2s ease; animation: pop 0.45s ease both;
    }
    .product:hover { transform: translateY(-3px); box-shadow: var(--shadow); }
    .product img {
      width: 100%; aspect-ratio: 1; object-fit: cover; display: block; background: #e8eee9;
    }
    .product .meta { padding: 0.75rem 0.8rem 0.9rem; }
    .product h3 {
      margin: 0 0 0.35rem; font-size: 0.92rem; line-height: 1.35;
      display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;
    }
    .price { font-weight: 700; color: var(--accent); }
    .sub { font-size: 0.8rem; color: var(--muted); margin-top: 0.2rem; }
    .toast {
      position: fixed; bottom: 1rem; left: 50%; transform: translateX(-50%) translateY(120%);
      background: var(--ink); color: #fff; padding: 0.75rem 1rem; border-radius: 999px;
      z-index: 50; transition: transform .25s ease; max-width: min(92vw, 520px);
      text-align: center; font-size: 0.92rem;
    }
    .toast.show { transform: translateX(-50%) translateY(0); }
    .toast.err { background: var(--danger); }
    .hidden { display: none !important; }
    table { width: 100%; border-collapse: collapse; font-size: 0.9rem; }
    th, td { text-align: start; padding: 0.65rem 0.4rem; border-bottom: 1px solid var(--line); vertical-align: top; }
    th { color: var(--muted); font-weight: 600; }
    .status {
      display: inline-block; padding: 0.15rem 0.5rem; border-radius: 999px;
      font-size: 0.75rem; font-weight: 700; background: #eef2ef;
    }
    .status.synced { background: #dcfae6; color: var(--ok); }
    .status.failed, .status.filtered_out { background: #fee4e2; color: var(--danger); }
    .drawer-backdrop {
      position: fixed; inset: 0; background: rgba(16,35,31,0.35); z-index: 40;
      opacity: 0; pointer-events: none; transition: opacity .2s;
    }
    .drawer-backdrop.open { opacity: 1; pointer-events: auto; }
    .drawer {
      position: fixed; top: 0; bottom: 0; left: 0; width: min(420px, 100%);
      background: #fff; z-index: 41; transform: translateX(-105%);
      transition: transform .28s cubic-bezier(.2,.8,.2,1);
      padding: 1.2rem; overflow: auto; box-shadow: var(--shadow);
    }
    .drawer.open { transform: translateX(0); }
    .drawer img { width: 100%; border-radius: 14px; aspect-ratio: 1; object-fit: cover; background: #e8eee9; }
    .drawer h2 { font-family: var(--display); font-size: 1.35rem; margin: 0.8rem 0 0.4rem; letter-spacing: -0.03em; }
    @keyframes rise { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: none; } }
    @keyframes pop { from { opacity: 0; transform: scale(0.97); } to { opacity: 1; transform: none; } }
    @media (max-width: 640px) {
      .drawer { left: 0; right: 0; width: 100%; }
    }
  </style>
</head>
<body>
  <div class="wrap">
    <header class="appbar">
      <h1 class="brand">SHI<span>XATO</span></h1>
      <div class="store-pill" id="storePill">${store}</div>
    </header>

    <section id="gate" class="panel gate">
      <h2 style="margin:0 0 .4rem;font-family:var(--display);letter-spacing:-.03em;">دخول لوحة التحكم</h2>
      <p class="hint">الصق <strong>API_KEY</strong> الذي عيّنته في Cloudflare. يُحفظ محليًا في متصفحك فقط.</p>
      <label for="apiKey">API_KEY</label>
      <input id="apiKey" type="password" placeholder="الصق المفتاح هنا" autocomplete="off" />
      <div class="row" style="margin-top:.8rem">
        <button class="btn btn-primary" id="saveKeyBtn" type="button">دخول</button>
      </div>
    </section>

    <section id="app" class="hidden">
      <div class="tabs" role="tablist">
        <button class="tab active" data-tab="search" type="button">بحث علي إكسبريس</button>
        <button class="tab" data-tab="catalog" type="button">منتجاتي</button>
        <button class="tab" data-tab="logs" type="button">سجلات الرفع</button>
        <button class="tab" data-tab="settings" type="button">الإعدادات</button>
      </div>

      <section id="tab-search" class="panel">
        <label for="query">ابحث عن منتجات</label>
        <div class="row">
          <input id="query" type="search" placeholder="مثال: phone case, earbuds, watch..." />
          <button class="btn btn-accent" id="searchBtn" type="button" style="flex:0 0 auto">بحث</button>
        </div>
        <p class="hint">اكتب كلمة بحث واضغط بحث، ثم اختر منتجًا لمعاينته ورفعه إلى Shopify.</p>
        <div id="searchStatus" class="hint"></div>
        <div id="results" class="grid"></div>
      </section>

      <section id="tab-catalog" class="panel hidden">
        <div class="row">
          <input id="catalogQ" type="search" placeholder="فلترة بالعربية/الإنجليزية أو رقم المنتج..." />
          <button class="btn btn-ghost" id="refreshCatalog" type="button" style="flex:0 0 auto">تحديث</button>
        </div>
        <div style="overflow:auto;margin-top:1rem">
          <table>
            <thead>
              <tr><th>المنتج</th><th>السعر</th><th>الحالة</th><th>AliExpress</th></tr>
            </thead>
            <tbody id="catalogBody"></tbody>
          </table>
        </div>
      </section>

      <section id="tab-logs" class="panel hidden">
        <button class="btn btn-ghost" id="refreshLogs" type="button">تحديث السجلات</button>
        <div style="overflow:auto;margin-top:1rem">
          <table>
            <thead>
              <tr><th>الوقت</th><th>الإجراء</th><th>الحالة</th><th>التفاصيل</th></tr>
            </thead>
            <tbody id="logsBody"></tbody>
          </table>
        </div>
      </section>

      <section id="tab-settings" class="panel hidden">
        <p class="hint">المتجر المرتبط: <strong>${store}</strong></p>
        <button class="btn btn-ghost" id="logoutBtn" type="button">مسح المفتاح والخروج</button>
      </section>
    </section>
  </div>

  <div class="drawer-backdrop" id="backdrop"></div>
  <aside class="drawer" id="drawer" aria-live="polite">
    <button class="btn btn-ghost" id="closeDrawer" type="button">إغلاق</button>
    <img id="dImg" alt="" />
    <h2 id="dTitle"></h2>
    <div class="price" id="dPrice"></div>
    <div class="sub" id="dMeta"></div>
    <label for="dSell" style="margin-top:1rem">سعر البيع (اختياري)</label>
    <input id="dSell" type="number" min="0" step="0.01" placeholder="اتركه فارغًا لاستخدام الهامش التلقائي" />
    <div class="row" style="margin-top:.8rem">
      <button class="btn btn-accent" id="importBtn" type="button">رفع إلى Shopify</button>
      <a class="btn btn-ghost" id="openAe" href="#" target="_blank" rel="noopener" style="text-align:center;text-decoration:none">فتح في علي إكسبريس</a>
    </div>
    <p class="hint" id="dHint"></p>
  </aside>

  <div class="toast" id="toast"></div>

  <script>
    const KEY = "shixato_api_key";
    const state = { listing: null, results: [] };

    const $ = (id) => document.getElementById(id);
    const toast = (msg, err=false) => {
      const el = $("toast");
      el.textContent = msg;
      el.classList.toggle("err", !!err);
      el.classList.add("show");
      setTimeout(() => el.classList.remove("show"), 3200);
    };

    function getKey() { return localStorage.getItem(KEY) || ""; }
    function setKey(v) { localStorage.setItem(KEY, v); }

    async function api(path, options = {}) {
      const headers = Object.assign({ "Content-Type": "application/json" }, options.headers || {});
      headers.Authorization = "Bearer " + getKey();
      const res = await fetch(path, { ...options, headers });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || body.ok === false) {
        throw new Error(body.error || ("HTTP " + res.status));
      }
      return body;
    }

    function showApp(show) {
      $("gate").classList.toggle("hidden", show);
      $("app").classList.toggle("hidden", !show);
    }

    async function boot() {
      if (!getKey()) { showApp(false); return; }
      $("apiKey").value = getKey();
      try {
        await api("/api/products?limit=1");
        showApp(true);
      } catch (e) {
        showApp(false);
        toast("المفتاح غير صحيح أو الـ Worker غير جاهز", true);
      }
    }

    $("saveKeyBtn").onclick = async () => {
      const v = $("apiKey").value.trim();
      if (!v) return toast("أدخل API_KEY", true);
      setKey(v);
      await boot();
      if (!$("app").classList.contains("hidden")) toast("تم الدخول");
    };

    $("logoutBtn").onclick = () => {
      localStorage.removeItem(KEY);
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

    function money(n, c="USD") {
      const num = Number(n);
      if (!Number.isFinite(num)) return "—";
      return new Intl.NumberFormat("en-US", { style: "currency", currency: c || "USD" }).format(num);
    }

    function renderResults(items) {
      const root = $("results");
      root.innerHTML = "";
      items.forEach((item, idx) => {
        const el = document.createElement("article");
        el.className = "product";
        el.style.animationDelay = (idx * 0.03) + "s";
        el.innerHTML = \`
          <img src="\${item.image || ''}" alt="" loading="lazy" />
          <div class="meta">
            <h3>\${escapeHtml(item.title)}</h3>
            <div class="price">\${money(item.originalPrice, item.currency)}</div>
            <div class="sub">\${escapeHtml(item.sold || '')} \${item.rating ? "★ " + item.rating : ""}</div>
          </div>\`;
        el.onclick = () => openDrawer(item);
        root.appendChild(el);
      });
    }

    function escapeHtml(s) {
      return String(s || "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
    }

    async function runSearch() {
      const query = $("query").value.trim();
      if (query.length < 2) return toast("اكتب كلمة بحث أطول", true);
      $("searchBtn").disabled = true;
      $("searchStatus").textContent = "جاري البحث في علي إكسبريس...";
      try {
        const res = await api("/api/products/search", {
          method: "POST",
          body: JSON.stringify({ query, page: 1 }),
        });
        state.results = res.data.results || [];
        $("searchStatus").textContent = state.results.length
          ? ("عثرنا على " + state.results.length + " منتجًا")
          : "لا نتائج — جرّب كلمات إنجليزية أوضح";
        renderResults(state.results);
      } catch (e) {
        $("searchStatus").textContent = "";
        toast(e.message || "فشل البحث", true);
      } finally {
        $("searchBtn").disabled = false;
      }
    }

    $("searchBtn").onclick = runSearch;
    $("query").addEventListener("keydown", (e) => {
      if (e.key === "Enter") runSearch();
    });

    function openDrawer(item) {
      state.listing = item;
      $("dImg").src = item.image || "";
      $("dTitle").textContent = item.title;
      $("dPrice").textContent = money(item.originalPrice, item.currency);
      $("dMeta").textContent = (item.sold || "") + (item.rating ? " · ★ " + item.rating : "") + " · #" + item.aliexpressId;
      $("dSell").value = "";
      $("openAe").href = item.url || ("https://www.aliexpress.com/item/" + item.aliexpressId + ".html");
      $("dHint").textContent = "الرفع يستخدم بيانات بطاقة البحث (موثوق أكثر من صفحة المنتج المحجوبة).";
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
        const synced = res.data && res.data.synced;
        toast(synced ? "تم الرفع إلى Shopify بنجاح" : "تم الحفظ لكن لم يُرفع (فلتر/خطأ)");
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
          const img = (p.images && p.images[0]) ? \`<img src="\${p.images[0]}" alt="" style="width:42px;height:42px;object-fit:cover;border-radius:8px;vertical-align:middle;margin-inline-end:8px" />\` : "";
          tr.innerHTML = \`
            <td>\${img}<strong>\${escapeHtml(p.title)}</strong></td>
            <td>\${money(p.selling_price)}</td>
            <td><span class="status \${p.status}">\${p.status}</span></td>
            <td><a href="https://www.aliexpress.com/item/\${p.aliexpress_id}.html" target="_blank" rel="noopener">\${p.aliexpress_id}</a></td>\`;
          body.appendChild(tr);
        });
        if (!(res.data || []).length) {
          body.innerHTML = '<tr><td colspan="4" class="hint">لا منتجات بعد — ابحث وارفع من تبويب البحث.</td></tr>';
        }
      } catch (e) {
        toast(e.message || "فشل تحميل المنتجات", true);
      }
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
          tr.innerHTML = \`
            <td>\${new Date(l.created_at).toLocaleString()}</td>
            <td>\${escapeHtml(l.action)}</td>
            <td><span class="status \${l.status}">\${l.status}</span></td>
            <td>\${escapeHtml(l.error_message || l.aliexpress_id || "")}</td>\`;
          body.appendChild(tr);
        });
        if (!(res.data || []).length) {
          body.innerHTML = '<tr><td colspan="4" class="hint">لا سجلات بعد.</td></tr>';
        }
      } catch (e) {
        toast(e.message || "فشل تحميل السجلات", true);
      }
    }
    $("refreshLogs").onclick = loadLogs;

    boot();
  </script>
</body>
</html>`;
}
