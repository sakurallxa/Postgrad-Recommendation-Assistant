# Search Discovery MVP

This path replaces school-specific list-page crawling with search-first URL
discovery. It discovers likely announcement detail pages, fetches only those
pages, reuses `UniversitySpider` extraction helpers, and writes backend-ready
JSONL items.

## 1. Generate Queries Only

Use this when no search API key is configured. The script will load P0/P1
schools from the backend, or from `shared/crawl-overrides.json` if the backend
is unavailable.

```bash
cd crawler
python3 scripts/search_discovery_mvp.py \
  --priority P0,P1 \
  --year-span 2 \
  --queries-only
```

Output:

- `crawler/logs/search_discovery_queries.json`

Each row contains `universityId`, `universityName`, `priority`, and `query`.
For P0 full-scope validation, write a dedicated query file:

```bash
cd crawler
python3 scripts/search_discovery_mvp.py \
  --priority P0 \
  --year-span 2 \
  --queries-only \
  --queries-output logs/search_discovery_p0_queries.json
```

## 2. Run From A Candidate File

Candidate files can be `.json`, `.jsonl`, or `.csv`. Supported fields:

- `universityId` or `universityName`
- `url` or `sourceUrl`
- `title`
- `snippet`
- `query`
- `source`

See `crawler/docs/search-discovery-candidates.example.jsonl` for a minimal
manual candidate file.

```bash
cd crawler
python3 scripts/search_discovery_mvp.py \
  --priority P0,P1 \
  --year-span 2 \
  --candidates-file logs/manual_candidates.jsonl \
  --output logs/search_discovery_items.jl \
  --summary logs/search_discovery_summary.json \
  --coverage-output logs/search_discovery_coverage.md
```

Output `search_discovery_items.jl` is line-delimited JSON using backend DTO
field names: `announcementType`, `universityId`, `sourceUrl`, `publishDate`,
`deadline`, `startDate`, `endDate`, and so on.

## 3. Free Site Discovery Or Paid Search API And Ingest

### Free site discovery

Use this when you do not want to configure a paid search API. The `site`
provider reads school websites, graduate admission websites, configured
`entryPoints`, common `sitemap.xml` / `sitemap.txt` files, common announcement
sections, and simple on-site search URLs. It then emits likely detail-page
candidates for the existing fetch/extract/ingest path.

```bash
cd crawler
python3 scripts/search_discovery_mvp.py \
  --priority P0 \
  --year-span 2 \
  --search-provider site \
  --max-queries-per-school 8 \
  --per-query 5 \
  --candidates-only \
  --candidates-output logs/search_discovery_p0_candidates.jsonl
```

`--search-provider auto` now uses paid providers only when their keys are
configured. If no `SERPAPI_API_KEY`, `SERPER_API_KEY`,
`BRAVE_SEARCH_API_KEY`, or legacy `BING_SEARCH_API_KEY` exists, it falls back
to the free `site` provider.

Recommended production-like flow is two-step: first discover and review
candidates, then fetch/ingest.

### SerpApi

Use this if you already have a SerpApi private API key.

```bash
cd crawler
export SERPAPI_API_KEY=...

python3 scripts/search_discovery_mvp.py \
  --priority P0 \
  --year-span 2 \
  --search-provider serpapi \
  --max-queries-per-school 8 \
  --per-query 5 \
  --candidates-only \
  --candidates-output logs/search_discovery_p0_candidates.jsonl
```

### Serper.dev

Create a Serper API key, then:

```bash
cd crawler
export SERPER_API_KEY=...

python3 scripts/search_discovery_mvp.py \
  --priority P0 \
  --year-span 2 \
  --search-provider serper \
  --max-queries-per-school 8 \
  --per-query 5 \
  --candidates-only \
  --candidates-output logs/search_discovery_p0_candidates.jsonl
```

### Brave Search API

Create a Brave Search API subscription token, then:

```bash
cd crawler
export BRAVE_SEARCH_API_KEY=...

python3 scripts/search_discovery_mvp.py \
  --priority P0 \
  --year-span 2 \
  --search-provider brave \
  --max-queries-per-school 8 \
  --per-query 5 \
  --candidates-only \
  --candidates-output logs/search_discovery_p0_candidates.jsonl
```

