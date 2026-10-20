# CouponDepots: static site (GitHub Pages)

Premium rebuild of coupondepots.info. Every coupon is on the homepage, each vendor has its own guide page, and the SEO/AEO setup is built in.

## Deploy
1. Create a GitHub repo (e.g. `coupondepots`) and upload the **contents of `site/`** to the repo root.
2. Settings → Pages → Deploy from branch `main` / root. Custom domain: `coupondepots.info` (the CNAME file is included). Enforce HTTPS.
3. GoDaddy DNS: A records for `@` → 185.199.108.153, 185.199.109.153, 185.199.110.153, 185.199.111.153; CNAME `www` → `<your-github-user>.github.io`. Remove the Airo/GoDaddy website A record first.
4. Google Search Console: verification meta is kept. Resubmit `https://coupondepots.info/sitemap.xml`.

## Add a new vendor
Edit `build.py`: add the brand to `BRANDS`, add its offers to `OFFERS`, and add its page copy to `STORE_CONTENT`. Then run `python3 build.py`. The homepage, store page, sitemap, llms.txt and schema all update automatically.

## Included
- One-page coupon board with filter/search, reveal-and-copy codes, ticket-style cards
- 6 store guides (`/store/{brand}-coupon-code/`), 4 blog guides, About, How we verify, Disclosure, Contact, Privacy, Terms
- JSON-LD: Organization, WebSite + SearchAction, WebPage, BreadcrumbList, FAQPage, BlogPosting, ItemList
- sitemap.xml (indexable pages only), robots.txt (AI crawlers allowed), llms.txt, a real 404.html
- Redirect pages for every old Airo URL, so no old links break
- Lazy-loaded responsive images (hero images load eagerly with fetchpriority), no frameworks, ~25 KB CSS+JS
- All 6 Awin affiliate links preserved exactly, with rel="sponsored nofollow"; Impact UTT script kept
