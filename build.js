// Static site generator for ziheng-int.com. No dependencies: `node build.js` -> dist/
// English pages at /..., Chinese pages at /cn/... (same paths otherwise), linked with hreflang.
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
const colExact = name => header.findIndex(h => h === name);
const C = {
  pn: col("part"), mfr: col("manufacturer"), cat: col("category"), desc: colExact("description"), descZh: col("description (chinese)"),
  dc: col("date"), show: col("show"), grade: col("grade"), life: col("lifecycle"), smd: col("smd"), nsn: col("nsn"),
  alt: col("alternate"), mpage: col("manufacturer page"),
};
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
    descZh: get(r, C.descZh),
    dc: get(r, C.dc),
    grade: get(r, C.grade),
    life: get(r, C.life),
    smd: get(r, C.smd),
    nsn: get(r, C.nsn),
    altManual: get(r, C.alt).split(/[,;\n]+/).map(x => x.trim()).filter(Boolean),
    mpage: /^https?:\/\//.test(get(r, C.mpage)) ? get(r, C.mpage) : "",
  });
}
parts.sort((a, b) => a.pn.localeCompare(b.pn, "en", { numeric: true }));

// Spelling variants buyers type for the same part number (OP07AZ/883 -> OP07AZ883, OP07AZ-883 ...)
function aliases(p) {
  const out = new Set();
  const add = v => { v = v.trim(); if (v && v.toUpperCase() !== p.pn.toUpperCase()) out.add(v); };
  const pieces = /[()]/.test(p.pn) ? p.pn.split(/[()]/).map(x => x.trim()).filter(x => x.length > 4) : [p.pn];
  for (const x of pieces) {
    add(x);
    add(x.replace(/[\/\s#:+]+/g, "-").replace(/-+/g, "-").replace(/-$/, ""));
    add(x.replace(/[^A-Za-z0-9]/g, ""));
    add(x.replace(/[\/#:+\s]/g, ""));
  }
  for (const x of p.altManual) add(x);
  return [...out].filter(v => !/[()]/.test(v)).slice(0, 10);
}
for (const p of parts) p.aliases = aliases(p);

// Part photos: drop a file named <slug>.jpg / .png / .webp into public/images/parts/
const IMG_DIR = path.join(ROOT, "public", "images", "parts");
const imgFiles = fs.existsSync(IMG_DIR) ? fs.readdirSync(IMG_DIR) : [];
for (const p of parts) {
  const f = imgFiles.find(n => /\.(jpe?g|png|webp)$/i.test(n) && n.replace(/\.[^.]+$/, "").toUpperCase() === p.slug);
  p.img = f ? `/images/parts/${f}` : "";
}

const groupBy = (arr, k) => arr.reduce((m, p) => (m.get(p[k]) ? m.get(p[k]).push(p) : m.set(p[k], [p]), m), new Map());
const cats = [...groupBy(parts, "cat")].sort((a, b) => b[1].length - a[1].length);
const mfrs = [...groupBy(parts, "mfr")].sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]));
const byCat = groupBy(parts, "cat");
const eolParts = parts.filter(p => p.life);

// ---------- Translations ----------
// Former / current owner names, so pages match searches for either brand (Chinese adds the Chinese brand name)
const MFR_ALSO = {
  en: {
    "Maxim Integrated": "now part of Analog Devices", "Microsemi": "now part of Microchip Technology",
    "International Rectifier": "now part of Infineon Technologies", "Intersil (Renesas)": "now part of Renesas Electronics",
    "IDT (Renesas)": "Integrated Device Technology, now part of Renesas Electronics", "Avago (Broadcom)": "Avago Technologies, now Broadcom",
    "Atmel (Microchip)": "now part of Microchip Technology", "Altera (Intel)": "Altera, formerly part of Intel", "Xilinx (AMD)": "now part of AMD",
    "Freescale (NXP)": "now part of NXP Semiconductors", "National Semiconductor": "now part of Texas Instruments",
    "Harris / Intersil": "Harris Semiconductor, later Intersil, now Renesas", "Teledyne e2v": "Teledyne e2v (formerly e2v technologies)",
    "Data Device Corp. (DDC)": "Data Device Corporation", "Device Engineering Inc. (DEI)": "Device Engineering Incorporated",
  },
  zh: {
    "Texas Instruments": "德州仪器 TI", "Analog Devices": "亚德诺半导体 ADI", "Maxim Integrated": "美信，现属亚德诺半导体 ADI",
    "Microsemi": "美高森美，现属微芯科技 Microchip", "International Rectifier": "国际整流器 IR，现属英飞凌 Infineon",
    "Intersil (Renesas)": "英特矽尔，现属瑞萨电子 Renesas", "IDT (Renesas)": "艾迪悌 IDT，现属瑞萨电子 Renesas",
    "Avago (Broadcom)": "安华高，现为博通 Broadcom", "Atmel (Microchip)": "爱特梅尔，现属微芯科技 Microchip",
    "Altera (Intel)": "阿尔特拉 Altera", "Xilinx (AMD)": "赛灵思，现属 AMD", "Freescale (NXP)": "飞思卡尔，现属恩智浦 NXP",
    "National Semiconductor": "美国国家半导体，现属德州仪器 TI", "Harris / Intersil": "哈里斯半导体，后为英特矽尔，现属瑞萨",
    "Micron": "美光", "STMicroelectronics": "意法半导体 ST", "Intel": "英特尔", "Lattice Semiconductor": "莱迪思",
    "NXP": "恩智浦", "Infineon": "英飞凌", "Broadcom": "博通", "Vicor": "怀格",
  },
};
const CAT_ZH = {
  "Logic ICs": "逻辑芯片", "Amplifiers & Comparators": "放大器与比较器", "Avionics Data Bus (ARINC 429 / 1553)": "航空数据总线（ARINC 429 / 1553）",
  "Interface ICs": "接口芯片", "DC-DC Converter Modules": "DC-DC 电源模块", "Programmable Logic (FPGA / CPLD / PLD)": "可编程逻辑（FPGA / CPLD / PLD）",
  "Memory": "存储器", "Diodes & TVS": "二极管与 TVS", "Microcontrollers & Processors": "微控制器与处理器", "Power MOSFETs": "功率 MOSFET",
  "Voltage Regulators": "稳压器", "Optocouplers": "光耦", "Analog Switches & Multiplexers": "模拟开关与多路复用器",
  "Supervisors & Monitors": "监控与复位芯片", "Other Components": "其他元器件", "Drivers & Darlington Arrays": "驱动器与达林顿阵列",
  "Voltage References": "电压基准", "Data Converters": "数据转换器（ADC/DAC）", "Displays & LED Drivers": "显示器与 LED 驱动",
  "Power Transistors": "功率晶体管", "Connectors": "连接器", "Sensors": "传感器", "Clock & Timing": "时钟与定时",
};
const LIFE_ZH = { "Obsolete / EOL": "已停产 / EOL", "Mature (EOL risk)": "成熟期（有停产风险）" };

const T = {
  en: {
    htmlLang: "en", ogLocale: "en_US", prefix: "", other: "zh", switchLabel: "中文", switchTitle: "切换到中文",
    nav: [["/parts/", "Inventory"], ["/obsolete-parts/", "Obsolete"], ["/quality/", "Quality"], ["/about/", "About"], ["/contact/", "Contact"]],
    cat: c => c, life: l => l, desc: p => p.desc,
    inStock: "In stock", home: "Home", inventory: "Inventory",
    homeTitle: c => `${c} | Obsolete & Hard-to-Find Electronic Components`,
    homeDesc: (c, top) => `${c}: ${cfg.tagline}. Integrated circuits in stock from manufacturers including ${top}. Request a quote.`,
    eyebrow: "Independent electronic component distributor", heroH1: "Hard-to-find &amp; obsolete ICs. In stock.",
    heroLead: "Integrated circuits and electronic components from leading manufacturers, held in our own stock. Search by part number, then contact us for a fast quote.",
    searchPh: "Enter a part number, e.g. HCPL-5731", searchBtn: "Search stock",
    specialties: "Our specialties", invTile: ["Full inventory", "Search every part we hold in stock"],
    eolTile: ["Obsolete &amp; EOL", "Discontinued and hard-to-find parts"], aviTile: ["Avionics data bus", "ARINC 429 and 1553 interface ICs"],
    byCat: "Browse by category", byMfr: "Browse by manufacturer",
    ctaH: "Can't find your part?", ctaP: "Our listed stock changes often. Send us the part number and quantity you need.",
    invTitle: "Electronic Components in Stock", invDesc: n => `Full list of ${n} integrated circuits and electronic components in stock at ${cfg.companyName}. Contact us for a quote.`,
    invH1: "Inventory", invLead: "All parts below are in stock. Click a part number for details and to request a quote.",
    filterPh: "Filter by part number, manufacturer or keyword", partsN: n => `${n} part${n === 1 ? "" : "s"}`,
    thPn: "Part number", thMfr: "Manufacturer", thCat: "Category", thDesc: "Description", thStatus: "Status",
    allCats: "All categories", allMfrs: "All manufacturers", clearFilters: "Clear filters", filterCat: "Filter by category", filterMfr: "Filter by manufacturer",
    noMatch: "No match in our listed stock.", noMatchLink: "Email us the part number", noMatchTail: ", as we may still be able to source it.",
    listTitle: name => `${name} in Stock`, listDesc: (name, n, ex) => `${n} ${name} parts in stock at ${cfg.companyName}: ${ex}.`,
    andMore: " and more", listLead: (n, mfr) => `${n} part${n === 1 ? "" : "s"} in stock${mfr ? ` from ${esc(mfr)}` : ""}.`,
    partTitle: p => `${p.pn} ${p.mfr} - In Stock | ${cfg.companyName}`,
    partDesc: (p, d) => `${p.pn} by ${p.mfr} in stock. ${d}${p.dc ? ` Date code ${p.dc}.` : ""} Request a quote from ${cfg.companyName}.`,
    photoRef: "Image for reference", photoPh: "Photo on request",
    lbl: { pn: "Part number", mfr: "Manufacturer", cat: "Category", life: "Lifecycle", dc: "Date code", avail: "Availability", minfo: "Manufacturer info", minfoLink: "Product page and datasheet ↗", alias: "Also listed as" },
    rfqH: "Request a quote", rfqP: "We usually reply within one business day.", orDirect: "Or contact us directly:",
    related: c => `Related ${c} in stock`, viewAll: c => `View all ${c} →`,
    form: { pn: "Part number", qty: "Quantity", date: "Needed by", datePh: "e.g. ASAP, March", name: "Your name", company: "Company", email: "Email", country: "Country", msg: "Notes (optional)", msgPh: "Date code, packaging, other parts", send: "Send quote request" },
    btnEmail: "Email for a quote", wechatH: "Contact us on WeChat", wechatId: "WeChat ID", close: "Close",
    eolTitle: "Obsolete & EOL Electronic Components", eolH1: "Obsolete & end-of-life components",
    eolLead: n => `${n} discontinued, end-of-life and hard-to-find parts in stock for repair, sustainment and long-lifecycle programs.`,
    hubDesc: (t, n, ex) => `${n} ${t.toLowerCase()} in stock at ${cfg.companyName}, including ${ex}. Request a quote.`,
    qTitle: "Quality & Anti-Counterfeit", qH1: "Quality &amp; anti-counterfeit", qDesc: `How ${cfg.companyName} sources, inspects and documents electronic components to avoid counterfeit parts.`,
    aboutTitle: "About Us", aboutH1: c => `About ${c}`,
    contactTitle: "Contact Us", contactH1: "Contact us", contactLead: "For a quote, send us the part number, quantity and target date. We usually reply within one business day.",
    contactDesc: `Contact ${cfg.companyName} for quotes on electronic components. Email ${cfg.email}.`,
    lblEmail: "Email", lblWeChat: "WeChat", lblWhatsApp: "WhatsApp", lblPhone: "Phone", lblAddress: "Address",
    footContact: "Contact", footBrowse: "Browse", footLinks: [["/parts/", "Full inventory"], ["/#categories", "By category"], ["/#manufacturers", "By manufacturer"], ["/obsolete-parts/", "Obsolete &amp; EOL parts"], ["/quality/", "Quality &amp; anti-counterfeit"]],
    legal: c => `All trademarks belong to their respective owners. ${c} is an independent distributor and is not affiliated with the manufacturers listed.`,
    mailSubject: pn => pn ? `RFQ: ${pn}` : `Inquiry - ${cfg.companyName}`,
    mailBody: pn => pn ? `Hello ${cfg.companyName},\n\nPlease quote the following part:\n\nPart number: ${pn}\nQuantity needed: \nTarget date: \n\nCompany: \nName: \nCountry: \n\nThank you.` : `Hello ${cfg.companyName},\n\n`,
    wa: pn => pn ? `Hello, I'm interested in part ${pn}.` : "Hello, I have an inquiry.",
    text: cfg,
  },
  zh: {
    htmlLang: "zh-CN", ogLocale: "zh_CN", prefix: "/cn", other: "en", switchLabel: "EN", switchTitle: "Switch to English",
    nav: [["/parts/", "库存"], ["/obsolete-parts/", "停产器件"], ["/quality/", "质量保证"], ["/about/", "关于我们"], ["/contact/", "联系我们"]],
    cat: c => CAT_ZH[c] || c, life: l => LIFE_ZH[l] || l, desc: p => p.descZh || p.desc,
    inStock: "现货", home: "首页", inventory: "库存",
    homeTitle: c => `${c} | 停产及稀缺电子元器件现货`,
    homeDesc: (c, top) => `${c}：${(cfg.zh || cfg).tagline}。现货供应 ${top} 等品牌集成电路，欢迎询价。`,
    eyebrow: "独立电子元器件分销商", heroH1: "停产及稀缺芯片，现货供应。",
    heroLead: "自有库存的知名品牌集成电路及电子元器件。按型号搜索，联系我们即可快速报价。",
    searchPh: "输入型号，例如 HCPL-5731", searchBtn: "搜索库存",
    specialties: "主营方向", invTile: ["全部库存", "搜索我们的全部现货型号"],
    eolTile: ["停产与 EOL 器件", "已停产及稀缺器件"], aviTile: ["航空数据总线", "ARINC 429 与 1553 接口芯片"],
    byCat: "按类别浏览", byMfr: "按品牌浏览",
    ctaH: "没有找到所需型号？", ctaP: "我们的库存经常更新。请将型号和需求数量发给我们。",
    invTitle: "电子元器件现货库存", invDesc: n => `${cfg.companyName} 现货 ${n} 个集成电路及电子元器件型号完整列表。欢迎询价。`,
    invH1: "库存", invLead: "以下所有型号均有现货。点击型号查看详情并询价。",
    filterPh: "按型号、品牌或关键词筛选", partsN: n => `${n} 个型号`,
    thPn: "型号", thMfr: "品牌", thCat: "类别", thDesc: "描述", thStatus: "状态",
    allCats: "全部类别", allMfrs: "全部品牌", clearFilters: "清除筛选", filterCat: "按类别筛选", filterMfr: "按品牌筛选",
    noMatch: "现有库存中未找到该型号。", noMatchLink: "请将型号发邮件给我们", noMatchTail: "，我们可能仍可为您寻货。",
    listTitle: name => `${name} 现货`, listDesc: (name, n, ex) => `${cfg.companyName} 现货 ${n} 个${name}型号：${ex}。`,
    andMore: " 等", listLead: (n, mfr) => `${mfr ? `${esc(mfr)} ` : ""}现货 ${n} 个型号。`,
    partTitle: p => `${p.pn} ${p.mfr} 现货 | ${cfg.companyName}`,
    partDesc: (p, d) => `${p.pn}（${p.mfr}）现货。${d}${p.dc ? `批号 ${p.dc}。` : ""}欢迎向 ${cfg.companyName} 询价。`,
    photoRef: "图片仅供参考", photoPh: "可索取实物照片",
    lbl: { pn: "型号", mfr: "品牌", cat: "类别", life: "生命周期", dc: "批号", avail: "库存状态", minfo: "原厂资料", minfoLink: "产品页面及规格书 ↗", alias: "其他写法" },
    rfqH: "询价", rfqP: "我们通常在一个工作日内回复。", orDirect: "或直接联系我们：",
    related: c => `相关${c}现货`, viewAll: c => `查看全部${c} →`,
    form: { pn: "型号", qty: "数量", date: "需求时间", datePh: "例如：尽快、3 月", name: "姓名", company: "公司", email: "邮箱", country: "国家/地区", msg: "备注（选填）", msgPh: "批号、包装、其他型号", send: "提交询价" },
    btnEmail: "邮件询价", wechatH: "微信联系我们", wechatId: "微信号", close: "关闭",
    eolTitle: "停产及 EOL 电子元器件", eolH1: "停产及生命周期末期（EOL）元器件",
    eolLead: n => `现货 ${n} 个已停产、EOL 及稀缺器件，适用于维修、保障及长生命周期项目。`,
    hubDesc: (t, n, ex) => `${cfg.companyName} 现货 ${n} 个${t}，包括 ${ex}。欢迎询价。`,
    qTitle: "质量保证与防伪", qH1: "质量保证与防伪", qDesc: `${cfg.companyName} 如何采购、检验并记录电子元器件，杜绝假冒器件。`,
    aboutTitle: "关于我们", aboutH1: c => `关于 ${c}`,
    contactTitle: "联系我们", contactH1: "联系我们", contactLead: "询价请提供型号、数量及需求时间。我们通常在一个工作日内回复。",
    contactDesc: `联系 ${cfg.companyName} 获取电子元器件报价。邮箱 ${cfg.email}。`,
    lblEmail: "邮箱", lblWeChat: "微信", lblWhatsApp: "WhatsApp", lblPhone: "电话", lblAddress: "地址",
    footContact: "联系方式", footBrowse: "浏览", footLinks: [["/parts/", "全部库存"], ["/#categories", "按类别"], ["/#manufacturers", "按品牌"], ["/obsolete-parts/", "停产及 EOL 器件"], ["/quality/", "质量保证与防伪"]],
    legal: c => `所有商标归其各自所有者所有。${c} 为独立分销商，与所列原厂无隶属关系。`,
    mailSubject: pn => pn ? `询价：${pn}` : `咨询 - ${cfg.companyName}`,
    mailBody: pn => pn ? `您好，\n\n请报价以下型号：\n\n型号：${pn}\n需求数量：\n需求时间：\n\n公司：\n姓名：\n国家/地区：\n\n谢谢。` : `您好，\n\n`,
    wa: pn => pn ? `您好，我想咨询型号 ${pn}。` : "您好，我想咨询。",
    text: Object.assign({}, cfg, cfg.zh || {}),
  },
};

// ---------- HTML helpers ----------
const esc = s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const url = p => cfg.siteUrl.replace(/\/$/, "") + p;

function icon(name) {
  const d = {
    mail: '<path d="M4 6h16v12H4z"/><path d="m4 7 8 6 8-6"/>',
    chat: '<path d="M4 5h16v11H9l-5 4z"/>',
    phone: '<path d="M6 3h4l2 5-3 2a11 11 0 0 0 5 5l2-3 5 2v4a2 2 0 0 1-2 2A17 17 0 0 1 4 5a2 2 0 0 1 2-2z"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/>',
    check: '<path d="m5 12 5 5 9-10"/>',
    globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/>',
  }[name];
  return `<svg class="ic" viewBox="0 0 24 24" aria-hidden="true">${d}</svg>`;
}

const pages = []; // language-neutral paths for the sitemap
function write(L, p, html) {
  const file = path.join(OUT, L.prefix + p, "index.html");
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, html);
}

fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });
fs.cpSync(path.join(ROOT, "public"), OUT, { recursive: true });

