# Google Ads setup (search ads for part numbers)

These files are regenerated every time the site builds, so they always match the inventory.

| File | Use |
|---|---|
| `page-feed.csv` | Page feed for **Dynamic Search Ads**: one row per part page. Custom labels: category slug, `obsolete`. |
| `exact-match-keywords.txt` | Exact-match keywords for obsolete parts (the part number plus common spellings). |
| `negative-keywords.txt` | Negative keywords to block engineers and students searching for datasheets, pinouts or substitutes. |

## Suggested setup

1. Google Ads > **Tools > Shared library > Business data > Page feeds**: upload `page-feed.csv`.
2. Create a **Search** campaign, goal "Leads". Add a **Dynamic ad group** targeting the page feed.
   Start with all pages; later split by custom label (`obsolete`) to set different bids.
3. Add a normal ad group with `exact-match-keywords.txt` for the highest-value parts.
4. **Tools > Shared library > Negative keyword lists**: create a list from `negative-keywords.txt` and apply it to the campaign.
5. Locations: the countries you sell to. Language: English (add Chinese if you target China; note Google does not serve mainland China).
6. Budget: start around $10-30/day. After 4-6 weeks, compare cost per inquiry and pause what does not convert.
7. Conversions: link Google Analytics 4 (set `ga4MeasurementId` in `site.config.json`) and import the
   `generate_lead` event as a conversion. The site fires it for quote-form submissions and email, WhatsApp,
   WeChat and phone clicks.

Google Shopping is not used: it requires a visible price on each product.

**Microsoft Advertising (Bing):** use "Import from Google Ads" to copy the campaign; it reaches many corporate
users and is often cheaper per click. Its LinkedIn profile targeting (job function: purchasing, engineering) suits B2B.
