/**
 * CouponDepots email-to-site coupon pipeline (Google Apps Script, runs in Shaheen's Gmail).
 *
 * Every day it:
 *   1. finds new Awin promo emails (from no-reply@awin.com) for programs you've joined,
 *   2. asks Claude Haiku to pull out the codes, discounts and dates,
 *   3. merges them into promos.json in github.com/shaheenarifch-arch/coupondepots (that commit deploys the site),
 *   4. labels each email "CD/processed" and emails you a short report.
 * It also receives deal-alert signups from the site (doPost) and saves them to a Google Sheet.
 *
 * Setup and help: automation/README.md in the repo.
 */

var CFG = {
  repo: 'shaheenarifch-arch/coupondepots',
  branch: 'main',
  path: 'promos.json',
  model: 'claude-haiku-5-5',          // Anthropic model id. Help: https://docs.claude.com/en/docs/about-claude/models
  label: 'CD/processed',
  lookbackDays: 14,
  defaultAff: 3067297,
  // Never published (brand safety): adult and cannabis programs. Add Awin merchant IDs here to block more.
  blockedMids: [131143, 113386],
  blockedWords: ['adult', 'intimate', 'sex', 'lingerie', 'cannabis', 'seeds', 'cbd', 'thc', 'vape', 'firearm'],
  reportTo: Session.getActiveUser().getEmail()
};

function props_() { return PropertiesService.getScriptProperties(); }

/** Run once from the editor: checks secrets and creates the daily 6 AM trigger. */
function setup() {
  var p = props_();
  ['GITHUB_TOKEN', 'ANTHROPIC_API_KEY'].forEach(function (k) {
    if (!p.getProperty(k)) throw new Error('Missing script property ' + k + '. See automation/README.md, step 2.');
  });
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'runDaily') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('runDaily').timeBased().atHour(6).everyDays(1).inTimezone('America/New_York').create();
  getLabel_();
  Logger.log('Daily trigger created for 6 AM Eastern. Run runDaily once now to test.');
}

function getLabel_() {
  return GmailApp.getUserLabelByName(CFG.label) || GmailApp.createLabel(CFG.label);
}

/** Main job: emails -> promos.json -> site. */
function runDaily() {
  var label = getLabel_();
  var q = 'from:no-reply@awin.com newer_than:' + CFG.lookbackDays + 'd -label:' + CFG.label.replace('/', '-');
  var threads = GmailApp.search(q, 0, 50);
  var gh = readPromos_();
  var data = gh.data;
  var report = { added: [], skipped: [], errors: [] };

  threads.forEach(function (th) {
    th.getMessages().forEach(function (m) {
      try {
        handleMessage_(m, data, report);
      } catch (err) {
        report.errors.push(m.getSubject() + ': ' + err);
      }
    });
    th.addLabel(label);
  });

  // Drop offers that ended more than 7 days ago so the file stays small (the site already hides them).
  var cutoff = isoDate_(addDays_(new Date(), -7));
  data.offers = (data.offers || []).filter(function (o) { return !o.expires || o.expires >= cutoff; });
  data.updated = isoDate_(new Date());

  if (report.added.length) writePromos_(data, gh.sha, 'Promos: ' + report.added.length + ' new code(s) from Awin emails');
  sendReport_(report, threads.length);
}

function handleMessage_(m, data, report) {
  var subject = m.getSubject();
  var mm = subject.match(/^(.+?) \((\d+)\):/);
  if (!mm) { report.skipped.push(subject + ' (not a merchant promo email)'); return; }
  var brandName = mm[1].trim(), mid = Number(mm[2]);
  var body = m.getPlainBody();
  if (body.indexOf('which you are participating in') === -1) { report.skipped.push(brandName + ' (program not joined)'); return; }
  if (CFG.blockedMids.indexOf(mid) !== -1) { report.skipped.push(brandName + ' (blocked: brand safety)'); return; }
  var affM = body.match(/publisher%2F(\d+)/);
  var aff = affM ? Number(affM[1]) : CFG.defaultAff;

  var x = extract_(brandName, subject, body, isoDate_(m.getDate()));
  if (!x || !x.offers || !x.offers.length) { report.skipped.push(brandName + ' (no code or deal in email)'); return; }
  var cat = ((x.brand && x.brand.category) || '').toLowerCase();
  if (x.brand && x.brand.unsafe || CFG.blockedWords.some(function (w) { return cat.indexOf(w) !== -1; })) {
    report.skipped.push(brandName + ' (blocked: brand safety)'); return;
  }

  var slug = slugify_(x.brand && x.brand.name || brandName);
  data.brands = data.brands || [];
  var b = data.brands.filter(function (z) { return z.mid === mid; })[0];
  if (!b) {
    var image = findImage_(x.brand && (x.brand.product_url || x.brand.site));
    if (!image) { report.skipped.push(brandName + ' (no real product image found yet)'); return; }
    b = {
      mid: mid, aff: aff, slug: slug, name: (x.brand && x.brand.name) || brandName,
      cat: mapCat_(cat), cat_label: (x.brand && x.brand.cat_label) || 'Featured brand',
      site: (x.brand && x.brand.site) || '', tagline: (x.brand && x.brand.tagline) || '',
      short: (x.brand && x.brand.short) || '', image: image
    };
    data.brands.push(b);
  }

  data.offers = data.offers || [];
  var listed = isoDate_(m.getDate());
  x.offers.forEach(function (o) {
    if (o.expires && o.expires < isoDate_(new Date())) return;            // already over
    var key = (o.code || o.title || '').toLowerCase();
    data.offers = data.offers.filter(function (z) { return !(z.mid === mid && (z.code || z.title || '').toLowerCase() === key); });
    var rec = { mid: mid, value: o.value || 'DEAL', unit: o.unit || '', title: o.title, detail: o.detail || '',
                listed: listed, source: 'Awin email ' + listed };
    if (o.code) rec.code = o.code;
    if (o.starts) rec.starts = o.starts;
    if (o.expires) rec.expires = o.expires;
    if (o.url) rec.url = o.url;
    if (o.holiday) rec.holiday = true;
    data.offers.push(rec);
    report.added.push(b.name + ': ' + (o.code || o.title));
  });
}

