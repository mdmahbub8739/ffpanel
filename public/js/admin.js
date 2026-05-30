const A = {
  panelName: "FF panel sale official",
  section: "dashboard",
  async req(path, method, body) { return FF.api("/admin" + path, { method: method || "GET", body }); },
  modal(html) { document.getElementById("modalBody").innerHTML = html; document.getElementById("modal").classList.add("open"); },
  close() { document.getElementById("modal").classList.remove("open"); },
};
document.getElementById("modal").onclick = (e) => { if (e.target.id === "modal") A.close(); };

async function init() {
  await FF.loadConfig();
  A.panelName = FF.cfg.admin_panel_name || A.panelName;
  document.title = A.panelName;
  const me = await FF.loadUser();
  if (!me || !me.user || me.user.role !== "admin") return loginScreen();
  shell();
}

function loginScreen() {
  document.getElementById("app").innerHTML = `
  <div class="wrap" style="max-width:400px;margin-top:60px">
    <div class="card">
      <h2 style="justify-content:center;color:var(--green);margin-bottom:6px">${FF.esc(A.panelName)}</h2>
      <p class="muted" style="text-align:center;margin-bottom:16px">Admin Access</p>
      <div class="field"><label>Email</label><input class="input" id="e" type="email"></div>
      <div class="field"><label>Password</label><input class="input" id="p" type="password"></div>
      <button class="btn btn-green btn-block" id="go">SIGN IN</button>
      <p class="muted" style="text-align:center;margin-top:12px"><a href="setup.html" style="color:var(--green)">First time setup</a></p>
    </div>
  </div>`;
  document.getElementById("go").onclick = async function () {
    this.disabled = true;
    try {
      const r = await FF.api("/auth/login", { method: "POST", body: { email: e.value.trim(), password: p.value } });
      if (r.user.role !== "admin") { FF.toast("Not an admin account", true); this.disabled = false; return; }
      location.reload();
    } catch (err) { FF.toast(err.message, true); this.disabled = false; }
  };
}

function shell() {
  const links = [["dashboard", "📊 Dashboard"], ["products", "📦 Products"], ["orders", "🧾 Orders"], ["users", "👤 Users"], ["promos", "🏷️ Promos"], ["categories", "🗂️ Categories"], ["settings", "⚙️ Settings"]];
  document.getElementById("app").innerHTML = `
  <div class="admin-shell">
    <aside class="admin-side" id="side">
      <div class="logo">${FF.esc(A.panelName)}</div>
      ${links.map(([k, l]) => `<a data-sec="${k}">${l}</a>`).join("")}
      <a id="viewSite">🌐 View Store</a>
      <a id="logout" style="color:#ff7a7a">⏻ Logout</a>
    </aside>
    <main class="admin-main"><div id="view"><div class="spinner"></div></div></main>
  </div>`;
  document.querySelectorAll("[data-sec]").forEach(a => a.onclick = () => go(a.dataset.sec));
  document.getElementById("viewSite").onclick = () => location.href = "index.html";
  document.getElementById("logout").onclick = () => FF.logout();
  go("dashboard");
}

function go(sec) {
  A.section = sec;
  document.querySelectorAll("[data-sec]").forEach(a => a.classList.toggle("active", a.dataset.sec === sec));
  ({ dashboard, products, orders, users, promos, categories, settings }[sec])();
}
const view = (h) => (document.getElementById("view").innerHTML = h);

async function dashboard() {
  const s = await A.req("/stats");
  view(`<h1>Dashboard</h1>
  <div class="adstat">
    ${stat("Users", s.users)}${stat("Orders", s.orders)}${stat("Revenue", FF.money(s.revenue))}
    ${stat("Pending", s.pending)}${stat("Products", s.products)}${stat("Wallet Liability", FF.money(s.total_balance))}
  </div>
  <h1 style="font-size:18px">Recent Orders</h1>
  <table class="table"><tr><th>Serial</th><th>Product</th><th>Amount</th><th>Status</th><th>Date</th></tr>
  ${(s.recent || []).map(o => `<tr><td>${o.serial}</td><td>${FF.esc(o.product_name)}</td><td>${FF.money(o.amount)}</td><td><span class="badge b-${o.status}">${o.status}</span></td><td>${new Date(o.created_at).toLocaleString()}</td></tr>`).join("") || '<tr><td colspan="5">No orders</td></tr>'}</table>`);
}
const stat = (l, n) => `<div class="stat"><div class="n">${n}</div><div class="l">${l}</div></div>`;

