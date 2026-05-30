import { json, bad, requireAdmin, slugify, hashPassword, refCode } from "../_utils.js";

export async function onRequest(context) {
  const { env, request, params } = context;
  const seg = Array.isArray(params.path) ? params.path : (params.path ? [params.path] : []);
  const resource = seg[0] || "";
  const id = seg[1] ? parseInt(seg[1], 10) : null;
  const method = request.method;

  if (resource === "bootstrap" && method === "POST") return bootstrap(env, request);

  const admin = await requireAdmin(env, request);
  if (!admin) return bad("Forbidden", 403);

  const body = method === "GET" || method === "DELETE" ? {} : await request.json().catch(() => ({}));

  switch (resource) {
    case "stats": return stats(env);
    case "products": return products(env, method, id, body);
    case "packages": return packages(env, method, id, body);
    case "stock": return stock(env, method, id, body);
    case "orders": return orders(env, method, id, body);
    case "users": return users(env, method, id, body);
    case "promos": return promos(env, method, id, body);
    case "categories": return categories(env, method, id, body);
    case "settings": return settings(env, method, body);
    default: return bad("Unknown resource", 404);
  }
}

async function bootstrap(env, request) {
  const b = await request.json().catch(() => ({}));
  if (!env.ADMIN_SETUP_KEY || b.setup_key !== env.ADMIN_SETUP_KEY) return bad("Invalid setup key", 401);
  const existing = await env.DB.prepare("SELECT id FROM users WHERE role = 'admin' LIMIT 1").first();
  if (existing) return bad("Admin already exists", 409);
  const email = (b.email || "").toString().trim().toLowerCase();
  const password = (b.password || "").toString();
  const name = (b.name || "Administrator").toString().trim().slice(0, 60);
  if (!email || password.length < 8) return bad("Email and 8+ char password required");
  const found = await env.DB.prepare("SELECT id FROM users WHERE email = ?").bind(email).first();
  if (found) {
    const { hash, salt } = await hashPassword(password);
    await env.DB.prepare("UPDATE users SET role = 'admin', password_hash = ?, salt = ? WHERE id = ?").bind(hash, salt, found.id).run();
    return json({ ok: true, promoted: true });
  }
  const { hash, salt } = await hashPassword(password);
  await env.DB.prepare("INSERT INTO users (name, email, password_hash, salt, referral_code, role) VALUES (?, ?, ?, ?, ?, 'admin')")
    .bind(name, email, hash, salt, refCode()).run();
  return json({ ok: true, created: true });
}

async function stats(env) {
  const u = await env.DB.prepare("SELECT COUNT(*) c, COALESCE(SUM(balance),0) bal FROM users WHERE role='user'").first();
  const o = await env.DB.prepare("SELECT COUNT(*) c, COALESCE(SUM(CASE WHEN status='completed' THEN amount ELSE 0 END),0) rev FROM orders").first();
  const pend = await env.DB.prepare("SELECT COUNT(*) c FROM orders WHERE status IN ('pending','processing')").first();
  const prod = await env.DB.prepare("SELECT COUNT(*) c FROM products").first();
  const recent = await env.DB.prepare("SELECT id, serial, product_name, amount, status, created_at FROM orders ORDER BY id DESC LIMIT 10").all();
  return json({
    users: u.c, total_balance: u.bal, orders: o.c, revenue: o.rev,
    pending: pend.c, products: prod.c, recent: recent.results || [],
  });
}

