# ziheng-int.com

Static website for Ziheng International: a home page, a searchable inventory, and one page per part number.

## How it works

- `data/inventory.csv` holds the parts (Part Number, Manufacturer, Category, Description, Date Code, Show on Website).
  It contains **public information only**: never add quantity, cost or buyer data.
- `site.config.json` holds the company name, email, WeChat, WhatsApp, phone, address and About text.
  Empty fields are hidden on the site.
- `node build.js` generates the site into `dist/` (no dependencies to install).
- Cloudflare Pages runs the build on every push to `main`.
- `.github/workflows/sync-inventory.yml` copies the Google Sheet into `data/inventory.csv` daily.

## Cloudflare Pages settings

- Framework preset: None
- Build command: `node build.js`
- Build output directory: `dist`

## Updating inventory

Edit the Google Sheet. The site updates within a day. To update immediately:
GitHub > Actions > Sync inventory > Run workflow.

To hide a part, set "Show on Website" to `No` or delete the row.

## Local preview

```bash
node build.js && python3 -m http.server 8000 -d dist
```
