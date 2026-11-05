# ziheng-int.com

Static website for Ziheng International: a home page, a searchable inventory, and one page per part number,
in English (`/`) and Chinese (`/cn/`), with a language switch on every page.

## How it works

- `data/inventory.csv` holds the parts (Part Number, Manufacturer, Category, Description, Date Code, Show on Website,
  Lifecycle, Alternate Part Numbers, Manufacturer Page). The Grade / Screening, SMD Number and NSN columns are internal
  only and are not shown on the website.
  It contains **public information only**: never add quantity, cost or buyer data.
- Chinese text: the inventory's `Description (Chinese)` column, `zh` in `site.config.json`, and the translation tables in `build.js`.
- `site.config.json` holds the company name, email, WeChat, WhatsApp, phone, address and About text.
  Empty fields are hidden on the site.
- `node build.js` generates the site into `dist/` (no dependencies to install).
- Cloudflare Workers Builds runs the build and deploy on every push to `main`.
- `.github/workflows/sync-inventory.yml` copies the Google Sheet into `data/inventory.csv` weekly (Mondays).
- `worker/` is the Cloudflare Worker: it serves `dist/` and handles the quote form at `/api/rfq` (emails via Resend; see `docs/SEO-SETUP.md`).
- `wrangler.jsonc`: Worker settings used by Cloudflare Workers Builds.
- `scripts/filter-inventory.js`: used by the sheet sync; keeps only the approved website columns.
- `docs/SEO-SETUP.md`: one-time Google Search Console, Bing, analytics and form email setup.
- `docs/ads/`: Google Ads page feed and keyword lists, regenerated on every build.
- `data/specs.csv`: package / pins / temperature per part (shown in each part page's Specifications section);
  `docs/specs-review.xlsx` marks which values still need checking.
- `public/og/` + `scripts/og-images.js`: link-preview images per part (`npm install && npm run og`); the weekly sync redraws changed ones.
- `docs/listing-kit.csv` + `docs/LISTING-KIT.md`: ready-to-paste links per part for BrokerForum, LinkedIn, WeChat, WhatsApp and email.
- `data/lastmod.json`: per-page change dates used in the sitemap (updated by the build; commit it).
- Product series pages (`/series/...`) are defined in the `SERIES` list in `build.js`.
- `data/xref.json`: base-number pages (`/xref/<base>/`) with ordering-code decoders and variant lists, also shown as
  variant tables on series pages; `docs/xref-review.xlsx` is the checklist. Restore point before this feature:
  branch `backup-before-xref-pages`.

## Cloudflare settings (Workers Builds)

- Build command: `node build.js`
- Deploy command: `npx wrangler deploy`

## Updating inventory

Edit the Google Sheet. The site updates every Monday. To update immediately:
GitHub > Actions > Sync inventory > Run workflow.

To hide a part, set "Show on Website" to `No` or delete the row.

## Local preview

```bash
node build.js && python3 -m http.server 8000 -d dist
```
