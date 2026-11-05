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
- `.github/workflows/sync-inventory.yml` copies the Google Sheet into `data/inventory.csv` daily.
- `worker/` is the Cloudflare Worker: it serves `dist/` and handles the quote form at `/api/rfq` (emails via Resend; see `docs/SEO-SETUP.md`).
- `wrangler.jsonc`: Worker settings used by Cloudflare Workers Builds.
- `scripts/filter-inventory.js`: used by the sheet sync; keeps only the approved website columns.
- `docs/SEO-SETUP.md`: one-time Google Search Console, Bing, analytics and form email setup.
- `docs/ads/`: Google Ads page feed and keyword lists, regenerated on every build.

## Cloudflare settings (Workers Builds)

- Build command: `node build.js`
- Deploy command: `npx wrangler deploy`

## Updating inventory

Edit the Google Sheet. The site updates within a day. To update immediately:
GitHub > Actions > Sync inventory > Run workflow.

To hide a part, set "Show on Website" to `No` or delete the row.

## Local preview

```bash
node build.js && python3 -m http.server 8000 -d dist
```
