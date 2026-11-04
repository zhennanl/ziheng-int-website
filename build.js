// Static site generator for ziheng-int.com. No dependencies: `node build.js` -> dist/
// Inventory source: data/inventory.csv (synced from Google Sheets by .github/workflows/sync-inventory.yml)
const fs = require("fs");
const path = require("path");

const ROOT = __dirname;
const OUT = path.join(ROOT, "dist");
const cfg = JSON.parse(fs.readFileSync(path.join(ROOT, "site.config.json"), "utf8"));
const YEAR = new Date().getFullYear();

// ---------- CSV ----------
function parseCSV(text) {
  const rows = [];
  let row = [], field = "", q = false;
  text = text.replace(/^\uFEFF/, "");
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else q = false; }
      else field += c;
    } else if (c === '"') q = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field); rows.push(row); row = []; field = "";
    } else field += c;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  return rows.filter(r => r.some(v => v.trim() !== ""));
}

const raw = parseCSV(fs.readFileSync(path.join(ROOT, "data", "inventory.csv"), "utf8"));
const header = raw[0].map(h => h.trim().toLowerCase());
const col = name => header.findIndex(h => h.startsWith(name));
const C = { pn: col("part"), mfr: col("manufacturer"), cat: col("category"), desc: col("description"), dc: col("date"), show: col("show") };
if (C.pn < 0) throw new Error("inventory.csv needs a 'Part Number' column");

const slugify = s => s.toUpperCase().replace(/[^A-Z0-9.]+/g, "-").replace(/^-+|-+$/g, "") || "PART";
const catSlug = s => s.toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
const get = (r, i) => (i >= 0 && r[i] ? r[i].trim() : "");

const seen = new Map();
const parts = [];
for (const r of raw.slice(1)) {
  const pn = get(r, C.pn);
  if (!pn) continue;
  if (/^(no|n|false|0|hide)$/i.test(get(r, C.show))) continue;
  let slug = slugify(pn);
  const n = seen.get(slug) || 0; seen.set(slug, n + 1);
  if (n) slug += "-" + (n + 1);
  parts.push({
    pn, slug,
    mfr: get(r, C.mfr) || "Other",
    cat: get(r, C.cat) || "Other Components",
    desc: get(r, C.desc),
    dc: get(r, C.dc),
  });
}
parts.sort((a, b) => a.pn.localeCompare(b.pn, "en", { numeric: true }));

const groupBy = (arr, k) => arr.reduce((m, p) => (m.get(p[k]) ? m.get(p[k]).push(p) : m.set(p[k], [p]), m), new Map());
const cats = [...groupBy(parts, "cat")].sort((a, b) => b[1].length - a[1].length);
const mfrs = [...groupBy(parts, "mfr")].sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]));

// ---------- HTML helpers ----------
const esc = s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const url = p => cfg.siteUrl.replace(/\/$/, "") + p;
const mailto = pn => {
  const subject = pn ? `RFQ: ${pn}` : `Inquiry - ${cfg.companyName}`;
  const body = pn
    ? `Hello ${cfg.companyName},\n\nPlease quote the following part:\n\nPart number: ${pn}\nQuantity needed: \nTarget date: \n\nCompany: \nName: \nCountry: \n\nThank you.`
    : `Hello ${cfg.companyName},\n\n`;
  return `mailto:${cfg.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
};
const waLink = pn => {
  const num = cfg.whatsapp.replace(/[^0-9]/g, "");
  const text = pn ? `Hello, I'm interested in part ${pn}.` : "Hello, I have an inquiry.";
  return `https://wa.me/${num}?text=${encodeURIComponent(text)}`;
};

function contactButtons(pn) {
  let h = `<a class="btn btn-primary" href="${esc(mailto(pn))}">${icon("mail")}Email for a quote</a>`;
  if (cfg.whatsapp) h += `<a class="btn" href="${esc(waLink(pn))}" target="_blank" rel="noopener">${icon("chat")}WhatsApp</a>`;
  if (cfg.wechatId) h += `<button class="btn" type="button" data-wechat>${icon("chat")}WeChat</button>`;
  if (cfg.phone) h += `<a class="btn" href="tel:${esc(cfg.phone.replace(/[^+0-9]/g, ""))}">${icon("phone")}${esc(cfg.phone)}</a>`;
  return `<div class="btn-row">${h}</div>`;
}

