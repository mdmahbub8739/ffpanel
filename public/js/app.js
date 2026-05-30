const FF = {
  cfg: {},
  user: null,
  async api(path, opts = {}) {
    const res = await fetch("/api" + path, {
      method: opts.method || "GET",
      headers: opts.body ? { "Content-Type": "application/json" } : {},
      body: opts.body ? JSON.stringify(opts.body) : undefined,
      credentials: "same-origin",
    });
    let data = {};
    try { data = await res.json(); } catch {}
    if (!res.ok) throw Object.assign(new Error(data.error || "Request failed"), { status: res.status, data });
    return data;
  },
  toast(msg, err) {
    let t = document.querySelector(".toast");
    if (!t) { t = document.createElement("div"); t.className = "toast"; document.body.appendChild(t); }
    t.textContent = msg;
    t.classList.toggle("err", !!err);
    t.classList.add("show");
    clearTimeout(this._tt);
    this._tt = setTimeout(() => t.classList.remove("show"), 2600);
  },
  money(n) { return "৳" + Number(n || 0).toLocaleString("en-US"); },
  esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); },
  async loadConfig() {
    try { const d = await this.api("/config"); this.cfg = d.settings || {}; this.applyTheme(); } catch {}
  },
  applyTheme() {
    if (this.cfg.primary_color) document.documentElement.style.setProperty("--green", this.cfg.primary_color);
    if (this.cfg.accent_color) document.documentElement.style.setProperty("--ink", this.cfg.accent_color);
    document.querySelectorAll("[data-brand]").forEach((el) => (el.textContent = this.cfg.logo_text || this.cfg.site_name || "PANELSELL"));
    document.querySelectorAll("[data-footer]").forEach((el) => (el.textContent = this.cfg.footer_text || ""));
    if (this.cfg.site_name) document.title = this.cfg.site_name;
  },
  async loadUser() {
    try { const d = await this.api("/auth/me"); this.user = d.user; this._me = d; return d; } catch { this.user = null; return null; }
  },
  requireAuth(redirect = "login.html") {
    if (!this.user) { location.href = redirect + "?next=" + encodeURIComponent(location.pathname); return false; }
    return true;
  },
  async logout() { await this.api("/auth/logout", { method: "POST" }); location.href = "index.html"; },
  param(k) { return new URLSearchParams(location.search).get(k); },
};

function navBar(active) {
  const items = [
    ["index.html", "Home", '<path d="M3 11l9-8 9 8M5 10v10h14V10"/>'],
    ["addfund.html", "Add Fund", '<path d="M12 4v16M4 12h16"/><circle cx="12" cy="12" r="9"/>'],
    ["orders.html", "My Orders", '<path d="M6 2h9l5 5v15H6zM15 2v5h5"/>'],
    ["keys.html", "My Key", '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M7 9h10M7 13h6"/>'],
    ["account.html", "Account", '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 4-6 8-6s8 2 8 6"/>'],
  ];
  return `<nav class="bottomnav">${items.map(([h, l, p]) =>
    `<a href="${h}" class="${active === h ? "active" : ""}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${p}</svg>${l}</a>`
  ).join("")}</nav>`;
}

function topBar() {
  return `<header class="topbar">
    <button class="iconbtn" onclick="location.href='index.html'" aria-label="Home">
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 11l9-8 9 8M5 10v10h14V10"/></svg>
    </button>
    <div class="brand-pill" data-brand>PANELSELL</div>
    <button class="iconbtn" onclick="FF.user?location.href='account.html':location.href='login.html'" aria-label="Account">
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 4-6 8-6s8 2 8 6"/></svg>
    </button>
  </header>`;
}

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => navigator.serviceWorker.register("/sw.js").catch(() => {}));
}