`--search-provider auto` selects the first configured key in this order:
SerpApi, Serper, Brave, legacy Bing, then free site discovery.

Fetch and ingest reviewed candidates:

```bash
cd crawler
export CRAWLER_INGEST_KEY=...
export BACKEND_BASE_URL=http://127.0.0.1:3000

python3 scripts/search_discovery_mvp.py \
  --priority P0 \
  --year-span 2 \
  --candidates-file logs/search_discovery_p0_candidates.jsonl \
  --ingest-batch-size 3 \
  --ingest
```

The ingest request posts to:

```text
POST /api/v1/crawler/ingest-camps
```

with `X-Crawler-Ingest-Key`.

Legacy Bing Search v7 is no longer suitable for new integrations because new
deployments have been retired; keep `--search-provider bing` only for old
accounts that already have a working `BING_SEARCH_API_KEY`.

## Coverage Report

Every non-`queries-only` run writes a school-level coverage report. The default
path is:

```text
crawler/logs/search_discovery_coverage.md
```

The report records per-school `candidates`, `fetched`, `emitted`,
`prefiltered`, `limitedOut`, `dropReasons`, and `errors`, so a failed school can
be diagnosed as search miss, fetch failure, or extraction/filtering failure.

## Temporary Manual Review Console

When there is no formal admin backend, start the local review console against
the latest crawler outputs:

```bash
python3 crawler/scripts/manual_review_server.py --port 8765
```

Open:

```text
http://127.0.0.1:8765
```

The console reads:

- `crawler/logs/search_discovery_site_985_items_current_summary.json`
- `crawler/logs/search_discovery_site_985_candidates_current.jsonl`
- `crawler/logs/search_discovery_site_985_items_current.jl`

It writes reviewer decisions to:

```text
crawler/logs/manual_review_decisions.jsonl
```

Use it to mark each blocked item as `valid`, `invalid`, `retry`,
`needs_proxy`, or `needs_entry`, with an optional replacement official URL.
This is a temporary crawler-side review queue, not a product admin panel.

## Notes

- This MVP intentionally ignores PDF/DOC/DOCX candidates. They are filtered
  before fetch, so HTML discovery can be validated first.
- Low-confidence extraction is expected. Backend DeepSeek fallback can refine
  fields during ingest when configured.
- The old Scrapy spider remains available for comparison, but this path should
  be used to validate whether search-first discovery fixes the `no_candidate`
  bottleneck.
- Search candidates are treated as strong hints. Some school pages use generic
  HTML titles such as `人才培养`, so the script prefers a positive candidate
  title over a generic page title and infers `pre_recommendation` from search
  titles like `接收推荐免试研究生说明`.
- If a fetched page has too little extractable body text but the candidate
  title/snippet has a strong positive signal, the script emits a low-confidence
  item using the candidate title, snippet, and source URL. This keeps dynamic or
  sparse CMS pages in the backend review/LLM fallback path instead of dropping
  them during discovery.
- Ingest is batched with `--ingest-batch-size` to avoid backend `413 Payload Too
  Large` responses when multiple full-text announcements are posted together.
- Detail text is capped by `--max-content-chars` (default `12000`) before ingest
  so a single long announcement cannot dominate the request payload.

## Probe Result

Using three official Peking University candidate pages as a small probe:

```text
targets=1 candidateCount=3 fetched=3 emitted=3 errors=0
```

The emitted items correctly separated:

- `pre_recommendation`: 北京大学智能学院2026年接收推荐免试研究生说明
- `pre_recommendation`: 北京大学物理学院关于接收2026年推荐免试研究生的说明
- `summer_camp`: 2025年北京大学物理学院优秀大学生暑期夏令营报名通知

Using a 17-URL P0 probe across seven schools:

```text
schools=7 candidates=17 fetched=16 emitted=16 errors=1
ingest processed=16 created=12 unchanged=4 skipped=0 batches=6
```

The remaining fetch error was one Zhejiang University graduate admissions page
that failed TLS negotiation with the local Python `requests` stack.
