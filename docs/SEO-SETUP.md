# Search visibility setup (one-time steps)

The website already includes: one page per part with alternate spellings of the part number, former manufacturer
names, lifecycle, product structured data, a sitemap, an obsolete-parts page, a Quality page and a quote request form,
in English and Chinese. These steps connect it to search engines and tracking.

## 1. Google Search Console (free, most important)
1. Go to https://search.google.com/search-console and add a **Domain** property: `ziheng-int.com`.
2. Google shows a TXT record. Cloudflare > ziheng-int.com > **DNS** > Add record > Type TXT, Name `@`, paste the value. Save.
   Back in Search Console click **Verify** (can take a few minutes).
3. **Sitemaps** > enter `https://ziheng-int.com/sitemap.xml` > Submit.
4. After 1-2 weeks, **Performance** shows which part numbers people searched before finding you.

## 2. Bing Webmaster Tools (covers Bing, DuckDuckGo, Yahoo)
1. https://www.bing.com/webmasters > Sign in > **Import from Google Search Console** (fastest).

## 3. Fast indexing of new parts (IndexNow)
Cloudflare > ziheng-int.com > **Caching > Configuration > Crawler Hints**: turn on.
Cloudflare then tells Bing and other IndexNow search engines when pages change, so new parts get picked up quickly.

## 4. Visitor statistics
- Simple: Cloudflare > **Analytics & Logs > Web Analytics** > Add a site > `ziheng-int.com` (free, no cookies).
- For Google Ads conversion tracking: create a Google Analytics 4 property, copy its Measurement ID (`G-XXXXXXX`)
  into `ga4MeasurementId` in `site.config.json`. In GA4, mark the `generate_lead` event as a key event.
  Note: in some regions (e.g. the EU) GA4 requires a cookie consent banner; tell Claude if you need one.

## 5. Quote request form email (Resend)
Without this step the form still works: it opens the visitor's email app with the request filled in.
To receive requests directly:
1. Create a free account at https://resend.com, **Domains** > Add `ziheng-int.com`. Add the DNS records it shows in Cloudflare DNS.
2. **API Keys** > Create key (sending access).
3. Cloudflare > Workers & Pages > **ziheng-int-website** > **Settings > Variables and secrets** > Add > Type **Secret**,
   name `RESEND_API_KEY`, value = the key. Optional variables: `RFQ_TO` (default contact@ziheng-int.com), `RFQ_FROM`.
4. Send a test request from any part page. It should arrive in contact@ziheng-int.com within a minute.

## 6. China (optional)
Google is not used in mainland China. For domestic buyers, submit the site at https://ziyuan.baidu.com (Baidu)
and consider listing stock on Chinese platforms. Baidu indexes sites hosted outside China slowly.

## 7. Links from other sites
Add your website link to: your TBF/BrokerForum profile and any other broker marketplace (NetComponents, IC Source), LinkedIn company page, ERAI profile (if a member), Thomasnet and industry directories.

## 8. Fill in the data that helps ranking
In the inventory sheet: **Alternate Part Numbers**, and replace every "[Placeholder]" text in
`site.config.json` (About, Quality, highlights) with real information.