async function products() {
  const [d, cats] = await Promise.all([A.req("/products"), A.req("/categories")]);
  A._cats = cats.categories;
  view(`<h1>Products</h1><div class="toolbar"><button class="btn btn-green" style="width:auto;padding:10px 18px" id="add">+ New Product</button></div>
  <table class="table"><tr><th>Name</th><th>Category</th><th>Packages</th><th>Active</th><th></th></tr>
  ${d.products.map(p => `<tr>
    <td>${FF.esc(p.name)}</td><td>${FF.esc(p.category_name || "—")}</td><td>${p.pkg_count}</td>
    <td>${p.active ? "✅" : "⛔"}</td>
    <td><button class="btn btn-ghost btn-sm" style="width:auto" onclick="editProduct(${p.id})">Edit</button>
    <button class="btn btn-purple btn-sm" style="width:auto" onclick="managePkg(${p.id},'${FF.esc(p.name).replace(/'/g,"")}')">Packages</button>
    <button class="btn btn-red btn-sm" style="width:auto" onclick="delProduct(${p.id})">Del</button></td></tr>`).join("") || '<tr><td colspan="5">No products. Add one.</td></tr>'}</table>`);
  document.getElementById("add").onclick = () => editProduct(null);
  A._products = d.products;
}
function productForm(p) {
  p = p || {};
  return `<h2>${p.id ? "Edit" : "New"} Product</h2>
  <div class="field"><label>Name</label><input class="input" id="f_name" value="${FF.esc(p.name || "")}"></div>
  <div class="field"><label>Category</label><select id="f_cat"><option value="">—</option>${A._cats.map(c => `<option value="${c.id}" ${p.category_id == c.id ? "selected" : ""}>${FF.esc(c.name)}</option>`).join("")}</select></div>
  <div class="field"><label>Image URL</label><input class="input" id="f_img" value="${FF.esc(p.image_url || "")}"></div>
  <div class="field"><label>Type</label><input class="input" id="f_type" value="${FF.esc(p.type || "Game / Voucher")}"></div>
  <div class="field"><label>Demo URL</label><input class="input" id="f_demo" value="${FF.esc(p.demo_url || "")}"></div>
  <div class="field"><label>Description</label><textarea id="f_desc" rows="2">${FF.esc(p.description || "")}</textarea></div>
  <div class="field"><label>Rules & Conditions</label><textarea id="f_rules" rows="3">${FF.esc(p.rules || "")}</textarea></div>
  <div class="row"><label><input type="checkbox" id="f_active" ${p.active !== 0 ? "checked" : ""}> Active</label>
  <input class="input" id="f_sort" type="number" value="${p.sort_order || 0}" style="width:90px" placeholder="sort"></div>
  <button class="btn btn-green btn-block" style="margin-top:14px" id="save">Save</button>`;
}
function editProduct(id) {
  const p = id ? A._products.find(x => x.id === id) : null;
  A.modal(productForm(p));
  document.getElementById("save").onclick = async () => {
    const body = { name: f_name.value, category_id: f_cat.value || null, image_url: f_img.value, type: f_type.value, demo_url: f_demo.value, description: f_desc.value, rules: f_rules.value, active: f_active.checked, sort_order: +f_sort.value };
    try { await A.req(id ? "/products/" + id : "/products", id ? "PUT" : "POST", body); A.close(); FF.toast("Saved"); products(); }
    catch (e) { FF.toast(e.message, true); }
  };
}
async function delProduct(id) { if (!confirm("Delete product and all its packages?")) return; await A.req("/products/" + id, "DELETE"); FF.toast("Deleted"); products(); }

async function managePkg(pid, pname) {
  renderPkgModal(pid, pname, await loadPkgs(pid));
}
async function loadPkgs(pid) {
  const res = await fetch("/api/admin/packages?product_id=" + pid, { credentials: "same-origin" });
  return (await res.json()).packages || [];
}
async function postPkg(method, path, body) {
  return FF.api("/admin/packages" + path, { method, body });
}
function renderPkgModal(pid, pname, list) {
  A.modal(`<h2>Packages · ${FF.esc(pname)}</h2>
  <table class="table" style="margin-bottom:12px"><tr><th>Name</th><th>Price</th><th>Stock</th><th></th></tr>
  ${list.map(p => `<tr><td>${FF.esc(p.name)}</td><td>${FF.money(p.price)}</td><td>${p.stock}</td>
  <td><button class="btn btn-purple btn-sm" style="width:auto" onclick="stockModal(${p.id},${pid},'${FF.esc(pname).replace(/'/g,"")}')">Stock</button>
  <button class="btn btn-red btn-sm" style="width:auto" onclick="delPkg(${p.id},${pid},'${FF.esc(pname).replace(/'/g,"")}')">Del</button></td></tr>`).join("") || '<tr><td colspan="4">None</td></tr>'}</table>
  <div class="field"><label>New Package Name</label><input class="input" id="pk_name" placeholder="Drip Apk 1 Days"></div>
  <div class="row"><input class="input" id="pk_price" type="number" placeholder="Price"><input class="input" id="pk_dur" placeholder="Duration"></div>
  <button class="btn btn-green btn-block" style="margin-top:10px" id="pk_add">Add Package</button>`);
  document.getElementById("pk_add").onclick = async () => {
    await postPkg("POST", "", { product_id: pid, name: pk_name.value, price: pk_price.value, duration: pk_dur.value, active: true });
    renderPkgModal(pid, pname, await loadPkgs(pid));
  };
}
async function delPkg(id, pid, pname) { if (!confirm("Delete package?")) return; await postPkg("DELETE", "/" + id); renderPkgModal(pid, pname, await loadPkgs(pid)); }

