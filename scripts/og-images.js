// Generates link-preview images (1200x630 PNG) for every part: public/og/<slug>.png
// Shown when a part link is pasted into LinkedIn, WeChat, WhatsApp, email, etc.
// Only parts whose content changed are redrawn (tracked in data/og-manifest.json).
// Usage: npm install && node scripts/og-images.js
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { Resvg } = require("@resvg/resvg-js");

const ROOT = path.join(__dirname, "..");
const OUT = path.join(ROOT, "public", "og");
const MANIFEST = path.join(ROOT, "data", "og-manifest.json");
const IMG_DIR = path.join(ROOT, "public", "images", "parts");
const FONT_DIR = path.join(ROOT, "node_modules", "@expo-google-fonts", "inter");
const fontFiles = ["400Regular/Inter_400Regular.ttf", "500Medium/Inter_500Medium.ttf", "700Bold/Inter_700Bold.ttf"].map(f => path.join(FONT_DIR, f));
const DESIGN_VERSION = "2"; // bump to redraw every image after a design change

function parseCSV(text) {
  const rows = []; let row = [], field = "", q = false;
  text = text.replace(/^﻿/, "");
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else q = false; } else field += c; }
    else if (c === '"') q = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n" || c === "\r") { if (c === "\r" && text[i + 1] === "\n") i++; row.push(field); rows.push(row); row = []; field = ""; }
    else field += c;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  return rows.filter(r => r.some(v => v.trim() !== ""));
}
const slugify = s => s.toUpperCase().replace(/[^A-Z0-9.]+/g, "-").replace(/^-+|-+$/g, "") || "PART";
const x = s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" }[c]));

