import { json } from "../_utils.js";

export async function onRequestGet({ env, request }) {
  const url = new URL(request.url);
  const cat = url.searchParams.get("category");
  const q = (url.searchParams.get("q") || "").trim();

  const cats = await env.DB.prepare("SELECT id, name, slug FROM categories ORDER BY sort_order, name").all();

  let sql = "SELECT p.id, p.name, p.slug, p.image_url, p.badge, p.type, p.demo_url, c.slug AS category_slug, " +
    "(SELECT MIN(price) FROM packages WHERE product_id = p.id AND active = 1) AS min_price " +
    "FROM products p LEFT JOIN categories c ON c.id = p.category_id WHERE p.active = 1";
  const binds = [];
  if (cat && cat !== "all") { sql += " AND c.slug = ?"; binds.push(cat); }
  if (q) { sql += " AND p.name LIKE ?"; binds.push("%" + q + "%"); }
  sql += " ORDER BY p.sort_order, p.id DESC";

  const products = await env.DB.prepare(sql).bind(...binds).all();
  return json({ categories: cats.results || [], products: products.results || [] });
}