function buildLanguage(L) {
  const X = L.text; // company text in this language
  const company = X.companyName;
  const isEn = L.htmlLang === "en";
  const lp = p => L.prefix + p; // localized path
  const mailto = pn => `mailto:${cfg.email}?subject=${encodeURIComponent(L.mailSubject(pn))}&body=${encodeURIComponent(L.mailBody(pn))}`;
  const waLink = pn => `https://wa.me/${cfg.whatsapp.replace(/[^0-9]/g, "")}?text=${encodeURIComponent(L.wa(pn))}`;
  const mfrNote = m => (isEn ? MFR_ALSO.en[m] : MFR_ALSO.zh[m]) || "";

  function contactButtons(pn) {
    let h = `<a class="btn btn-primary" href="${esc(mailto(pn))}">${icon("mail")}${L.btnEmail}</a>`;
    if (cfg.whatsapp) h += `<a class="btn" href="${esc(waLink(pn))}" target="_blank" rel="noopener">${icon("chat")}WhatsApp</a>`;
    if (cfg.wechatId) h += `<button class="btn" type="button" data-wechat>${icon("chat")}${L.lblWeChat}</button>`;
    if (cfg.phone) h += `<a class="btn" href="tel:${esc(cfg.phone.replace(/[^+0-9]/g, ""))}">${icon("phone")}${esc(cfg.phone)}</a>`;
    return `<div class="btn-row">${h}</div>`;
  }

  function layout({ title, description, p, body, jsonld, active, image }) {
    const other = T[L.other];
    const nav = L.nav.map(([h, t]) => `<a href="${lp(h)}"${active === h ? ' aria-current="page"' : ""}>${t}</a>`).join("");
    return `<!doctype html>
<html lang="${L.htmlLang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<link rel="canonical" href="${esc(url(lp(p)))}">
<link rel="alternate" hreflang="en" href="${esc(url(p))}">
<link rel="alternate" hreflang="zh-Hans" href="${esc(url("/cn" + p))}">
<link rel="alternate" hreflang="x-default" href="${esc(url(p))}">
<meta property="og:type" content="website">
<meta property="og:locale" content="${L.ogLocale}">
<meta property="og:site_name" content="${esc(company)}">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:url" content="${esc(url(lp(p)))}">
${image ? `<meta property="og:image" content="${esc(url(image))}">` : ""}
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="stylesheet" href="/styles.css">
${cfg.ga4MeasurementId ? `<script async src="https://www.googletagmanager.com/gtag/js?id=${esc(cfg.ga4MeasurementId)}"></script>
<script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag("js",new Date());gtag("config",${JSON.stringify(cfg.ga4MeasurementId)});</script>` : ""}
${jsonld ? `<script type="application/ld+json">${JSON.stringify(jsonld).replace(/</g, "\\u003c")}</script>` : ""}
</head>
<body>
<header class="site-header">
  <div class="wrap header-inner">
    <a class="brand" href="${lp("/")}"><span class="brand-mark" aria-hidden="true">Z</span><span>${esc(company)}</span></a>
    <nav class="nav">${nav}<a class="lang-switch" href="${other.prefix + p}" hreflang="${other.htmlLang}" lang="${other.htmlLang}" title="${other.switchTitle}">${icon("globe")}${L.switchLabel}</a></nav>
  </div>
</header>
<main>
${body}
</main>
<footer class="site-footer">
  <div class="wrap footer-grid">
    <div>
      <div class="brand footer-brand"><span class="brand-mark" aria-hidden="true">Z</span><span>${esc(company)}</span></div>
      <p class="muted">${esc(X.tagline)}${isEn ? "." : "。"}</p>
      <p><a href="${other.prefix + p}" hreflang="${other.htmlLang}" lang="${other.htmlLang}">${isEn ? "中文版" : "English version"}</a></p>
    </div>
    <div>
      <h2 class="footer-h">${L.footContact}</h2>
      <p><a href="${esc(mailto(""))}">${esc(cfg.email)}</a></p>
      ${cfg.phone ? `<p>${esc(cfg.phone)}</p>` : ""}
      ${cfg.wechatId ? `<p>${L.lblWeChat}: ${esc(cfg.wechatId)}</p>` : ""}
      ${cfg.address ? `<p class="muted">${esc(cfg.address)}</p>` : ""}
    </div>
    <div>
      <h2 class="footer-h">${L.footBrowse}</h2>
      ${L.footLinks.map(([h, t]) => `<p><a href="${lp(h)}">${t}</a></p>`).join("")}
    </div>
  </div>
  <div class="wrap legal muted">© ${YEAR} ${esc(company)}. ${esc(L.legal(company))}</div>
</footer>
${cfg.wechatId ? `<dialog id="wechat-dialog" class="dialog">
  <h2>${L.wechatH}</h2>
  ${cfg.wechatQr ? `<img src="${esc(cfg.wechatQr)}" alt="WeChat QR code" width="200" height="200">` : ""}
  <p>${L.wechatId}: <strong>${esc(cfg.wechatId)}</strong></p>
  <form method="dialog"><button class="btn">${L.close}</button></form>
</dialog>` : ""}
<script>window.SITE=${JSON.stringify({ email: cfg.email, company, lang: isEn ? "en" : "zh" })};</script>
<script src="/site.js" defer></script>
</body>
</html>`;
  }

  function rfqForm(pn) {
    const f = L.form, id = s => "rfq-" + s;
    return `<form class="rfq-form" data-rfq novalidate>
  <div class="field"><label for="${id("pn")}">${f.pn}</label><input id="${id("pn")}" name="part" required maxlength="80" value="${esc(pn)}" autocomplete="off"></div>
  <div class="field-row">
    <div class="field"><label for="${id("qty")}">${f.qty}</label><input id="${id("qty")}" name="quantity" inputmode="numeric" maxlength="20" required></div>
    <div class="field"><label for="${id("date")}">${f.date}</label><input id="${id("date")}" name="needed_by" maxlength="40" placeholder="${f.datePh}"></div>
  </div>
  <div class="field"><label for="${id("name")}">${f.name}</label><input id="${id("name")}" name="name" required maxlength="80" autocomplete="name"></div>
  <div class="field"><label for="${id("company")}">${f.company}</label><input id="${id("company")}" name="company" maxlength="120" autocomplete="organization"></div>
  <div class="field"><label for="${id("email")}">${f.email}</label><input id="${id("email")}" name="email" type="email" required maxlength="120" autocomplete="email"></div>
  <div class="field"><label for="${id("country")}">${f.country}</label><input id="${id("country")}" name="country" maxlength="60" autocomplete="country-name"></div>
  <div class="field"><label for="${id("msg")}">${f.msg}</label><textarea id="${id("msg")}" name="message" rows="3" maxlength="2000" placeholder="${f.msgPh}"></textarea></div>
  <div class="hp" aria-hidden="true"><label for="${id("web")}">Website</label><input id="${id("web")}" name="website" tabindex="-1" autocomplete="off"></div>
  <button class="btn btn-primary" type="submit">${f.send}</button>
  <p class="form-status small" role="status"></p>
</form>`;
  }

  function partRows(list, showCat) {
    return list.map(p => `<tr data-s="${esc([p.pn, ...p.aliases, p.mfr, MFR_ALSO.en[p.mfr] || "", MFR_ALSO.zh[p.mfr] || "", p.cat, L.cat(p.cat), p.desc, p.descZh, p.life, L.life(p.life)].join(" ").toLowerCase())}" data-cat="${catSlug(p.cat)}" data-mfr="${catSlug(p.mfr)}">
<td><a class="pn" href="${lp(`/parts/${p.slug}/`)}">${esc(p.pn)}</a></td>
<td>${esc(p.mfr)}${showCat ? `<span class="cat-mini">${esc(L.cat(p.cat))}</span>` : ""}</td>
${showCat ? `<td class="cat-cell"><a href="${lp(`/category/${catSlug(p.cat)}/`)}">${esc(L.cat(p.cat))}</a></td>` : ""}
<td class="hide-sm">${esc(L.desc(p))}</td>
<td class="hide-xs"><span class="badge">${icon("check")}${L.inStock}</span></td>
</tr>`).join("\n");
  }

  // Part table. With a filter bar: text search plus Category / Manufacturer dropdowns listing only values in this table.
  function partTable(list, withFilter) {
    const collator = new Intl.Collator(isEn ? "en" : "zh-CN", { numeric: true });
    const catOpts = [...new Set(list.map(p => p.cat))].map(c => [catSlug(c), L.cat(c)]).sort((a, b) => collator.compare(a[1], b[1]));
    const mfrOpts = [...new Set(list.map(p => p.mfr))].map(m => [catSlug(m), m]).sort((a, b) => collator.compare(a[1], b[1]));
    const showCat = catOpts.length > 1;
    const select = (id, label, all, opts) => opts.length > 1
      ? `<label class="select"><span class="sr-only">${label}</span><select id="${id}" aria-label="${label}"><option value="">${all}</option>${opts.map(([v, t]) => `<option value="${v}">${esc(t)}</option>`).join("")}</select></label>` : "";
    return `${withFilter ? `<div class="filter">
  <label class="search">${icon("search")}<input type="search" id="filter" placeholder="${L.filterPh}" autocomplete="off" aria-label="${L.filterPh}"></label>
  ${select("f-cat", L.filterCat, L.allCats, catOpts)}
  ${select("f-mfr", L.filterMfr, L.allMfrs, mfrOpts)}
  <button type="button" class="clear-filters" id="clear-filters" hidden>${L.clearFilters}</button>
  <span class="muted" id="count">${L.partsN(list.length)}</span>
</div>` : ""}
<div class="table-wrap"><table class="parts">
<thead><tr><th>${L.thPn}</th><th>${L.thMfr}</th>${showCat ? `<th class="cat-cell">${L.thCat}</th>` : ""}<th class="hide-sm">${L.thDesc}</th><th class="hide-xs">${L.thStatus}</th></tr></thead>
<tbody>${partRows(list, showCat)}</tbody>
</table></div>
<p class="muted empty" id="empty" hidden>${L.noMatch} <a href="${esc(mailto(""))}">${L.noMatchLink}</a>${L.noMatchTail}</p>`;
  }

  const crumbs = items => `<nav class="crumbs" aria-label="Breadcrumb"><a href="${lp("/")}">${L.home}</a> / ${items.map(([h, t]) => h ? `<a href="${lp(h)}">${esc(t)}</a>` : `<span>${esc(t)}</span>`).join(" / ")}</nav>`;
  const orgLd = { "@context": "https://schema.org", "@type": "Organization", name: company, url: url(lp("/")), email: cfg.email };
  const reg = (p, pr) => { if (isEn) pages.push({ p, priority: pr }); };

  // Home
  write(L, "/", layout({
    title: L.homeTitle(company),
    description: L.homeDesc(company, mfrs.slice(0, 4).map(m => m[0]).join(", ")),
    p: "/", active: "/",
    jsonld: [orgLd, { "@context": "https://schema.org", "@type": "WebSite", name: company, url: url(lp("/")), inLanguage: L.htmlLang,
      potentialAction: { "@type": "SearchAction", target: url(lp("/parts/") + "?q={search_term_string}"), "query-input": "required name=search_term_string" } }],
    body: `<section class="hero">
  <div class="wrap">
    <p class="eyebrow">${L.eyebrow}</p>
    <h1>${L.heroH1}</h1>
    <p class="lead">${L.heroLead}</p>
    <form class="hero-search" action="${lp("/parts/")}" method="get" role="search">
      <label class="search">${icon("search")}<input type="search" name="q" placeholder="${L.searchPh}" aria-label="${L.thPn}" required></label>
      <button class="btn btn-primary" type="submit">${L.searchBtn}</button>
    </form>
    <p class="hero-meta">${mfrs.slice(0, 6).map(m => `<a href="${lp(`/manufacturer/${catSlug(m[0])}/`)}">${esc(m[0])}</a>`).join(" · ")}</p>
  </div>
</section>
<section class="wrap section">
  <div class="highlights">${X.highlights.map(h => `<div class="card"><h3>${esc(h.title)}</h3><p>${esc(h.text)}</p></div>`).join("")}</div>
</section>
<section class="wrap section">
  <h2>${L.specialties}</h2>
  <div class="tiles spec-tiles">
    <a class="tile" href="${lp("/parts/")}"><span><strong>${L.invTile[0]}</strong><br><span class="muted small">${L.invTile[1]}</span></span></a>
    <a class="tile" href="${lp("/obsolete-parts/")}"><span><strong>${L.eolTile[0]}</strong><br><span class="muted small">${L.eolTile[1]}</span></span></a>
    <a class="tile" href="${lp(`/category/${catSlug("Avionics Data Bus (ARINC 429 / 1553)")}/`)}"><span><strong>${L.aviTile[0]}</strong><br><span class="muted small">${L.aviTile[1]}</span></span></a>
  </div>
</section>
<section class="wrap section" id="categories">
  <h2>${L.byCat}</h2>
  <div class="tiles">${cats.map(([c, l]) => `<a class="tile" href="${lp(`/category/${catSlug(c)}/`)}"><span>${esc(L.cat(c))}</span></a>`).join("")}</div>
</section>
<section class="wrap section" id="manufacturers">
  <h2>${L.byMfr}</h2>
  <div class="chips">${mfrs.map(([m, l]) => `<a class="chip" href="${lp(`/manufacturer/${catSlug(m)}/`)}">${esc(m)}</a>`).join("")}</div>
</section>
<section class="cta">
  <div class="wrap cta-inner">
    <div><h2>${L.ctaH}</h2><p>${L.ctaP}</p></div>
    ${contactButtons("")}
  </div>
</section>`,
  }));
  reg("/", "1.0");

  // Inventory
  write(L, "/parts/", layout({
    title: `${L.invTitle} | ${company}`, description: L.invDesc(parts.length), p: "/parts/", active: "/parts/",
    body: `<section class="wrap section page-head"><h1>${L.invH1}</h1><p class="lead">${L.invLead}</p></section>
<section class="wrap">${partTable(parts, true)}</section>`,
  }));
  reg("/parts/", "0.9");

  // Category & manufacturer pages
  for (const [kind, groups] of [["category", cats], ["manufacturer", mfrs]]) {
    for (const [name, list] of groups) {
      const shown = kind === "category" ? L.cat(name) : name;
      const note = kind === "manufacturer" ? mfrNote(name) : "";
      const p = `/${kind}/${catSlug(name)}/`;
      write(L, p, layout({
        title: `${L.listTitle(shown)} | ${company}`,
        description: L.listDesc(shown + (note ? ` (${note})` : ""), list.length, list.slice(0, 6).map(x => x.pn).join(", ") + (list.length > 6 ? L.andMore : "")),
        p,
        body: `<section class="wrap section page-head">
${crumbs([["/parts/", L.inventory], [null, shown]])}
<h1>${esc(shown)}</h1><p class="lead">${L.listLead(list.length, kind === "manufacturer" ? name : "")}${note ? ` <span class="muted">(${esc(note)})</span>` : ""}</p></section>
<section class="wrap">${partTable(list, list.length > 12)}</section>`,
      }));
      reg(p, "0.7");
    }
  }

  // Part pages
  for (const pt of parts) {
    const related = byCat.get(pt.cat).filter(x => x !== pt).slice(0, 8);
    const desc = L.desc(pt) || `${pt.pn} ${pt.mfr}`;
    const catName = L.cat(pt.cat);
    const p = `/parts/${pt.slug}/`;
    const note = mfrNote(pt.mfr);
    write(L, p, layout({
      title: L.partTitle(pt), description: L.partDesc(pt, desc), p, image: pt.img,
      jsonld: [{
        "@context": "https://schema.org", "@type": "Product", name: pt.pn, mpn: pt.pn, sku: pt.pn,
        brand: { "@type": "Brand", name: pt.mfr }, category: catName, description: desc, url: url(lp(p)),
        ...(pt.img ? { image: url(pt.img) } : {}),
        ...(pt.aliases.length ? { alternateName: pt.aliases } : {}),
      }, {
        "@context": "https://schema.org", "@type": "BreadcrumbList", itemListElement: [
          { "@type": "ListItem", position: 1, name: L.home, item: url(lp("/")) },
          { "@type": "ListItem", position: 2, name: catName, item: url(lp(`/category/${catSlug(pt.cat)}/`)) },
          { "@type": "ListItem", position: 3, name: pt.pn, item: url(lp(p)) }],
      }],
      body: `<section class="wrap section">
${crumbs([[`/category/${catSlug(pt.cat)}/`, catName], [null, pt.pn]])}
<div class="part">
  <div class="part-main">
    <div class="part-top">
    <figure class="part-photo">${pt.img
      ? `<img src="${esc(pt.img)}" alt="${esc(pt.pn + " " + pt.mfr)}" width="240" height="240" loading="eager"><figcaption>${L.photoRef}</figcaption>`
      : `<div class="photo-ph" role="img" aria-label="${L.photoPh}"><svg viewBox="0 0 64 64" aria-hidden="true"><rect x="16" y="16" width="32" height="32" rx="3"/><path d="M22 16v-6M30 16v-6M38 16v-6M46 16v-6M22 48v6M30 48v6M38 48v6M46 48v6M16 24h-6M16 32h-6M16 40h-6M48 24h6M48 32h6M48 40h6"/></svg><span>${L.photoPh}</span></div>`}</figure>
    <div>
    <span class="badge badge-lg">${icon("check")}${L.inStock}</span>
    <h1 class="part-pn">${esc(pt.pn)}</h1>
    <p class="part-mfr"><a href="${lp(`/manufacturer/${catSlug(pt.mfr)}/`)}">${esc(pt.mfr)}</a></p>
    </div>
    </div>
    <p class="lead">${esc(desc)}</p>
    <dl class="specs">
      <div><dt>${L.lbl.pn}</dt><dd>${esc(pt.pn)}</dd></div>
      <div><dt>${L.lbl.mfr}</dt><dd><a href="${lp(`/manufacturer/${catSlug(pt.mfr)}/`)}">${esc(pt.mfr)}</a>${note ? ` <span class="muted">(${esc(note)})</span>` : ""}</dd></div>
      <div><dt>${L.lbl.cat}</dt><dd><a href="${lp(`/category/${catSlug(pt.cat)}/`)}">${esc(catName)}</a></dd></div>
      ${pt.life ? `<div><dt>${L.lbl.life}</dt><dd><a href="${lp("/obsolete-parts/")}">${esc(L.life(pt.life))}</a></dd></div>` : ""}
      ${pt.dc ? `<div><dt>${L.lbl.dc}</dt><dd>${esc(pt.dc)}</dd></div>` : ""}
      <div><dt>${L.lbl.avail}</dt><dd>${L.inStock}</dd></div>
      ${pt.mpage ? `<div><dt>${L.lbl.minfo}</dt><dd><a href="${esc(pt.mpage)}" target="_blank" rel="noopener nofollow">${L.lbl.minfoLink}</a></dd></div>` : ""}
      ${pt.aliases.length ? `<div><dt>${L.lbl.alias}</dt><dd class="aliases">${pt.aliases.map(esc).join(", ")}</dd></div>` : ""}
    </dl>
  </div>
  <aside class="rfq card">
    <h2>${L.rfqH}</h2>
    <p>${L.rfqP}</p>
    ${rfqForm(pt.pn)}
    <p class="muted small or">${L.orDirect}</p>
    ${contactButtons(pt.pn)}
  </aside>
</div>
</section>
${related.length ? `<section class="wrap section"><h2>${esc(L.related(catName))}</h2>${partTable(related, false)}<p><a href="${lp(`/category/${catSlug(pt.cat)}/`)}">${esc(L.viewAll(catName))}</a></p></section>` : ""}`,
    }));
    reg(p, "0.8");
  }

  // Military & obsolete hubs
  function hub(p, title, h1, lead, list, intro) {
    write(L, p, layout({
      title: `${title} | ${company}`,
      description: L.hubDesc(title, list.length, list.slice(0, 5).map(x => x.pn).join(", ")),
      p, active: p.split("/").slice(0, 2).join("/") + "/",
      body: `<section class="wrap section page-head">
${crumbs([[null, h1]])}
<h1>${esc(h1)}</h1><p class="lead">${lead}</p>${intro || ""}</section>
<section class="wrap">${partTable(list, list.length > 12)}</section>`,
    }));
    reg(p, "0.8");
  }
  hub("/obsolete-parts/", L.eolTitle, L.eolH1, L.eolLead(eolParts.length), eolParts);

  // Quality, About, Contact
  const q = X.quality || { intro: "", steps: [], certifications: "" };
  write(L, "/quality/", layout({
    title: `${L.qTitle} | ${company}`, description: L.qDesc, p: "/quality/", active: "/quality/",
    body: `<section class="wrap section page-head narrow"><h1>${L.qH1}</h1><p class="lead">${esc(q.intro)}</p></section>
<section class="wrap section narrow"><ol class="steps">${q.steps.map(x => `<li><h2>${esc(x.title)}</h2><p>${esc(x.text)}</p></li>`).join("")}</ol>
${q.certifications ? `<p class="card">${esc(q.certifications)}</p>` : ""}</section>`,
  }));
  reg("/quality/", "0.5");

  write(L, "/about/", layout({
    title: `${L.aboutTitle} | ${company}`, description: `${L.aboutH1(company)}: ${X.tagline}`, p: "/about/", active: "/about/",
    body: `<section class="wrap section page-head narrow"><h1>${esc(L.aboutH1(company))}</h1>${X.about.map(t => `<p class="lead">${esc(t)}</p>`).join("")}</section>
<section class="wrap section"><div class="highlights">${X.highlights.map(h => `<div class="card"><h3>${esc(h.title)}</h3><p>${esc(h.text)}</p></div>`).join("")}</div></section>`,
  }));
  reg("/about/", "0.5");

  write(L, "/contact/", layout({
    title: `${L.contactTitle} | ${company}`, description: L.contactDesc, p: "/contact/", active: "/contact/",
    body: `<section class="wrap section page-head narrow"><h1>${L.contactH1}</h1>
<p class="lead">${L.contactLead}</p>
<div class="card contact-card">
  <dl class="specs">
    <div><dt>${L.lblEmail}</dt><dd><a href="${esc(mailto(""))}">${esc(cfg.email)}</a></dd></div>
    ${cfg.wechatId ? `<div><dt>${L.lblWeChat}</dt><dd>${esc(cfg.wechatId)}</dd></div>` : ""}
    ${cfg.whatsapp ? `<div><dt>${L.lblWhatsApp}</dt><dd><a href="${esc(waLink(""))}" target="_blank" rel="noopener">${esc(cfg.whatsapp)}</a></dd></div>` : ""}
    ${cfg.phone ? `<div><dt>${L.lblPhone}</dt><dd>${esc(cfg.phone)}</dd></div>` : ""}
    ${cfg.address ? `<div><dt>${L.lblAddress}</dt><dd>${esc(cfg.address)}</dd></div>` : ""}
  </dl>
  ${contactButtons("")}
</div>
<div class="card contact-card"><h2>${L.rfqH}</h2>${rfqForm("")}</div></section>`,
  }));
  reg("/contact/", "0.6");
}

