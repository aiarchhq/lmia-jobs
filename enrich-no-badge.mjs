// Enrich postings whose search-card carried no LMIA badge: fetch each TFW
// posting page and read its explicit LMIA-status statement. Appends UPDATED
// rows to lmia-jobs.jsonl — build-dataset.mjs keeps the later capture (later
// wins dedupe), so the original raw rows remain as history.
// robots.txt Crawl-delay: 5 honored between every request.

import { readFileSync, appendFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const JSONL = join(HERE, 'lmia-jobs.jsonl');
const DELAY = 5000;
const UA = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36', 'Accept': 'text/html' };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const rows = readFileSync(JSONL, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
const latest = new Map();
for (const r of rows) latest.set(r.posting_id, r);
const noStatus = [...latest.values()].filter((r) => !r.lmia_status);
console.log(`enriching ${noStatus.length} postings without a card badge...`);

function classify(html) {
  const text = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
  const grab = (label) => {
    const i = text.indexOf(label);
    return i >= 0 ? { found: true, ctx: text.slice(Math.max(0, i - 260), i + 420).replace(/\s+/g, ' ').trim() } : { found: false, ctx: null };
  };
  const approved = grab('approved Labour Market Impact Assessment');
  if (approved.found) return { lmia_status: 'LMIA approved', lmia_code: 'approved', lmia_note: approved.ctx };
  // LMIA Online wording for a filed/pending application
  const requested = grab('requested Labour Market Impact Assessment') || grab('applied for a Labour Market Impact Assessment') || grab('LMIA');
  if (requested.found) return { lmia_status: 'LMIA requested', lmia_code: 'submitted', lmia_note: requested.ctx };
  return { lmia_status: '', lmia_code: '', lmia_note: null, unparsed: 'yes' };
}

const t0 = Date.now();
let updated = 0, approved = 0, failed = 0;
for (let i = 0; i < noStatus.length; i++) {
  const r = noStatus[i];
  await sleep(DELAY);
  let result = { lmia_status: '', lmia_code: '', lmia_note: null, unparsed: 'yes' };
  try {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 60000);
    const res = await fetch(`https://www.jobbank.gc.ca/jobsearch/jobpostingtfw/${r.posting_id}`, { headers: UA, signal: ctl.signal });
    clearTimeout(timer);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    result = classify(await res.text());
  } catch (e) {
    failed++;
    console.log(`${i + 1}/${noStatus.length} ${r.posting_id} FETCH FAILED ${e.message}`);
    continue;
  }
  if (result.lmia_status || !result.unparsed) {
    const out = { ...r };
    if (result.lmia_status) { out.lmia_status = result.lmia_status; out.lmia_code = result.lmia_code; updated++; if (result.lmia_status === 'LMIA approved') approved++; }
    if (result.ctx || result.lmia_note) out.lmia_note = result.lmia_note || '';
    appendFileSync(JSONL, JSON.stringify(out) + '\n');
  }
  if ((i + 1) % 25 === 0 || i === noStatus.length - 1) {
    console.log(`${i + 1}/${noStatus.length} done | statuses filled: ${updated} (approved ${approved}) | failures ${failed} | elapsed ${((Date.now() - t0) / 60000).toFixed(1)}m`);
  }
}
console.log(`ENRICH DONE: ${noStatus.length} checked, ${updated} statuses added, ${approved} approved, ${failed} fetch failures`);