async function products(env, method, id, b) {
  if (method === "GET") {
    const rows = await env.DB.prepare(
      "SELECT p.*, c.name category_name, (SELECT COUNT(*) FROM packages WHERE product_id=p.id) pkg_count FROM products p LEFT JOIN categories c ON c.id=p.category_id ORDER BY p.sort_order, p.id DESC"
    ).all();
    return json({ products: rows.results || [] });
  }
  if (method === "POST") {
    const slug = b.slug ? slugify(b.slug) : slugify(b.name || "");
    const r = await env.DB.prepare(
      "INSERT INTO products (name, slug, category_id, image_url, badge, type, description, demo_url, rules, active, sort_order) VALUES (?,?,?,?,?,?,?,?,?,?,?)"
    ).bind(b.name || "Untitled", slug, b.category_id || null, b.image_url || null, b.badge || null, b.type || "Game / Voucher", b.description || null, b.demo_url || null, b.rules || null, b.active ? 1 : 0, b.sort_order || 0).run();
    return json({ ok: true, id: r.meta.last_row_id });
  }
  if (method === "PUT" && id) {
    await env.DB.prepare(
      "UPDATE products SET name=?, category_id=?, image_url=?, badge=?, type=?, description=?, demo_url=?, rules=?, active=?, sort_order=? WHERE id=?"
    ).bind(b.name, b.category_id || null, b.image_url || null, b.badge || null, b.type || "Game / Voucher", b.description || null, b.demo_url || null, b.rules || null, b.active ? 1 : 0, b.sort_order || 0, id).run();
    return json({ ok: true });
  }
  if (method === "DELETE" && id) {
    await env.DB.prepare("DELETE FROM products WHERE id=?").bind(id).run();
    return json({ ok: true });
  }
  return bad("Bad request");
}

async function packages(env, method, id, b) {
  if (method === "GET") {
    const pid = b.product_id;
    const rows = await env.DB.prepare(
      "SELECT pk.*, (SELECT COUNT(*) FROM stock_keys WHERE package_id=pk.id AND used=0) stock FROM packages pk WHERE pk.product_id=? ORDER BY pk.sort_order, pk.price"
    ).bind(pid).all();
    return json({ packages: rows.results || [] });
  }
  if (method === "POST") {
    const r = await env.DB.prepare("INSERT INTO packages (product_id, name, price, duration, active, sort_order) VALUES (?,?,?,?,?,?)")
      .bind(b.product_id, b.name || "Package", Math.max(0, parseInt(b.price, 10) || 0), b.duration || null, b.active ? 1 : 0, b.sort_order || 0).run();
    return json({ ok: true, id: r.meta.last_row_id });
  }
  if (method === "PUT" && id) {
    await env.DB.prepare("UPDATE packages SET name=?, price=?, duration=?, active=?, sort_order=? WHERE id=?")
      .bind(b.name, Math.max(0, parseInt(b.price, 10) || 0), b.duration || null, b.active ? 1 : 0, b.sort_order || 0, id).run();
    return json({ ok: true });
  }
  if (method === "DELETE" && id) {
    await env.DB.prepare("DELETE FROM packages WHERE id=?").bind(id).run();
    return json({ ok: true });
  }
  return bad("Bad request");
}

async function stock(env, method, id, b) {
  if (method === "GET") {
    const rows = await env.DB.prepare("SELECT id, content, used, order_id, created_at FROM stock_keys WHERE package_id=? ORDER BY id DESC LIMIT 500").bind(b.package_id || id).all();
    return json({ keys: rows.results || [] });
  }
  if (method === "POST") {
    const pid = parseInt(b.package_id, 10);
    const lines = (b.codes || "").toString().split("\n").map((x) => x.trim()).filter(Boolean).slice(0, 1000);
    if (!pid || !lines.length) return bad("package_id and codes required");
    const stmt = env.DB.prepare("INSERT INTO stock_keys (package_id, content) VALUES (?, ?)");
    await env.DB.batch(lines.map((c) => stmt.bind(pid, c)));
    return json({ ok: true, added: lines.length });
  }
  if (method === "DELETE" && id) {
    await env.DB.prepare("DELETE FROM stock_keys WHERE id=? AND used=0").bind(id).run();
    return json({ ok: true });
  }
  return bad("Bad request");
}