/** Claude Haiku turns the email into structured offers. About 1 cent per email. */
function extract_(brand, subject, body, date) {
  var key = props_().getProperty('ANTHROPIC_API_KEY');
  var prompt = 'Today is ' + isoDate_(new Date()) + '. The email was received ' + date + '.\n' +
    'Extract the coupon codes and deals a shopper can use from this affiliate promo email from "' + brand + '".\n' +
    'Rules: only codes or deals stated in the email; never invent codes or dates. Ignore commission bonuses and affiliate-only perks. ' +
    'Tracking links look like https://...awstrack.me/L0/<url-encoded real URL>/...; decode them to the real merchant URL.\n' +
    'Reply with JSON only:\n' +
    '{"brand":{"name":"","site":"https://...","product_url":"https://... one product page from the email","category":"short category","cat_label":"2-3 word shop category",' +
    '"tagline":"under 8 words","short":"one factual sentence about what the brand sells","unsafe":false},' +
    '"offers":[{"code":"exact code or empty","value":"e.g. 10% or $20","unit":"OFF","title":"short shopper-facing title",' +
    '"detail":"one short sentence of terms","starts":"YYYY-MM-DD or empty","expires":"YYYY-MM-DD or empty","url":"real landing page or empty",' +
    '"holiday":true if Black Friday, Cyber Monday, holiday or winter sale}]}\n' +
    'Set unsafe true for adult, sexual, cannabis, vaping, weapons or gambling brands.\n\nSUBJECT: ' + subject + '\n\nEMAIL:\n' + body.slice(0, 12000);
  var res = UrlFetchApp.fetch('https://api.anthropic.com/v1/messages', {
    method: 'post', contentType: 'application/json', muteHttpExceptions: true,
    headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01' },
    payload: JSON.stringify({ model: CFG.model, max_tokens: 1500, messages: [{ role: 'user', content: prompt }] })
  });
  if (res.getResponseCode() !== 200) throw new Error('Claude API ' + res.getResponseCode() + ': ' + res.getContentText().slice(0, 200));
  var text = JSON.parse(res.getContentText()).content[0].text;
  var json = text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1);
  var out = JSON.parse(json);
  (out.offers || []).forEach(function (o) {
    ['starts', 'expires', 'code', 'url'].forEach(function (k) { if (!o[k]) delete o[k]; });
  });
  out.offers = (out.offers || []).filter(function (o) { return o.title; });
  return out;
}