// Guard: the site must not mention military / defense topics. Warn if the inventory sheet reintroduces them.
const BANNED = /military|mil-std|mil-prf|\bqml\b|defen[cs]e|aerospace|军品|军用|军工|国防|航天/i;
for (const p of parts) for (const [k, v] of [["Description", p.desc], ["Description (Chinese)", p.descZh], ["Category", p.cat]])
  if (BANNED.test(v)) console.warn(`WARNING: ${p.pn} ${k} mentions a banned topic: "${v}"`);

buildLanguage(T.en);
buildLanguage(T.zh);

// 404 (one file, both languages)
fs.writeFileSync(path.join(OUT, "404.html"), `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Page not found | ${esc(cfg.companyName)}</title><meta name="robots" content="noindex"><link rel="icon" href="/favicon.svg" type="image/svg+xml"><link rel="stylesheet" href="/styles.css"></head>
<body><main><section class="wrap section page-head narrow"><h1>Page not found</h1>
<p class="lead">This part may no longer be listed. <a href="/parts/">Search our inventory</a> or email <a href="mailto:${esc(cfg.email)}">${esc(cfg.email)}</a>.</p>
<p class="lead" lang="zh-CN">页面不存在，该型号可能已下架。<a href="/cn/parts/">搜索库存</a>，或发邮件至 <a href="mailto:${esc(cfg.email)}">${esc(cfg.email)}</a>。</p>
</section></main></body></html>`);

