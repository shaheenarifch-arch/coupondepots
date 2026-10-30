# CouponDepots: static site (GitHub Pages)

Premium rebuild of coupondepots.info. Every coupon is on the homepage, each vendor has its own guide page, and the SEO/AEO setup is built in.

## Deploy
1. Create a GitHub repo (e.g. `coupondepots`) and upload the **contents of `site/`** to the repo root.
2. Settings → Pages → Deploy from branch `main` / root. Custom domain: `coupondepots.info` (the CNAME file is included). Enforce HTTPS.
3. GoDaddy DNS: A records for `@` → 185.199.108.153, 185.199.109.153, 185.199.110.153, 185.199.111.153; CNAME `www` → `<your-github-user>.github.io`. Remove the Airo/GoDaddy website A record first.
4. Google Search Console: verification meta is kept. Resubmit `https://coupondepots.info/sitemap.xml`.

## Add a new vendor
Edit `build.py`: add the brand to `BRANDS`, add its offers to `OFFERS`, and add its page copy to `STORE_CONTENT`. Then run `python3 build.py`. The homepage, store page, sitemap, llms.txt and schema all update automatically.

## Amazon picks (Amazon Associates, tracking ID `get786-20`)
Homepage section `#amazon-picks` (first 8 products) and the full page `/amazon-deals/` (all products, grouped by category).

To add or swap a product, edit `AMAZON_PICKS` in `build.py`:
- `asin`: the 10-character code after `/dp/` in the Amazon product URL.
- `img`: the image id from the product's main image URL (the part after `/images/I/`, before the first dot).
- `cat`: one of `home`, `hair`, `gifts`, `office` (labels live in `AMAZON_CATS`).
- Bump `AMAZON_UPDATED` / `AMAZON_UPDATED_HUMAN`, then run `python3 build.py`.

Rules ([Amazon Associates Operating Agreement](https://affiliate-program.amazon.com/help/operating/agreement)): no prices, % off or star ratings (only allowed via Amazon's Product Advertising API, which unlocks after 3 sales); no coupon codes for Amazon items; keep the line "As an Amazon Associate I earn from qualifying purchases." visible. Change the tag in one place: `AMAZON_TAG`.

## Included
- One-page coupon board with filter/search, reveal-and-copy codes, ticket-style cards
- 6 store guides (`/store/{brand}-coupon-code/`), 4 blog guides, About, How we verify, Disclosure, Contact, Privacy, Terms
- JSON-LD: Organization, WebSite + SearchAction, WebPage, BreadcrumbList, FAQPage, BlogPosting, ItemList
- sitemap.xml (indexable pages only), robots.txt (AI crawlers allowed), llms.txt, a real 404.html
- Redirect pages for every old Airo URL, so no old links break
- Lazy-loaded responsive images (hero images load eagerly with fetchpriority), no frameworks, ~25 KB CSS+JS
- All 6 Awin affiliate links preserved exactly, with rel="sponsored nofollow"; Impact UTT script kept