async function orders(env, method, id, b) {
  if (method === "GET") {
    const rows = await env.DB.prepare(
      "SELECT o.*, u.email FROM orders o JOIN users u ON u.id=o.user_id ORDER BY o.id DESC LIMIT 200"
    ).all();
    return json({ orders: rows.results || [] });
  }
  if (method === "PUT" && id) {
    if (typeof b.delivered_code === "string" || b.status) {
      await env.DB.prepare("UPDATE orders SET status=COALESCE(?,status), delivered_code=COALESCE(?,delivered_code) WHERE id=?")
        .bind(b.status || null, typeof b.delivered_code === "string" ? b.delivered_code : null, id).run();
    }
    return json({ ok: true });
  }
  return bad("Bad request");
}

async function users(env, method, id, b) {
  if (method === "GET") {
    const rows = await env.DB.prepare("SELECT id, name, email, phone, balance, total_spent, referral_code, role, status, created_at FROM users ORDER BY id DESC LIMIT 200").all();
    return json({ users: rows.results || [] });
  }
  if (method === "PUT" && id) {
    if (b.adjust !== undefined) {
      const amt = parseInt(b.adjust, 10) || 0;
      await env.DB.prepare("UPDATE users SET balance = MAX(0, balance + ?) WHERE id=?").bind(amt, id).run();
      if (amt !== 0) await env.DB.prepare("INSERT INTO bonus_history (user_id, amount, reason) VALUES (?,?,?)").bind(id, amt, b.reason || "Admin adjustment").run();
    }
    if (b.status) await env.DB.prepare("UPDATE users SET status=? WHERE id=?").bind(b.status === "banned" ? "banned" : "active", id).run();
    return json({ ok: true });
  }
  return bad("Bad request");
}

async function promos(env, method, id, b) {
  if (method === "GET") {
    const rows = await env.DB.prepare("SELECT * FROM promos ORDER BY id DESC").all();
    return json({ promos: rows.results || [] });
  }
  if (method === "POST") {
    await env.DB.prepare("INSERT INTO promos (code, kind, value, active, usage_limit, expires_at) VALUES (?,?,?,?,?,?)")
      .bind((b.code || "").toUpperCase().slice(0, 32), b.kind === "flat" ? "flat" : "percent", Math.max(0, parseInt(b.value, 10) || 0), b.active ? 1 : 0, parseInt(b.usage_limit, 10) || 0, b.expires_at || null).run();
    return json({ ok: true });
  }
  if (method === "DELETE" && id) {
    await env.DB.prepare("DELETE FROM promos WHERE id=?").bind(id).run();
    return json({ ok: true });
  }
  return bad("Bad request");
}

async function categories(env, method, id, b) {
  if (method === "GET") {
    const rows = await env.DB.prepare("SELECT * FROM categories ORDER BY sort_order, name").all();
    return json({ categories: rows.results || [] });
  }
  if (method === "POST") {
    await env.DB.prepare("INSERT INTO categories (name, slug, sort_order) VALUES (?,?,?)").bind(b.name || "Category", slugify(b.slug || b.name || ""), b.sort_order || 0).run();
    return json({ ok: true });
  }
  if (method === "DELETE" && id) {
    await env.DB.prepare("DELETE FROM categories WHERE id=?").bind(id).run();
    return json({ ok: true });
  }
  return bad("Bad request");
}

async function settings(env, method, b) {
  if (method === "GET") {
    const rows = await env.DB.prepare("SELECT key, value FROM settings").all();
    const out = {};
    for (const r of rows.results || []) out[r.key] = r.value;
    return json({ settings: out });
  }
  if (method === "PUT") {
    const stmt = env.DB.prepare("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value");
    const entries = Object.entries(b.settings || {}).filter(([k]) => /^[a-z0-9_]{1,40}$/.test(k));
    if (entries.length) await env.DB.batch(entries.map(([k, v]) => stmt.bind(k, String(v).slice(0, 2000))));
    return json({ ok: true });
  }
  return bad("Bad request");
}
