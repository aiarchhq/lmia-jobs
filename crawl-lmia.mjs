// Crawl Job Bank's Temporary Foreign Worker (LMIA) pool — no keywords, all of
// Canada, date-sorted, into a JSONL snapshot for a public GitHub dataset.
//
// Source: https://www.jobbank.gc.ca/jobsearch/jobsearch?fsrc=32&sort=D&page=N
//   fsrc=32 = the "Temporary Foreign Workers" pool (postings where the
//             employer has applied for or obtained an LMIA).
//   sort=D  = date posted, newest first (stable pagination order).
//
// Politeness: robots.txt sets `Crawl-delay: 5` — honored between EVERY
// request, including the first, plus per-request retry with backoff.
// 25 postings/page; expected pages ≈ ceil(total/25).
//
// Legal/attribution note: public Government of Canada data; published by
// ESDC itself. Dataset README must credit Job Bank (ESDC) and carry the
// snapshot date. No contact details are extracted — posting-level fields
// only (employer names and wages are published openly on Job Bank).

import { writeFileSync, appendFileSync, readFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(HERE, '.');
const JSONL = join(OUT_DIR, 'lmia-jobs.jsonl');
const LOG = join(OUT_DIR, 'crawl.log');

const UA = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml',
  'Accept-Language': 'en-CA,en;q=0.9',
};
const CRAWL_DELAY_MS = 5000;
const PAGE_SIZE = 25;
const args = process.argv.slice(2);
const pageCapArg = args.find((a) => a.startsWith('--pages='));
const PAGE_CAP = pageCapArg ? Math.max(1, Number(pageCapArg.split('=')[1])) : Infinity;

