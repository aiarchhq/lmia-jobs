# LMIA Job Postings in Canada — Job Bank snapshot (as of 2026-10-30)

A machine-readable snapshot of **6,321 job postings** from the Government of Canada's [Job Bank "Temporary Foreign Workers" search](https://www.jobbank.gc.ca/jobsearch/jobsearch?fsrc=32) — i.e., postings from employers who **have applied for or obtained a Labour Market Impact Assessment (LMIA)**.

## What this dataset is

| Fact | Value |
|---|---|
| Snapshot date | **2026-10-30** (single crawl; postings change daily) |
| Source | Job Bank (Employment and Social Development Canada), public search |
| Scope | Whole Temporary Foreign Worker pool, all of Canada |
| Geographic coverage | 14 provinces/territories + unspecified |
| Date range of postings | 2026-03-31 → 2026-10-30 |
| LMIA status mix | LMIA requested 6,179 · LMIA approved 140 · (none shown) 2 |
| Direct Apply available | 6,290 (99.5%) |
| Snapshot freshness | Live pool recreates daily — re-run the crawler to refresh |

## Provincial distribution

| Province | Postings | Share |
|---|---:|---:|
| ON | 1,765 | 27.9% |
| BC | 1,398 | 22.1% |
| QC | 1,191 | 18.8% |
| AB | 1,165 | 18.4% |
| MB | 227 | 3.6% |
| SK | 168 | 2.7% |
| NS | 139 | 2.2% |
| NB | 108 | 1.7% |
| unspecified | 89 | 1.4% |
| PE | 22 | 0.3% |
| NT | 21 | 0.3% |
| NL | 14 | 0.2% |
| YT | 9 | 0.1% |
| NU | 5 | 0.1% |

## LMIA status (as flagged by Job Bank)

| Status | Postings | Share |
|---|---:|---:|
| LMIA requested | 6,179 | 97.8% |
| LMIA approved | 140 | 2.2% |
| (none shown) | 2 | 0.0% |

## Top 25 occupations

| Title | Postings |
|---|---:|
| cook | 302 |
| food service supervisor | 253 |
| restaurant manager | 229 |
| home child care provider | 196 |
| home support worker | 180 |
| child caregiver - private home | 121 |
| nanny | 120 |
| carpenter | 106 |
| long haul truck driver | 100 |
| truck driver | 84 |
| food counter attendant | 68 |
| shift manager - fast food restaurant | 59 |
| restaurant assistant manager | 53 |
| food services manager | 50 |
| child care provider - private home | 50 |
| chef | 49 |
| retail store supervisor | 48 |
| store manager - retail | 44 |
| automotive service technician | 42 |
| kitchen helper | 41 |
| welder | 39 |
| construction labourer | 38 |
| family caregiver | 38 |
| drywall installer | 35 |
| landscape worker | 35 |

## Files

| File | Description |
|---|---|
| `lmia-jobs-2026-10-30.csv` | Full snapshot — one row per posting |
| `lmia-jobs.jsonl` | Raw crawl records (JSON Lines) |
| `crawl-lmia.mjs` | Zero-auth crawler used to produce the snapshot |
| `build-dataset.mjs` | Postprocessor (CSV + this README's stats) |
| `crawl.log` | Crawl progress log |

## Field dictionary

| Column | Meaning |
|---|---|
| `posting_id` | Job Bank posting URL id — jobbank.gc.ca/jobsearch/jobposting/{id} |
| `job_number` | Job Bank's human job reference |
| `title` / `employer` / `location` | As listed on Job Bank |
| `province` | 2-letter code parsed from location; blank = unspecified (often "Various locations") |
| `salary` / `salary_min` / `salary_max` / `salary_unit` | Listed wage and parsed min/max |
| `posted_date` | "Date posted" shown on the listing |
| `lmia_status` | Job Bank badge: **LMIA requested** (employer filed, decision pending) or **LMIA approved** (positive decision in hand) |
| `lmia_code` | Internal badge code the site attaches (`submitted` / `approved`) |
| `direct_apply` | Job Bank "Direct Apply" enabled — apply through Job Bank itself |
| `posted_by_employer_on_jb` | Posted directly by the employer on Job Bank |
| `telework` / `is_new` | On-site/remote label; "New" badge |
| `captured_at` / `page` | Crawl bookkeeping |

## Notes and limitations

- This pool exists **because** employers must advertise on Job Bank to obtain an LMIA; a listing is not a job offer, an approved LMIA is not a work permit, and statuses change. **Verify every posting live on Job Bank before relying on it.**
- "LMIA requested" means an application is pending — only a **positive LMIA decision issued by ESDC** can support an employer-specific work permit.
- Employers are named as published openly on Job Bank; no personal contact information is included.
- It is illegal in Canada for an employer to charge a worker for an LMIA or a job offer. Beware of anyone offering either for money — see IRCC's fraud-warnings pages.
- The snapshot reflects **one point in time**. Re-running `crawl-lmia.mjs` regenerates it (25 postings/page, robots.txt `Crawl-delay: 5` honored between every request).

## Attribution

Data generated from the Government of Canada [Job Bank](https://www.jobbank.gc.ca) public postings (Employment and Social Development Canada). This repository is an **unofficial mirror of public data** and is not affiliated with the Government of Canada.