// Rough text width for Inter, used to shrink long part numbers and wrap the description
const charW = (ch, size) => size * (/[A-Z0-9]/.test(ch) ? 0.66 : /[il.,:;'|!]/.test(ch) ? 0.3 : /[\s]/.test(ch) ? 0.28 : 0.55);
const textW = (s, size) => [...s].reduce((w, ch) => w + charW(ch, size), 0);
function wrap(text, size, maxW, maxLines) {
  const words = text.split(/\s+/); const lines = []; let cur = "";
  for (const w of words) {
    const t = cur ? cur + " " + w : w;
    if (textW(t, size) <= maxW) cur = t;
    else { if (cur) lines.push(cur); cur = w; if (lines.length === maxLines) break; }
  }
  if (cur && lines.length < maxLines) lines.push(cur);
  if (lines.length === maxLines && words.join(" ").length > lines.join(" ").length) lines[maxLines - 1] = lines[maxLines - 1].replace(/\s*\S*$/, "") + "…";
  return lines;
}

function svgFor(p, photo) {
  const W = 1200, H = 630, left = 72, textMax = photo ? 640 : 1056;
  let pnSize = 84; while (textW(p.pn, pnSize) > textMax && pnSize > 40) pnSize -= 2;
  const pnLines = textW(p.pn, pnSize) > textMax ? wrap(p.pn.replace(/([\/(-])/g, "$1 "), pnSize, textMax, 2).map(l => l.replace(/([\/(-]) /g, "$1")) : [p.pn];
  const descLines = wrap(p.desc.replace(/\.$/, ""), 30, textMax, 2);
  let y = 210;
  const pnSvg = pnLines.map((l, i) => `<text x="${left}" y="${y + i * (pnSize + 6)}" font-family="Inter" font-weight="700" font-size="${pnSize}" fill="#ffffff">${x(l)}</text>`).join("");
  y += (pnLines.length - 1) * (pnSize + 6) + 64;
  const mfrSvg = `<text x="${left}" y="${y}" font-family="Inter" font-weight="500" font-size="36" fill="#9fc0ff">${x(p.mfr)}</text>`;
  y += 58;
  const descSvg = descLines.map((l, i) => `<text x="${left}" y="${y + i * 42}" font-family="Inter" font-size="30" fill="#d7e2f3">${x(l)}</text>`).join("");
  const photoSvg = photo ? `<rect x="776" y="125" width="352" height="352" rx="24" fill="#ffffff"/><image x="796" y="145" width="312" height="312" href="${photo}" preserveAspectRatio="xMidYMid meet"/>` : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="#13294b"/>
  <rect x="${left}" y="74" width="168" height="48" rx="24" fill="#e7f5ee"/>
  <path d="M${left + 24} 98 l9 9 l17 -19" fill="none" stroke="#157347" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>
  <text x="${left + 60}" y="107" font-family="Inter" font-weight="700" font-size="24" fill="#157347">In stock</text>
  ${pnSvg}${mfrSvg}${descSvg}${photoSvg}
  <rect x="0" y="${H - 86}" width="${W}" height="86" fill="#0b1a31"/>
  <rect x="${left}" y="${H - 64}" width="42" height="42" rx="9" fill="#ffffff"/>
  <text x="${left + 21}" y="${H - 33}" text-anchor="middle" font-family="Inter" font-weight="700" font-size="26" fill="#16325c">Z</text>
  <text x="${left + 58}" y="${H - 33}" font-family="Inter" font-weight="700" font-size="28" fill="#ffffff">Ziheng International</text>
  <text x="${W - left}" y="${H - 33}" text-anchor="end" font-family="Inter" font-weight="500" font-size="26" fill="#9fb7dc">ziheng-int.com · Request a quote</text>
</svg>`;
}

const rows = parseCSV(fs.readFileSync(path.join(ROOT, "data", "inventory.csv"), "utf8"));
const h = rows[0].map(s => s.trim().toLowerCase());
const iPn = h.indexOf("part number"), iM = h.indexOf("manufacturer"), iD = h.indexOf("description"), iShow = h.findIndex(s => s.startsWith("show"));
const manifest = fs.existsSync(MANIFEST) ? JSON.parse(fs.readFileSync(MANIFEST, "utf8")) : {};
const imgs = fs.existsSync(IMG_DIR) ? fs.readdirSync(IMG_DIR) : [];
fs.mkdirSync(OUT, { recursive: true });
const keep = new Set(); let made = 0;
for (const r of rows.slice(1)) {
  const pn = (r[iPn] || "").trim(); if (!pn) continue;
  if (/^(no|n|false|0|hide)$/i.test((r[iShow] || "").trim())) continue;
  const p = { pn, mfr: (r[iM] || "").trim(), desc: (r[iD] || "").trim(), slug: slugify(pn) };
  keep.add(p.slug);
  const imgFile = imgs.find(n => /\.(jpe?g|png)$/i.test(n) && n.replace(/\.[^.]+$/, "").toUpperCase() === p.slug);
  const imgBuf = imgFile ? fs.readFileSync(path.join(IMG_DIR, imgFile)) : null;
  const hash = crypto.createHash("sha1").update([DESIGN_VERSION, p.pn, p.mfr, p.desc, imgBuf ? crypto.createHash("sha1").update(imgBuf).digest("hex") : ""].join("|")).digest("hex");
  const outFile = path.join(OUT, p.slug + ".png");
  if (manifest[p.slug] === hash && fs.existsSync(outFile)) continue;
  const photo = imgBuf ? `data:image/${/png$/i.test(imgFile) ? "png" : "jpeg"};base64,${imgBuf.toString("base64")}` : "";
  const png = new Resvg(svgFor(p, photo), { font: { fontFiles, loadSystemFonts: false, defaultFontFamily: "Inter" }, fitTo: { mode: "width", value: 1200 } }).render().asPng();
  fs.writeFileSync(outFile, png);
  manifest[p.slug] = hash; made++;
}
for (const f of fs.readdirSync(OUT)) { const s = f.replace(/\.png$/, ""); if (!keep.has(s)) { fs.unlinkSync(path.join(OUT, f)); delete manifest[s]; } }
for (const s of Object.keys(manifest)) if (!keep.has(s)) delete manifest[s];
fs.writeFileSync(MANIFEST, JSON.stringify(manifest, null, 1) + "\n");
console.log(`Preview images: ${made} drawn, ${keep.size} parts total -> public/og/`);
