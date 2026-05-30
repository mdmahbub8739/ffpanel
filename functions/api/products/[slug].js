import { json, bad } from "../_utils.js";

export async function onRequestGet({ env, params }) {
  const slug = params.slug;
  const p = await env.DB.prepare(
    "SELECT p.*, c.name AS category_name FROM products p LEFT JOIN categories c ON c.id = p.category_id WHERE p.slug = ? AND p.active = 1"
  ).bind(slug).first();
  if (!p) return bad("Product not found", 404);

  const packages = await env.DB.prepare(
    "SELECT id, name, price, duration FROM packages WHERE product_id = ? AND active = 1 ORDER BY sort_order, price"
  ).bind(p.id).all();

  return json({
    product: {
      id: p.id, name: p.name, slug: p.slug, image_url: p.image_url, badge: p.badge,
      type: p.type, description: p.description, demo_url: p.demo_url, rules: p.rules,
      category_name: p.category_name,
    },
    packages: packages.results || [],
  });
}
