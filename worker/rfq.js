// POST /api/rfq: emails a quote request to the company inbox through Resend (https://resend.com).
// Settings (Cloudflare > Workers & Pages > ziheng-int-website > Settings > Variables and secrets):
//   RESEND_API_KEY  (secret)  required; without it this returns 503 and the page falls back to a pre-filled email
//   RFQ_TO          optional; default contact@ziheng-int.com
//   RFQ_FROM        optional; default "Ziheng International Website <rfq@ziheng-int.com>" (domain must be verified in Resend)

const LIMITS = { part: 80, quantity: 20, needed_by: 40, name: 80, company: 120, email: 120, country: 60, message: 2000 };

function json(status, body) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });
}

export async function handleRfq(request, env) {
  if (request.method !== "POST") return json(405, { error: "Use POST." });
  if (!env.RESEND_API_KEY) return json(503, { error: "Form email is not set up yet." });

  let data;
  try { data = await request.json(); } catch { return json(400, { error: "Please check the form and try again." }); }
  if (!data || typeof data !== "object") return json(400, { error: "Please check the form and try again." });
  if (data.website) return json(200, { ok: true }); // honeypot: bots fill the hidden field

  const f = {};
  for (const [k, max] of Object.entries(LIMITS)) f[k] = String(data[k] || "").trim().slice(0, max);
  if (!f.part || !f.quantity || !f.name) return json(400, { error: "Please add the part number, quantity and your name." });
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(f.email)) return json(400, { error: "Please enter a valid email address." });

  const visitorCountry = request.headers.get("CF-IPCountry") || "";
  const lang = data.lang === "zh" ? "Chinese site" : "English site";
  const sourcing = data.kind === "sourcing"; // part not in listed stock: buyer asked us to source it
  const text = [
    ...(sourcing ? ["SOURCING REQUEST: this part is not in our listed stock.", ""] : []),
    `Part number: ${f.part}`, `Quantity: ${f.quantity}`, `Needed by: ${f.needed_by}`, "",
    `Name: ${f.name}`, `Company: ${f.company}`, `Email: ${f.email}`,
    `Country: ${f.country}${visitorCountry ? ` (visitor location: ${visitorCountry})` : ""}`,
    "", f.message ? `Notes:\n${f.message}` : "", "", `Sent from ${new URL(request.url).origin} (${lang})`,
  ].join("\n");

  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: env.RFQ_FROM || "Ziheng International Website <rfq@ziheng-int.com>",
      to: [env.RFQ_TO || "contact@ziheng-int.com"],
      reply_to: f.email,
      subject: `${sourcing ? "Sourcing request" : "RFQ"}: ${f.part} x ${f.quantity} (${f.company || f.name})`,
      text,
    }),
  });
  if (!r.ok) return json(502, { error: "The request could not be sent." });
  return json(200, { ok: true });
}

// POST /api/search-miss: logs a part number that a visitor searched for but we don't list.
// Only the search text, language and visitor country are logged (no personal data).
// View in Cloudflare: Workers & Pages > ziheng-int-website > Observability (Logs), filter on "search_miss".
export async function handleSearchMiss(request) {
  if (request.method !== "POST") return new Response(null, { status: 405 });
  let term = "", lang = "en";
  try { const d = await request.json(); term = String(d.term || ""); lang = d.lang === "zh" ? "zh" : "en"; } catch { /* ignore */ }
  term = term.trim().replace(/\s+/g, " ").slice(0, 60);
  if (term.length >= 3 && /[0-9]/.test(term)) {
    console.log(JSON.stringify({ event: "search_miss", term: term.toUpperCase(), lang, country: request.headers.get("CF-IPCountry") || "" }));
  }
  return new Response(null, { status: 204 });
}
