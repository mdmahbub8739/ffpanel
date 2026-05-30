export async function onRequest(context) {
  const response = await context.next();
  const h = new Headers(response.headers);
  h.set("X-Content-Type-Options", "nosniff");
  h.set("X-Frame-Options", "DENY");
  h.set("Referrer-Policy", "strict-origin-when-cross-origin");
  h.set("Permissions-Policy", "geolocation=(), microphone=(), camera=()");
  h.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  h.set(
    "Content-Security-Policy",
    [
      "default-src 'self'",
      "img-src 'self' data: https:",
      "style-src 'self' 'unsafe-inline'",
      "script-src 'self'",
      "connect-src 'self'",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join("; ")
  );
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers: h });
}
