# job-crawler

Daily crawl of public job boards (Greenhouse, Ashby, Lever, Workable, Recruitee, Personio, SmartRecruiters) for senior engineering and leadership roles that can be done from Portugal. The results feed the Role Radar page; the Claude scan reads `data/new_matches.json` each morning, checks every posting and scores fit.

No dependencies, Node 20+.

```
npm test           # filter and parser tests
npm run crawl      # crawl every company in data/companies.json
node src/crawl.mjs --only ashby:pliant,greenhouse:monzo   # a few boards
```

## How it works

1. `data/companies.json` lists the boards to read: `{ name, ats, slug, domain }`. `ats` is one of `greenhouse`, `greenhouse-eu`, `ashby`, `lever`, `lever-eu`, `workable`, `recruitee`, `personio`, `smartrecruiters`. Add a company by adding a line; set `"disabled": true` to skip one.
2. `src/fetchers.mjs` reads each board's public JSON/XML feed and normalizes the jobs.
3. `src/filters.mjs` keeps a job when:
   - **title** is a senior tech role (staff/principal/lead/manager/head/director/VP/CTO/architect, backend, blockchain, chief of staff, solutions engineer), and not DevOps/SRE/security/QA/frontend/mobile/data science/sales/product etc.;
   - **location**, read from the posting's own location fields and description, allows Portugal: Portugal/Lisbon/Porto, Europe/EU/EMEA, worldwide, a time-zone window that covers UTC+0/+1, or remote with no country restriction. Hybrid or on-site roles are kept only in Portugal.
4. `src/crawl.mjs` writes to `data/`:
   - `open_matches.json` — every open job that passed (with the location evidence it was judged on)
   - `new_matches.json` — the ones first seen today
   - `company_status.json` — fetch result per board (`deadSlugs` in the report lists boards that 404 three runs in a row)
   - `run_report.json`, `state.json`

The workflow in `.github/workflows/crawl.yml` runs it at 05:40 UTC daily and commits `data/`. Run it by hand from the Actions tab (**Daily job crawl → Run workflow**).
