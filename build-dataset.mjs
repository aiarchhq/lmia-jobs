// Postprocess the LMIA crawl (lmia-jobs.jsonl) into publishable artifacts:
//   lmia-jobs-<date>.csv  — the full dataset (Excel-friendly UTF-8 BOM)
//   README.md             — dataset documentation, stats, attribution
// Self-contained. Usage: node build-dataset.mjs [--date=2026-10-30]

import { readFileSync, writeFileSync, existsSync, appendFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const JSONL = join(HERE, 'lmia-jobs.jsonl');
const LOG = join(HERE, 'crawl.log');
const args = process.argv.slice(2);
const dayArg = args.find((a) => a.startsWith('--date='));
const DAY = dayArg ? dayArg.split('=')[1] : new Date().toISOString().slice(0, 10);
const CSV_OUT = join(HERE, `lmia-jobs-${DAY}.csv`);

if (!existsSync(JSONL)) { console.error('no ' + JSONL); process.exit(1); }

// ---- load & dedupe (later capture wins) -------------------------------------
const rows = readFileSync(JSONL, 'utf8').split('\n').filter(Boolean)
  .map((l) => { try { return JSON.parse(l); } catch { return null; } })
  .filter(Boolean);
const byId = new Map();
for (const r of rows) byId.set(r.posting_id, r);
console.log(`loaded ${rows.length} raw rows → ${byId.size} unique postings`);

// ---- salary parsing -----------------------------------------------------------
function parseSalary(text) {
  const t = String(text || '');
  const nums = [...t.matchAll(/\$? ?([\d,]{2,}(?:\.\d+)?)/g)].map((m) => Number(m[1].replace(/,/g, '')));
  const unit = /hourly|per hour|\/ ?hour/i.test(t) ? 'hourly' : (/annually|per year|\/ ?year|annual/i.test(t) ? 'annually' : '');
  const isRange = nums.length >= 2 && /\bto\b/i.test(t);
  const min = isRange ? Math.min(nums[0], nums[1]) : nums[0];
  const max = isRange ? Math.max(nums[0], nums[1]) : nums[0];
  const s = (v) => (typeof v === 'number' && v > 0 && v < 10000000 ? String(v) : '');
  return [s(min), s(max), unit];
}

// ---- CSV ----------------------------------------------------------------------
const COLS = ['posting_id', 'job_number', 'title', 'employer', 'location', 'province', 'salary', 'salary_min', 'salary_max', 'salary_unit', 'posted_date', 'lmia_status', 'lmia_code', 'direct_apply', 'posted_by_employer_on_jb', 'is_new', 'telework', 'jobbank_url', 'captured_at', 'page'];
const esc = (v) => { const s = String(v ?? ''); return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
const csvRows = [...byId.values()].map((r) => {
  r.salary_min = r.salary_min || '';
  const [min, max, unit] = parseSalary(r.salary);
  if (!r.salary_min) { r.salary_min = min; r.salary_max = max; r.salary_unit = unit; }
  return COLS.map((c) => esc(r[c] ?? '')).join(',');
});
const csv = ['\uFEFF' + COLS.join(','), ...csvRows].join('\r\n') + '\r\n';
writeFileSync(CSV_OUT, csv);
console.log(`wrote ${CSV_OUT} (${byId.size} data rows)`);

// ---- stats ---------------------------------------------------------------------
const tally = (keyFn) => {
  const m = new Map();
  for (const r of byId.values()) { const k = keyFn(r); m.set(k, (m.get(k) || 0) + 1); }
  return [...m.entries()].sort((a, b) => b[1] - a[1]);
};
const byProv = tally((r) => r.province || 'unspecified');
const byLmia = tally((r) => r.lmia_status || '(none shown)');
const byTitle = tally((r) => String(r.title || '').toLowerCase());
const dated = [...byId.values()].filter((r) => r.posted_iso);
const dateMin = dated.length ? dated.reduce((s, r) => (r.posted_iso < s ? r.posted_iso : s), '9999-99-99') : 'n/a';
const dateMax = dated.length ? dated.reduce((s, r) => (r.posted_iso > s ? r.posted_iso : s), '') : 'n/a';
const da = [...byId.values()].filter((r) => r.direct_apply === 'yes').length;

console.log('\nby province:', byProv.map(([k, v]) => `${k}:${v}`).join('  '));
console.log('by LMIA status:', byLmia.map(([k, v]) => `${k}:${v}`).join('  '));
console.log('date range:', dateMin, '→', dateMax, '| Direct Apply:', da);
console.log('top occupations:', byTitle.slice(0, 15).map(([k, v]) => `${k}(${v})`).join(', '));

// ---- README (line-array builder — no nested template escapes) -------------------
const pct = (v) => ((v / byId.size) * 100).toFixed(1) + '%';
const number = (v) => v.toLocaleString('en-CA');
const mkTable = (pairs, cols) => pairs.map((p) => {
  let line = '| ' + p[0] + ' | ' + number(p[1]);
  if (cols === 3) line += ' | ' + pct(p[1]);
  return line + ' |';
});
const L = [];
L.push('# LMIA Job Postings in Canada — Job Bank snapshot (as of ' + DAY + ')');
L.push('');
L.push(`A machine-readable snapshot of **${number(byId.size)} job postings** from the Government of Canada's [Job Bank "Temporary Foreign Workers" search](https://www.jobbank.gc.ca/jobsearch/jobsearch?fsrc=32) — i.e., postings from employers who **have applied for or obtained a Labour Market Impact Assessment (LMIA)**.`);
L.push('');
L.push('## What this dataset is');
L.push('');
L.push('| Fact | Value |');
L.push('|---|---|');
L.push('| Snapshot date | **' + DAY + '** (single crawl; postings change daily) |');
L.push('| Source | Job Bank (Employment and Social Development Canada), public search |');
L.push('| Scope | Whole Temporary Foreign Worker pool, all of Canada |');
L.push('| Geographic coverage | ' + byProv.length + ' provinces/territories' + (byProv.length <= 13 ? '' : ' + unspecified') + ' |');
L.push('| Date range of postings | ' + dateMin + ' → ' + dateMax + ' |');
L.push('| LMIA status mix | ' + byLmia.map(([k, v]) => k + ' ' + number(v)).join(' · ') + ' |');
L.push('| Direct Apply available | ' + number(da) + ' (' + pct(da) + ') |');
L.push('| Snapshot freshness | Live pool recreates daily — re-run the crawler to refresh |');
L.push('');
L.push('## Provincial distribution');
L.push('');
L.push('| Province | Postings | Share |');
L.push('|---|---:|---:|');
L.push(...mkTable(byProv, 3));
L.push('');
L.push('## LMIA status (as flagged by Job Bank)');
L.push('');
L.push('| Status | Postings | Share |');
L.push('|---|---:|---:|');
L.push(...mkTable(byLmia, 3));
L.push('');
L.push('## Top 25 occupations');
L.push('');
L.push('| Title | Postings |');
L.push('|---|---:|');
L.push(...mkTable(byTitle.slice(0, 25), 2));
L.push('');
L.push('## Files');
L.push('');
L.push('| File | Description |');
L.push('|---|---|');
L.push('| `lmia-jobs-' + DAY + '.csv` | Full snapshot — one row per posting |');
L.push('| `lmia-jobs.jsonl` | Raw crawl records (JSON Lines) |');
L.push('| `crawl-lmia.mjs` | Zero-auth crawler used to produce the snapshot |');
L.push("| `build-dataset.mjs` | Postprocessor (CSV + this README's stats) |");
L.push('| `crawl.log` | Crawl progress log |');
L.push('');
L.push('## Field dictionary');
L.push('');
L.push('| Column | Meaning |');
L.push('|---|---|');
L.push('| `posting_id` | Job Bank posting URL id — jobbank.gc.ca/jobsearch/jobposting/{id} |');
L.push("| `job_number` | Job Bank's human job reference |");
L.push('| `title` / `employer` / `location` | As listed on Job Bank |');
L.push('| `province` | 2-letter code parsed from location; blank = unspecified (often "Various locations") |');
L.push('| `salary` / `salary_min` / `salary_max` / `salary_unit` | Listed wage and parsed min/max |');
L.push('| `posted_date` | "Date posted" shown on the listing |');
L.push('| `lmia_status` | Job Bank badge: **LMIA requested** (employer filed, decision pending) or **LMIA approved** (positive decision in hand) |');
L.push('| `lmia_code` | Internal badge code the site attaches (`submitted` / `approved`) |');
L.push('| `direct_apply` | Job Bank "Direct Apply" enabled — apply through Job Bank itself |');
L.push('| `posted_by_employer_on_jb` | Posted directly by the employer on Job Bank |');
L.push('| `telework` / `is_new` | On-site/remote label; "New" badge |');
L.push('| `captured_at` / `page` | Crawl bookkeeping |');
L.push('');
L.push('## Notes and limitations');
L.push('');
L.push('- This pool exists **because** employers must advertise on Job Bank to obtain an LMIA; a listing is not a job offer, an approved LMIA is not a work permit, and statuses change. **Verify every posting live on Job Bank before relying on it.**');
L.push('- "LMIA requested" means an application is pending — only a **positive LMIA decision issued by ESDC** can support an employer-specific work permit.');
L.push('- Employers are named as published openly on Job Bank; no personal contact information is included.');
L.push('- It is illegal in Canada for an employer to charge a worker for an LMIA or a job offer. Beware of anyone offering either for money — see IRCC\'s fraud-warnings pages.');
L.push('- The snapshot reflects **one point in time**. Re-running `crawl-lmia.mjs` regenerates it (25 postings/page, robots.txt `Crawl-delay: 5` honored between every request).');
L.push('');
L.push('## Attribution');
L.push('');
L.push('Data generated from the Government of Canada [Job Bank](https://www.jobbank.gc.ca) public postings (Employment and Social Development Canada). This repository is an **unofficial mirror of public data** and is not affiliated with the Government of Canada.');
L.push('');
writeFileSync(join(HERE, 'README.md'), L.join('\n') + '\n');
console.log('wrote README.md');
appendFileSync(LOG, `${new Date().toISOString()} postprocess: ${byId.size} unique → ${CSV_OUT} (provinces ${byProv.length}, statuses ${byLmia.length})`);