async function stockModal(pkgId, pid, pname) {
  const res = await fetch("/api/admin/stock?package_id=" + pkgId);
  const keys = (await res.json()).keys || [];
  A.modal(`<h2>Stock Keys</h2>
  <p class="muted">Unused: ${keys.filter(k => !k.used).length} · Total: ${keys.length}</p>
  <div class="field"><label>Add codes (one per line)</label><textarea id="codes" rows="6" placeholder="USER: ZR-199 PASS: ZR-1days"></textarea></div>
  <button class="btn btn-green btn-block" id="addk">Upload Codes</button>
  <div class="divider"></div>
  <button class="btn btn-ghost btn-block" onclick="managePkg(${pid},'${FF.esc(pname).replace(/'/g,"")}')">← Back to packages</button>`);
  document.getElementById("addk").onclick = async () => {
    const r = await FF.api("/admin/stock", { method: "POST", body: { package_id: pkgId, codes: codes.value } });
    FF.toast("Added " + r.added + " keys"); stockModal(pkgId, pid, pname);
  };
}

async function orders() {
  const d = await A.req("/orders");
  view(`<h1>Orders</h1><table class="table"><tr><th>Serial</th><th>User</th><th>Product</th><th>Amt</th><th>Status</th><th>Action</th></tr>
  ${d.orders.map(o => `<tr><td>${o.serial}</td><td>${FF.esc(o.email)}</td><td>${FF.esc(o.product_name)}</td><td>${FF.money(o.amount)}</td>
  <td><span class="badge b-${o.status}">${o.status}</span></td>
  <td><button class="btn btn-ghost btn-sm" style="width:auto" onclick="editOrder(${o.id},'${o.status}','${FF.esc(o.delivered_code||"").replace(/'/g,"")}')">Manage</button></td></tr>`).join("")}</table>`);
}
function editOrder(id, status, code) {
  A.modal(`<h2>Order #${id}</h2>
  <div class="field"><label>Status</label><select id="o_status">${["pending","processing","completed","cancelled"].map(s => `<option ${s===status?"selected":""}>${s}</option>`).join("")}</select></div>
  <div class="field"><label>Delivered Code</label><textarea id="o_code" rows="2">${FF.esc(code)}</textarea></div>
  <button class="btn btn-green btn-block" id="osave">Save</button>`);
  document.getElementById("osave").onclick = async () => {
    await A.req("/orders/" + id, "PUT", { status: o_status.value, delivered_code: o_code.value });
    A.close(); FF.toast("Updated"); orders();
  };
}

async function users() {
  const d = await A.req("/users");
  view(`<h1>Users</h1><table class="table"><tr><th>Name</th><th>Email</th><th>Balance</th><th>Spent</th><th>Role</th><th>Action</th></tr>
  ${d.users.map(u => `<tr><td>${FF.esc(u.name)}</td><td>${FF.esc(u.email)}</td><td>${FF.money(u.balance)}</td><td>${FF.money(u.total_spent)}</td>
  <td>${u.role}${u.status==="banned"?" 🚫":""}</td>
  <td><button class="btn btn-ghost btn-sm" style="width:auto" onclick="editUser(${u.id},${u.balance},'${u.status}')">Manage</button></td></tr>`).join("")}</table>`);
}
function editUser(id, bal, status) {
  A.modal(`<h2>User #${id}</h2><p class="muted">Balance: ${FF.money(bal)}</p>
  <div class="field"><label>Adjust balance (+/-)</label><input class="input" id="u_adj" type="number" placeholder="e.g. 100 or -50"></div>
  <div class="field"><label>Reason</label><input class="input" id="u_reason" placeholder="Manual top-up"></div>
  <div class="field"><label>Status</label><select id="u_status"><option ${status==="active"?"selected":""}>active</option><option ${status==="banned"?"selected":""}>banned</option></select></div>
  <button class="btn btn-green btn-block" id="usave">Save</button>`);
  document.getElementById("usave").onclick = async () => {
    await A.req("/users/" + id, "PUT", { adjust: +u_adj.value || 0, reason: u_reason.value, status: u_status.value });
    A.close(); FF.toast("Updated"); users();
  };
}