/** Real product photo from the merchant's own page (og:image). Required before a new brand is listed. */
function findImage_(url) {
  if (!url) return null;
  try {
    var html = UrlFetchApp.fetch(url, { muteHttpExceptions: true, followRedirects: true,
      headers: { 'User-Agent': 'Mozilla/5.0 (CouponDepots image check)' } }).getContentText();
    var m = html.match(/<meta[^>]+property=["']og:image(?::secure_url)?["'][^>]+content=["']([^"']+)["']/i) ||
            html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i);
    if (!m) return null;
    var src = m[1].replace(/^\/\//, 'https://').split('?')[0];
    if (/logo|placeholder|\.svg$/i.test(src)) return null;   // logos and drawings are not product photos
    var w = (html.match(/og:image:width["'][^>]+content=["'](\d+)/i) || [])[1];
    var h = (html.match(/og:image:height["'][^>]+content=["'](\d+)/i) || [])[1];
    var title = (html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)/i) || [])[1] || '';
    return { src: src, w: Number(w) || 1600, h: Number(h) || 1600, pos: '50% 50%', alt: title.slice(0, 110) };
  } catch (e) { return null; }
}

function mapCat_(c) {
  if (/dehumid|home|kitchen|furniture|bath|garden|clean/.test(c)) return 'home';
  if (/beauty|hair|skin|cosmetic/.test(c)) return 'beauty';
  if (/camera|lens|phone|tech|electronic|audio|computer/.test(c)) return 'tech';
  if (/fashion|apparel|cloth|shoe|jewel/.test(c)) return 'fashion';
  if (/outdoor|sport|camp|fitness/.test(c)) return 'outdoor';
  if (/travel|hotel|flight/.test(c)) return 'travel';
  if (/toy|lego|hobby|game/.test(c)) return 'hobbies';
  return 'home';
}

// ---------------------------------------------------------------- GitHub (contents API)
// Help: https://docs.github.com/rest/repos/contents#create-or-update-file-contents
function gh_(method, payload) {
  var res = UrlFetchApp.fetch('https://api.github.com/repos/' + CFG.repo + '/contents/' + CFG.path + (method === 'get' ? '?ref=' + CFG.branch : ''), {
    method: method, contentType: 'application/json', muteHttpExceptions: true,
    headers: { Authorization: 'Bearer ' + props_().getProperty('GITHUB_TOKEN'), Accept: 'application/vnd.github+json' },
    payload: payload ? JSON.stringify(payload) : null
  });
  if (res.getResponseCode() >= 300) throw new Error('GitHub ' + res.getResponseCode() + ': ' + res.getContentText().slice(0, 200));
  return JSON.parse(res.getContentText());
}

function readPromos_() {
  var f = gh_('get');
  var txt = Utilities.newBlob(Utilities.base64Decode(f.content.replace(/\n/g, ''))).getDataAsString('UTF-8');
  return { data: JSON.parse(txt), sha: f.sha };
}

function writePromos_(data, sha, message) {
  gh_('put', {
    message: message, branch: CFG.branch, sha: sha,
    content: Utilities.base64Encode(Utilities.newBlob(JSON.stringify(data, null, 2) + '\n', 'application/json').getBytes())
  });
}

// ---------------------------------------------------------------- report
function sendReport_(r, n) {
  if (!r.added.length && !r.errors.length) return;   // quiet on days with nothing new
  var lines = ['CouponDepots promo pipeline: ' + n + ' email thread(s) checked.', ''];
  lines.push('Added to the site (' + r.added.length + '):');
  r.added.forEach(function (x) { lines.push('  • ' + x); });
  if (r.skipped.length) { lines.push('', 'Skipped:'); r.skipped.forEach(function (x) { lines.push('  • ' + x); }); }
  if (r.errors.length) { lines.push('', 'Errors:'); r.errors.forEach(function (x) { lines.push('  • ' + x); }); }
  lines.push('', 'Live site: https://coupondepots.info/', 'Deploy runs: https://github.com/' + CFG.repo + '/actions');
  GmailApp.sendEmail(CFG.reportTo, 'CouponDepots: ' + r.added.length + ' new code(s) added', lines.join('\n'));
}

// ---------------------------------------------------------------- deal-alert signups (web app)
// Deploy > New deployment > Web app (Execute as: Me, Who has access: Anyone). Put the /exec URL in
// promos.json config.signup_url. Help: https://developers.google.com/apps-script/guides/web
function doPost(e) {
  var p = (e && e.parameter) || {};
  var email = String(p.email || '').trim().toLowerCase();
  if (p.website || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return ContentService.createTextOutput('ignored');
  var sheet = signupSheet_();
  var existing = sheet.getRange(1, 1, Math.max(sheet.getLastRow(), 1), 1).getValues().map(function (r) { return r[0]; });
  if (existing.indexOf(email) === -1) sheet.appendRow([email, new Date(), String(p.source || 'site').slice(0, 40), 'subscribed']);
  return ContentService.createTextOutput('ok');
}

function signupSheet_() {
  var id = props_().getProperty('SIGNUP_SHEET_ID');
  var ss = id ? SpreadsheetApp.openById(id) : null;
  if (!ss) {
    ss = SpreadsheetApp.create('CouponDepots deal alerts');
    ss.getSheets()[0].appendRow(['email', 'signed_up', 'source', 'status']);
    props_().setProperty('SIGNUP_SHEET_ID', ss.getId());
  }
  return ss.getSheets()[0];
}

// ---------------------------------------------------------------- helpers
function isoDate_(d) { return Utilities.formatDate(d, 'America/New_York', 'yyyy-MM-dd'); }
function addDays_(d, n) { var x = new Date(d.getTime()); x.setDate(x.getDate() + n); return x; }
function slugify_(s) { return String(s).toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40); }
