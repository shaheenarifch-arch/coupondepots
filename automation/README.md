# CouponDepots email-to-site coupon pipeline

New coupon codes from your Awin promo emails go live on [coupondepots.info](https://coupondepots.info/) automatically, every day.

```
Gmail (Awin promo emails) → promo-pipeline.gs (6 AM ET) → Claude Haiku extracts codes → promos.json in this repo → deploy builds the site
```

- **Only joined programs:** emails must say "which you are participating in".
- **Brand-safe:** adult, cannabis, vaping, weapons and gambling programs are never published. Edit `blockedMids` / `blockedWords` in the script to change this.
- **Real images only:** a new brand is listed once a real product photo is found on its own site (its `og:image`). Logos and drawings are rejected.
- **Expiry:** codes disappear on their end date. Codes without a date stay up for 30 days (`DEFAULT_DAYS` in `build.py`).
- **Daily rebuild:** the deploy also runs every morning on its own, so expired codes drop off even on quiet days.
- **Cost:** Apps Script, GitHub Pages and Actions are free. Claude Haiku costs about 1¢ per promo email (roughly $1–2 a month).

## One-time setup (about 5 minutes)

1. **Create the script.** Open [script.google.com](https://script.google.com/home/projects/create) while signed in to shaheenarifch@gmail.com. Name it `CouponDepots pipeline`, paste in all of [`promo-pipeline.gs`](promo-pipeline.gs), and save.
2. **Add the two secrets.** In the script, go to Project Settings (gear icon) → Script properties → Add:
   - `GITHUB_TOKEN`: a [fine-grained token](https://github.com/settings/personal-access-tokens/new) with access to **only** `shaheenarifch-arch/coupondepots` and the permission **Contents: Read and write**. ([GitHub help](https://docs.github.com/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens))
   - `ANTHROPIC_API_KEY`: from [console.anthropic.com → API keys](https://console.anthropic.com/settings/keys).
3. **Turn it on.** Choose `setup` in the function menu, click Run and approve the Google permissions. It creates the daily 6 AM trigger and the `CD/processed` Gmail label.
4. **Test it.** Run `runDaily` once. New codes are committed to [`promos.json`](../promos.json), the [deploy](https://github.com/shaheenarifch-arch/coupondepots/actions) runs, and you get a report email.
5. **Deal-alert signups (optional, recommended).** Choose Deploy → New deployment → type **Web app**, set Execute as **Me** and Who has access **Anyone**, then click Deploy. Copy the `/exec` URL into `promos.json` → `config.signup_url`. Signups land in a Google Sheet called **CouponDepots deal alerts**. ([Apps Script web apps help](https://developers.google.com/apps-script/guides/web))

## Editing by hand

`promos.json` is plain JSON, so you can edit it on GitHub.

- **Add a code:** add an entry under `offers` with `mid` (the Awin merchant ID), `code`, `value`, `title`, `listed` and an optional `expires`.
- **Hide a brand:** add `"blocked": true` to it.

Your edit goes live on the next deploy, a few minutes after you commit.

## Troubleshooting

- **Nothing new on the site:** check the report email and the [Actions log](https://github.com/shaheenarifch-arch/coupondepots/actions). Emails already labelled `CD/processed` are skipped. Remove the label to reprocess one.
- **"GitHub 401/403":** the token expired or lacks Contents write access. Make a new one (step 2).
- **"Claude API 401":** the API key is wrong or out of credit.