function icon(name) {
  const d = {
    mail: '<path d="M4 6h16v12H4z"/><path d="m4 7 8 6 8-6"/>',
    chat: '<path d="M4 5h16v11H9l-5 4z"/>',
    phone: '<path d="M6 3h4l2 5-3 2a11 11 0 0 0 5 5l2-3 5 2v4a2 2 0 0 1-2 2A17 17 0 0 1 4 5a2 2 0 0 1 2-2z"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/>',
    check: '<path d="m5 12 5 5 9-10"/>',
  }[name];
  return `<svg class="ic" viewBox="0 0 24 24" aria-hidden="true">${d}</svg>`;
}

function layout({ title, description, canonical, body, jsonld, active }) {
  const nav = [["/", "Home"], ["/parts/", "Inventory"], ["/about/", "About"], ["/contact/", "Contact"]]
    .map(([h, t]) => `<a href="${h}"${active === h ? ' aria-current="page"' : ""}>${t}</a>`).join("");
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<link rel="canonical" href="${esc(url(canonical))}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="${esc(cfg.companyName)}">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:url" content="${esc(url(canonical))}">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="stylesheet" href="/styles.css">
${jsonld ? `<script type="application/ld+json">${JSON.stringify(jsonld).replace(/</g, "\\u003c")}</script>` : ""}
</head>
<body>
<header class="site-header">
  <div class="wrap header-inner">
    <a class="brand" href="/"><span class="brand-mark" aria-hidden="true">Z</span><span>${esc(cfg.companyName)}</span></a>
    <nav class="nav">${nav}</nav>
  </div>
</header>
<main>
${body}
</main>
<footer class="site-footer">
  <div class="wrap footer-grid">
    <div>
      <div class="brand footer-brand"><span class="brand-mark" aria-hidden="true">Z</span><span>${esc(cfg.companyName)}</span></div>
      <p class="muted">${esc(cfg.tagline)}.</p>
    </div>
    <div>
      <h2 class="footer-h">Contact</h2>
      <p><a href="${esc(mailto(""))}">${esc(cfg.email)}</a></p>
      ${cfg.phone ? `<p>${esc(cfg.phone)}</p>` : ""}
      ${cfg.wechatId ? `<p>WeChat: ${esc(cfg.wechatId)}</p>` : ""}
      ${cfg.address ? `<p class="muted">${esc(cfg.address)}</p>` : ""}
    </div>
    <div>
      <h2 class="footer-h">Browse</h2>
      <p><a href="/parts/">Full inventory</a></p>
      <p><a href="/#categories">By category</a></p>
      <p><a href="/#manufacturers">By manufacturer</a></p>
    </div>
  </div>
  <div class="wrap legal muted">© ${YEAR} ${esc(cfg.companyName)}. All trademarks belong to their respective owners. ${esc(cfg.companyName)} is an independent distributor and is not affiliated with the manufacturers listed.</div>
</footer>
${cfg.wechatId ? wechatDialog() : ""}
<script src="/site.js" defer></script>
</body>
</html>`;
}

function wechatDialog() {
  return `<dialog id="wechat-dialog" class="dialog">
  <h2>Contact us on WeChat</h2>
  ${cfg.wechatQr ? `<img src="${esc(cfg.wechatQr)}" alt="WeChat QR code" width="200" height="200">` : ""}
  <p>WeChat ID: <strong>${esc(cfg.wechatId)}</strong></p>
  <form method="dialog"><button class="btn">Close</button></form>
</dialog>`;
}

function partRows(list) {
  return list.map(p => `<tr data-s="${esc((p.pn + " " + p.mfr + " " + p.cat + " " + p.desc).toLowerCase())}">
<td><a class="pn" href="/parts/${p.slug}/">${esc(p.pn)}</a></td>
<td>${esc(p.mfr)}</td>
<td class="hide-sm">${esc(p.desc)}</td>
<td><span class="badge">${icon("check")}In stock</span></td>
</tr>`).join("\n");
}

function partTable(list, withFilter) {
  return `${withFilter ? `<div class="filter"><label class="search">${icon("search")}<input type="search" id="filter" placeholder="Filter by part number, manufacturer or keyword" autocomplete="off" aria-label="Filter parts"></label><span class="muted" id="count">${list.length} parts</span></div>` : ""}
<div class="table-wrap"><table class="parts">
<thead><tr><th>Part number</th><th>Manufacturer</th><th class="hide-sm">Description</th><th>Status</th></tr></thead>
<tbody>${partRows(list)}</tbody>
</table></div>
<p class="muted empty" id="empty" hidden>No match in our listed stock. <a href="${esc(mailto(""))}">Email us the part number</a>, as we may still be able to source it.</p>`;
}

// ---------- write ----------
const pages = [];
function write(p, html, priority = "0.5") {
  const file = path.join(OUT, p, "index.html");
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, html);
  pages.push({ p, priority });
}

fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });
fs.cpSync(path.join(ROOT, "public"), OUT, { recursive: true });

const orgLd = { "@context": "https://schema.org", "@type": "Organization", name: cfg.companyName, url: cfg.siteUrl, email: cfg.email };

// Home
write("/", layout({
  title: `${cfg.companyName} | Military, Obsolete & Hard-to-Find Electronic Components`,
  description: `${cfg.companyName}: ${cfg.tagline}. ${parts.length} part numbers in stock from ${mfrs.length} manufacturers including ${mfrs.slice(0, 4).map(m => m[0]).join(", ")}.`,
  canonical: "/", active: "/",
  jsonld: [orgLd, { "@context": "https://schema.org", "@type": "WebSite", name: cfg.companyName, url: cfg.siteUrl,
    potentialAction: { "@type": "SearchAction", target: url("/parts/?q={search_term_string}"), "query-input": "required name=search_term_string" } }],
  body: `<section class="hero">
  <div class="wrap">
    <p class="eyebrow">Independent electronic component distributor</p>
    <h1>Hard-to-find, military &amp; obsolete ICs. In stock.</h1>
    <p class="lead">Search ${parts.length} part numbers from ${mfrs.length} manufacturers. Find your part, then contact us for a fast quote.</p>
    <form class="hero-search" action="/parts/" method="get" role="search">
      <label class="search">${icon("search")}<input type="search" name="q" placeholder="Enter a part number, e.g. HCPL-5731" aria-label="Part number" required></label>
      <button class="btn btn-primary" type="submit">Search stock</button>
    </form>
    <p class="hero-meta">${mfrs.slice(0, 6).map(m => `<a href="/manufacturer/${catSlug(m[0])}/">${esc(m[0])}</a>`).join(" · ")}</p>
  </div>
</section>
<section class="wrap section">
  <div class="highlights">${cfg.highlights.map(h => `<div class="card"><h3>${esc(h.title)}</h3><p>${esc(h.text)}</p></div>`).join("")}</div>
</section>
<section class="wrap section" id="categories">
  <h2>Browse by category</h2>
  <div class="tiles">${cats.map(([c, l]) => `<a class="tile" href="/category/${catSlug(c)}/"><span>${esc(c)}</span><span class="tile-n">${l.length}</span></a>`).join("")}</div>
</section>
<section class="wrap section" id="manufacturers">
  <h2>Browse by manufacturer</h2>
  <div class="chips">${mfrs.map(([m, l]) => `<a class="chip" href="/manufacturer/${catSlug(m)}/">${esc(m)} <span class="muted">${l.length}</span></a>`).join("")}</div>
</section>
<section class="cta">
  <div class="wrap cta-inner">
    <div><h2>Can't find your part?</h2><p>Our listed stock changes often. Send us the part number and quantity you need.</p></div>
    ${contactButtons("")}
  </div>
</section>`,
}), "1.0");

// Inventory
write("/parts/", layout({
  title: `Electronic Components in Stock | ${cfg.companyName}`,
  description: `Full list of ${parts.length} integrated circuits and electronic components in stock at ${cfg.companyName}. Contact us for a quote.`,
  canonical: "/parts/", active: "/parts/",
  body: `<section class="wrap section page-head"><h1>Inventory</h1><p class="lead">All parts below are in stock. Click a part number for details and to request a quote.</p></section>
<section class="wrap">${partTable(parts, true)}</section>`,
}), "0.9");

// Category & manufacturer pages
for (const [kind, groups, label] of [["category", cats, "category"], ["manufacturer", mfrs, "manufacturer"]]) {
  for (const [name, list] of groups) {
    write(`/${kind}/${catSlug(name)}/`, layout({
      title: `${name} in Stock | ${cfg.companyName}`,
      description: `${list.length} ${name} parts in stock at ${cfg.companyName}: ${list.slice(0, 6).map(p => p.pn).join(", ")}${list.length > 6 ? " and more" : ""}.`,
      canonical: `/${kind}/${catSlug(name)}/`,
      body: `<section class="wrap section page-head">
<nav class="crumbs" aria-label="Breadcrumb"><a href="/">Home</a> / <a href="/parts/">Inventory</a> / <span>${esc(name)}</span></nav>
<h1>${esc(name)}</h1><p class="lead">${list.length} part${list.length === 1 ? "" : "s"} in stock${kind === "manufacturer" ? ` from ${esc(name)}` : ""}.</p></section>
<section class="wrap">${partTable(list, list.length > 12)}</section>`,
    }), "0.7");
  }
}

// Part pages
const byCat = groupBy(parts, "cat");
for (const p of parts) {
  const related = byCat.get(p.cat).filter(x => x !== p).slice(0, 8);
  const desc = p.desc || `${p.pn} from ${p.mfr}.`;
  write(`/parts/${p.slug}/`, layout({
    title: `${p.pn} ${p.mfr} - In Stock | ${cfg.companyName}`,
    description: `${p.pn} by ${p.mfr} in stock. ${desc}${p.dc ? ` Date code ${p.dc}.` : ""} Request a quote from ${cfg.companyName}.`,
    canonical: `/parts/${p.slug}/`,
    jsonld: [{
      "@context": "https://schema.org", "@type": "Product", name: p.pn, mpn: p.pn, sku: p.pn,
      brand: { "@type": "Brand", name: p.mfr }, category: p.cat, description: desc, url: url(`/parts/${p.slug}/`),
    }, {
      "@context": "https://schema.org", "@type": "BreadcrumbList", itemListElement: [
        { "@type": "ListItem", position: 1, name: "Home", item: url("/") },
        { "@type": "ListItem", position: 2, name: p.cat, item: url(`/category/${catSlug(p.cat)}/`) },
        { "@type": "ListItem", position: 3, name: p.pn, item: url(`/parts/${p.slug}/`) }],
    }],
    body: `<section class="wrap section">
<nav class="crumbs" aria-label="Breadcrumb"><a href="/">Home</a> / <a href="/category/${catSlug(p.cat)}/">${esc(p.cat)}</a> / <span>${esc(p.pn)}</span></nav>
<div class="part">
  <div class="part-main">
    <span class="badge badge-lg">${icon("check")}In stock</span>
    <h1 class="part-pn">${esc(p.pn)}</h1>
    <p class="part-mfr"><a href="/manufacturer/${catSlug(p.mfr)}/">${esc(p.mfr)}</a></p>
    <p class="lead">${esc(desc)}</p>
    <dl class="specs">
      <div><dt>Part number</dt><dd>${esc(p.pn)}</dd></div>
      <div><dt>Manufacturer</dt><dd><a href="/manufacturer/${catSlug(p.mfr)}/">${esc(p.mfr)}</a></dd></div>
      <div><dt>Category</dt><dd><a href="/category/${catSlug(p.cat)}/">${esc(p.cat)}</a></dd></div>
      ${p.dc ? `<div><dt>Date code</dt><dd>${esc(p.dc)}</dd></div>` : ""}
      <div><dt>Availability</dt><dd>In stock</dd></div>
    </dl>
  </div>
  <aside class="rfq card">
    <h2>Request a quote</h2>
    <p>Tell us the quantity and target date for <strong>${esc(p.pn)}</strong>. We usually reply within one business day.</p>
    ${contactButtons(p.pn)}
    <p class="muted small">Email: <a href="${esc(mailto(p.pn))}">${esc(cfg.email)}</a></p>
  </aside>
</div>
</section>
${related.length ? `<section class="wrap section"><h2>Related ${esc(p.cat)} in stock</h2>${partTable(related, false)}<p><a href="/category/${catSlug(p.cat)}/">View all ${esc(p.cat)} →</a></p></section>` : ""}`,
  }), "0.8");
}

// About & contact
write("/about/", layout({
  title: `About Us | ${cfg.companyName}`,
  description: `About ${cfg.companyName}, ${cfg.tagline.toLowerCase()}.`,
  canonical: "/about/", active: "/about/",
  body: `<section class="wrap section page-head narrow"><h1>About ${esc(cfg.companyName)}</h1>${cfg.about.map(t => `<p class="lead">${esc(t)}</p>`).join("")}</section>
<section class="wrap section"><div class="highlights">${cfg.highlights.map(h => `<div class="card"><h3>${esc(h.title)}</h3><p>${esc(h.text)}</p></div>`).join("")}</div></section>`,
}), "0.5");

write("/contact/", layout({
  title: `Contact Us | ${cfg.companyName}`,
  description: `Contact ${cfg.companyName} for quotes on electronic components. Email ${cfg.email}.`,
  canonical: "/contact/", active: "/contact/",
  body: `<section class="wrap section page-head narrow"><h1>Contact us</h1>
<p class="lead">For a quote, send us the part number, quantity and target date. We usually reply within one business day.</p>
<div class="card contact-card">
  <dl class="specs">
    <div><dt>Email</dt><dd><a href="${esc(mailto(""))}">${esc(cfg.email)}</a></dd></div>
    ${cfg.wechatId ? `<div><dt>WeChat</dt><dd>${esc(cfg.wechatId)}</dd></div>` : ""}
    ${cfg.whatsapp ? `<div><dt>WhatsApp</dt><dd><a href="${esc(waLink(""))}" target="_blank" rel="noopener">${esc(cfg.whatsapp)}</a></dd></div>` : ""}
    ${cfg.phone ? `<div><dt>Phone</dt><dd>${esc(cfg.phone)}</dd></div>` : ""}
    ${cfg.address ? `<div><dt>Address</dt><dd>${esc(cfg.address)}</dd></div>` : ""}
  </dl>
  ${contactButtons("")}
</div></section>`,
}), "0.6");

// 404
fs.writeFileSync(path.join(OUT, "404.html"), layout({
  title: `Page not found | ${cfg.companyName}`, description: "Page not found.", canonical: "/404.html",
  body: `<section class="wrap section page-head narrow"><h1>Page not found</h1><p class="lead">This part may no longer be listed. <a href="/parts/">Search our inventory</a> or <a href="${esc(mailto(""))}">email us the part number</a>.</p></section>`,
}));

// sitemap, robots
const today = new Date().toISOString().slice(0, 10);
fs.writeFileSync(path.join(OUT, "sitemap.xml"), `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${pages.map(x => `<url><loc>${esc(url(x.p))}</loc><lastmod>${today}</lastmod><priority>${x.priority}</priority></url>`).join("\n")}
</urlset>
`);
fs.writeFileSync(path.join(OUT, "robots.txt"), `User-agent: *\nAllow: /\nSitemap: ${url("/sitemap.xml")}\n`);

console.log(`Built ${pages.length} pages (${parts.length} parts, ${cats.length} categories, ${mfrs.length} manufacturers) -> dist/`);
