// Keeps ONLY the approved website columns from a downloaded sheet (CSV) and writes data/inventory.csv.
// Any other column (stock quantity, cost, price, buyers, notes...) is dropped and never reaches the website.
// Usage: node scripts/filter-inventory.js <downloaded.csv>
const fs = require("fs");
const path = require("path");

const ALLOWED = [
  "Part Number", "Manufacturer", "Category", "Description", "Description (Chinese)", "Date Code", "Show on Website",
  "Grade / Screening", "Lifecycle", "SMD Number", "NSN", "Alternate Part Numbers", "Manufacturer Page",
];

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
  return rows;
}
const csvq = v => /[",\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;

const rows = parseCSV(fs.readFileSync(process.argv[2], "utf8"));
const header = (rows[0] || []).map(h => h.trim());
const norm = s => s.toLowerCase().replace(/\s+/g, " ").trim();
const idx = ALLOWED.map(a => header.findIndex(h => norm(h) === norm(a)));
if (idx[0] < 0) { console.error("The sheet has no 'Part Number' column. Nothing was changed."); process.exit(1); }

const dropped = header.filter((h, i) => h && !idx.includes(i));
if (dropped.length) console.log("Dropped columns (not published):", dropped.join(" | "));
const missing = ALLOWED.filter((a, k) => idx[k] < 0);
if (missing.length) console.log("Columns not in the sheet (left empty):", missing.join(" | "));

const out = [ALLOWED.join(",")];
let n = 0;
for (const r of rows.slice(1)) {
  const pn = (r[idx[0]] || "").trim();
  if (!pn) continue;
  out.push(idx.map(i => csvq(i < 0 ? "" : (r[i] || "").trim())).join(","));
  n++;
}
if (n < 1) { console.error("No parts found in the sheet. Nothing was changed."); process.exit(1); }
fs.writeFileSync(path.join(__dirname, "..", "data", "inventory.csv"), out.join("\n") + "\n");
console.log(`Wrote ${n} parts to data/inventory.csv`);
