// Cloudflare Pages Function: POST /api/rfq
// Emails a quote request to the company inbox through Resend (https://resend.com).
// Settings (Cloudflare Pages > Settings > Variables and secrets):
//   RESEND_API_KEY  (secret)  required; without it this returns 503 and the page falls back to a pre-filled email
//   RFQ_TO          optional; default contact@ziheng-int.com
//   RFQ_FROM        optional; default "Ziheng International Website <rfq@ziheng-int.com>" (domain must be verified in Resend)

const LIMITS = { part: 80, quantity: 20, needed_by: 40, name: 80, company: 120, email: 120, country: 60, message: 2000 };

function json(status, body) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

export async function onRequestPost({ request, env }) {
  if (!env.RESEND_API_KEY) return json(503, { error: "Form email is not set up yet." });

  let data;
  try { data = await request.json(); } catch { return json(400, { error: "Please check the form and try again." }); }
  if (data.website) return json(200, { ok: true }); // honeypot: bots fill hidden field

  const f = {};
  for (const [k, max] of Object.entries(LIMITS)) f[k] = String(data[k] || "").trim().slice(0, max);
  if (!f.part || !f.quantity || !f.name) return json(400, { error: "Please add the part number, quantity and your name." });
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(f.email)) return json(400, { error: "Please enter a valid email address." });

  const country = request.headers.get("CF-IPCountry") || "";
  const text = [
    `Part number: ${f.part}`, `Quantity: ${f.quantity}`, `Needed by: ${f.needed_by}`, "",
    `Name: ${f.name}`, `Company: ${f.company}`, `Email: ${f.email}`, `Country: ${f.country}${country ? ` (visitor location: ${country})` : ""}`,
    "", f.message ? `Notes:\n${f.message}` : "", "", `Sent from ${new URL(request.url).origin}`,
  ].join("\n");

  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: env.RFQ_FROM || "Ziheng International Website <rfq@ziheng-int.com>",
      to: [env.RFQ_TO || "contact@ziheng-int.com"],
      reply_to: f.email,
      subject: `RFQ: ${f.part} x ${f.quantity} (${f.company || f.name})`,
      text,
    }),
  });
  if (!r.ok) return json(502, { error: "The request could not be sent." });
  return json(200, { ok: true });
}

export async function onRequest() {
  return json(405, { error: "Use POST." });
}