// sitemap (both languages, with hreflang alternates), robots
const today = new Date().toISOString().slice(0, 10);
const alt = p => `<xhtml:link rel="alternate" hreflang="en" href="${esc(url(p))}"/><xhtml:link rel="alternate" hreflang="zh-Hans" href="${esc(url("/cn" + p))}"/><xhtml:link rel="alternate" hreflang="x-default" href="${esc(url(p))}"/>`;
fs.writeFileSync(path.join(OUT, "sitemap.xml"), `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">
${pages.map(x => [x.p, "/cn" + x.p].map(u => `<url><loc>${esc(url(u))}</loc><lastmod>${today}</lastmod><priority>${x.priority}</priority>${alt(x.p)}</url>`).join("\n")).join("\n")}
</urlset>
`);
fs.writeFileSync(path.join(OUT, "robots.txt"), `User-agent: *\nAllow: /\nSitemap: ${url("/sitemap.xml")}\n`);

// Google Ads helpers (docs/ads/): Dynamic Search Ads page feed + keyword lists (English site)
const ADS = path.join(ROOT, "docs", "ads");
fs.mkdirSync(ADS, { recursive: true });
const csvq = v => `"${String(v).replace(/"/g, '""')}"`;
fs.writeFileSync(path.join(ADS, "page-feed.csv"), ["Page URL,Custom label",
  ...parts.map(p => [url(`/parts/${p.slug}/`), [catSlug(p.cat), p.life ? "obsolete" : ""].filter(Boolean).join(";")].map(csvq).join(","))].join("\n") + "\n");
const kw = new Set();
for (const p of parts.filter(p => p.life)) for (const v of [p.pn, ...p.aliases.slice(0, 2)]) kw.add(`[${v.toLowerCase()}]`);
fs.writeFileSync(path.join(ADS, "exact-match-keywords.txt"), [...kw].join("\n") + "\n");

console.log(`Built ${pages.length} pages x 2 languages (${parts.length} parts, ${cats.length} categories, ${mfrs.length} manufacturers) -> dist/`);