async function promos() {
  const d = await A.req("/promos");
  view(`<h1>Promo Codes</h1>
  <div class="card" style="max-width:520px"><div class="row"><input class="input" id="pm_code" placeholder="CODE"><select id="pm_kind"><option value="percent">% Percent</option><option value="flat">Flat ৳</option></select></div>
  <div class="row" style="margin-top:10px"><input class="input" id="pm_val" type="number" placeholder="Value"><input class="input" id="pm_lim" type="number" placeholder="Usage limit (0=∞)"></div>
  <button class="btn btn-green btn-block" style="margin-top:10px" id="pm_add">Create Promo</button></div>
  <table class="table"><tr><th>Code</th><th>Type</th><th>Value</th><th>Used</th><th></th></tr>
  ${d.promos.map(p => `<tr><td>${FF.esc(p.code)}</td><td>${p.kind}</td><td>${p.value}${p.kind==="percent"?"%":"৳"}</td><td>${p.used}/${p.usage_limit||"∞"}</td>
  <td><button class="btn btn-red btn-sm" style="width:auto" onclick="delPromo(${p.id})">Del</button></td></tr>`).join("")}</table>`);
  document.getElementById("pm_add").onclick = async () => {
    await A.req("/promos", "POST", { code: pm_code.value, kind: pm_kind.value, value: pm_val.value, usage_limit: pm_lim.value, active: true });
    FF.toast("Created"); promos();
  };
}
async function delPromo(id) { await A.req("/promos/" + id, "DELETE"); promos(); }

async function categories() {
  const d = await A.req("/categories");
  view(`<h1>Categories</h1>
  <div class="card" style="max-width:480px"><div class="row"><input class="input" id="c_name" placeholder="Category name"><input class="input" id="c_sort" type="number" placeholder="sort" style="width:90px"></div>
  <button class="btn btn-green btn-block" style="margin-top:10px" id="c_add">Add Category</button></div>
  <table class="table"><tr><th>Name</th><th>Slug</th><th></th></tr>
  ${d.categories.map(c => `<tr><td>${FF.esc(c.name)}</td><td>${FF.esc(c.slug)}</td><td><button class="btn btn-red btn-sm" style="width:auto" onclick="delCat(${c.id})">Del</button></td></tr>`).join("")}</table>`);
  document.getElementById("c_add").onclick = async () => { await A.req("/categories", "POST", { name: c_name.value, sort_order: +c_sort.value }); FF.toast("Added"); categories(); };
}
async function delCat(id) { await A.req("/categories/" + id, "DELETE"); categories(); }

async function settings() {
  const d = await A.req("/settings");
  const s = d.settings;
  const f = (k, label, type) => `<div class="field"><label>${label}</label><input class="input" data-k="${k}" value="${FF.esc(s[k] || "")}" ${type ? `type="${type}"` : ""}></div>`;
  view(`<h1>Settings</h1><div style="max-width:560px">
  ${f("site_name", "Site Name")}${f("logo_text", "Logo Text")}${f("admin_panel_name", "Admin Panel Name")}
  ${f("primary_color", "Primary Color", "color")}${f("accent_color", "Accent Color", "color")}
  ${f("hero_tagline", "Hero Tagline")}${f("bkash_number", "bKash Number")}${f("nagad_number", "Nagad Number")}
  ${f("referral_bonus_percent", "Referral Bonus %", "number")}${f("support_link", "Support Link")}${f("footer_text", "Footer Text")}
  <button class="btn btn-green btn-block" style="margin-top:12px" id="sset">Save Settings</button></div>`);
  document.getElementById("sset").onclick = async () => {
    const obj = {};
    document.querySelectorAll("[data-k]").forEach(i => obj[i.dataset.k] = i.value);
    await A.req("/settings", "PUT", { settings: obj });
    FF.toast("Settings saved"); FF.cfg = {}; await FF.loadConfig(); A.panelName = obj.admin_panel_name || A.panelName;
  };
}

init();