function log(msg) {
  const line = `${new Date().toISOString()} ${msg}`;
  console.log(line);
  appendFileSync(LOG, line + '\n');
}
function decode(s) { return s.replace(/&#x27;|&#39;|&apos;/g, "'").replace(/&quot;/g, '"').replace(/&#233;|&#xE9;/g, 'é').replace(/&egrave;|&#232;|&#xE8;/g, 'è').replace(/&egrave;/g, 'è').replace(/&agrave;|&#224;|&#xE0;/g, 'à').replace(/&acirc;|&#226;|&#xE2;/g, 'â').replace(/&eacute;/g, 'é').replace(/&#xC7;/g, 'Ç').replace(/&#x274;/g, 'œ').replace(/&#(x[0-9a-fA-F]+|\d+);/g, (_, n) => { try { return String.fromCodePoint(parseInt(n[0] === 'x' ? n.slice(1) : n, n[0] === 'x' ? 16 : 10)); } catch { return ''; } }).replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').replace(/&nbsp;/g, ' ').trim(); }
function stripTags(s) {
  let prev, out = String(s);
  do { prev = out; out = out.replace(/<[^>]+>/g, ''); } while (out !== prev);
  return decode(out.replace(/[<>]/g, '').replace(/\s+/g, ' '));
}

async function fetchPage(url, attempt = 1) {
  try {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), 60000);
    const r = await fetch(url, { headers: UA, signal: ctl.signal });
    clearTimeout(t);
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return await r.text();
  } catch (e) {
    if (attempt >= 4) throw e;
    const wait = attempt * 15000;
    log(`retry attempt ${attempt} in ${wait / 1000}s: ${e.message}`);
    await sleep(wait);
    return fetchPage(url, attempt + 1);
  }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---- parse one results page ------------------------------------------------
function parseCards(html) {
  const chunks = html.split(/<article id="article-/).slice(1)
    .map((c) => c.slice(0, c.indexOf('</article>') >= 0 ? c.indexOf('</article>') : c.length));
  return chunks.map((chunk) => {
    const clean = (re) => { const m = chunk.match(re); return m ? stripTags(m[1]) : ''; };
    const id = ((chunk.match(/^"?(\d+)/) || [])[1] || (chunk.match(/article-(\d+)/) || [])[1] || '').trim();
    const lmiaSpan = chunk.match(/<span class="jobLMIAflag (\w[\w-]*)[^>]*>/i);
    const lmiaHidden = chunk.match(/<input[^>]*type="hidden"[^>]*value="(\w+)"/i);
    const code = (lmiaSpan ? lmiaSpan[1] : (lmiaHidden ? lmiaHidden[1] : '')).toLowerCase();
    const LMIACODE = { submitted: 'LMIA requested', submited: 'LMIA requested', approved: 'LMIA approved', recognized: 'Recognized employer' };
    // fix 1: leading "Location" label leaks from the wb-inv span inside the li
    let loc = clean(/<li class="location">([\s\S]*?)<\/li>/i);
    loc = loc.replace(/^(telework\s*:|Location)\s+/i, '');
    const salRaw = clean(/<li class="salary">([\s\S]*?)<\/li>/i);
    return {
      posting_id: id,
      job_number: (clean(/<li class="source">([\s\S]*?)<\/li>/i).match(/Job number:\s*(\d+)/i) || [])[1] || '',
      title: clean(/<span class="noctitle">([\s\S]*?)<\/span>/i),
      employer: clean(/<li class="business">([\s\S]*?)<\/li>/i),
      location: loc,
      salary: salRaw.replace(/^(Salary|Salary to be negotiated)\s*/i, '').trim(),
      posted_date_raw: clean(/<li class="date">([\s\S]*?)<\/li>/i),
      lmia_status: LMIACODE[code] || '',
      lmia_code: code || '',
      direct_apply: /class="appmethod"/i.test(chunk) ? 'yes' : 'no',
      posted_by_employer_on_jb: /class="postedonJB"/i.test(chunk) ? 'yes' : 'no',
      is_new: /class="new"/i.test(chunk) ? 'yes' : 'no',
      telework: (chunk.match(/<span class="telework">([^<]*)</i) || [])[1] ? decode((chunk.match(/<span class="telework">([^<]*)</i))[1]) : '',
    };
  });
}
function province(location) { const m = location.match(/\(([A-Z]{2})\)/); return m ? m[1] : ''; }
function isoDate(raw) { const t = Date.parse(raw.trim() + ' ' + new Date().getFullYear()); return Number.isNaN(t) ? '' : new Date(t).toISOString().slice(0, 10); }
function resultsTotal(html) {
  const m = html.replace(/<[^>]+>/g, ' ').match(/([\d,]{3,})\s*results/i);
  return m ? Number(m[1].replace(/,/g, '')) : 0;
}

// ---- crawl ------------------------------------------------------------------
mkdirSync(OUT_DIR, { recursive: true });
if (!existsSync(LOG)) writeFileSync(LOG, '');
log('crawling all pages --pages=' + (Number.isFinite(PAGE_CAP) ? String(PAGE_CAP) : 'all'));

const seenIds = new Set(existsSync(JSONL) ? readFileSync(JSONL, 'utf8').split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l).posting_id; } catch { return ''; } }) : []);
log(`resume: ${seenIds.size} posting ids already captured`);

const t0 = Date.now();
let total = 0, page = 1, emptyStreak = 0, rows = 0;

while (page <= PAGE_CAP && page < 4000) {
  await sleep(CRAWL_DELAY_MS);
  const url = `https://www.jobbank.gc.ca/jobsearch/jobsearch?fsrc=32&sort=D&page=${page}`;
  if (page === 1) log('GET ' + url);
  let html;
  try { html = await fetchPage(url); }
  catch (e) { log(`PAGE ${page} FAILED permanently: ${e.message}`); break; }

  if (page === 1) {
    total = resultsTotal(html);
    log(`results total: ${total} → expecting ≈ ${Math.ceil(total / PAGE_SIZE)} pages`);
  }
  const cards = parseCards(html);
  const fresh = cards.filter((c) => c.posting_id && !seenIds.has(c.posting_id));
  for (const c of fresh) {
    c.province = province(c.location);
    c.posted_iso = isoDate(c.posted_date_raw);
    c.jobbank_url = `https://www.jobbank.gc.ca/jobsearch/jobposting/${c.posting_id}`;
    c.captured_at = new Date().toISOString();
    c.page = page;
    appendFileSync(JSONL, JSON.stringify(c) + '\n');
    seenIds.add(c.posting_id);
  }
  rows += fresh.length;
  log(`page ${page}: ${cards.length} cards, ${fresh.length} new (total ${rows}) | elapsed ${((Date.now() - t0) / 60000).toFixed(1)}m`);

  if (cards.length === 0 || fresh.length === 0) { emptyStreak++; if (emptyStreak >= 2) { log('two consecutive empty pages — stopping'); break; } }
  else emptyStreak = 0;
  if (cards.length < PAGE_SIZE) { log('short page — end of pool'); break; }
  if (total && rows >= total) { log('captured >= reported total'); break; }
  page++;
}
log(`DONE: ${rows} postings captured into ${JSONL} | elapsed ${((Date.now() - t0) / 60000).toFixed(1)}m`);
