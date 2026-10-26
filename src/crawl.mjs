#!/usr/bin/env node
// Crawl public ATS job feeds for the companies in data/companies.json,
// keep senior tech roles that can be done from Portugal, and record which are new.
//
// Outputs (in data/):
//   open_matches.json   every currently-open job that passed the filters
//   new_matches.json    the subset first seen in this run
//   company_status.json last fetch result per company (to spot dead slugs)
//   run_report.json     counts for this run
//   state.json          first/last-seen dates per job id (dedupe across runs)
//
// Usage: node src/crawl.mjs [--limit N] [--only ats:slug,...] [--fixtures dir]

import fs from 'node:fs/promises';
import path from 'node:path';
import { fetchCompany, fillSmartRecruitersDetail } from './fetchers.mjs';
import { titleVerdict, locationVerdict } from './filters.mjs';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const DATA = path.join(ROOT, 'data');
const CONCURRENCY = 8;
const STATE_TTL_DAYS = 45;

const args = process.argv.slice(2);
const argVal = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : null;
};

async function readJson(file, fallback) {
  try {
    return JSON.parse(await fs.readFile(file, 'utf8'));
  } catch {
    return fallback;
  }
}

async function writeJson(file, value) {
  await fs.writeFile(file, JSON.stringify(value, null, 1) + '\n');
}

async function pool(items, n, worker) {
  const results = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(n, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        results[i] = await worker(items[i], i);
      }
    }),
  );
  return results;
}

async function loadFixture(dir, c) {
  // Test mode: data comes from <dir>/<ats>__<slug>.json (already normalized job arrays).
  const file = path.join(dir, `${c.ats}__${c.slug}.json`);
  const jobs = JSON.parse(await fs.readFile(file, 'utf8'));
  return jobs.map((j) => ({ ...j, ats: c.ats, slug: c.slug, company: c.name, companyDomain: c.domain || null }));
}

async function main() {
  const today = new Date().toISOString().slice(0, 10);
  const fixtures = argVal('--fixtures');
  const outDir = argVal('--out') || DATA;
  await fs.mkdir(outDir, { recursive: true });

  let companies = await readJson(path.join(DATA, 'companies.json'), []);
  companies = companies
    .filter((c) => !c.disabled)
    .map((c) => {
      let slug = c.slug;
      try { slug = decodeURIComponent(slug); } catch { /* keep as is */ }
      return { ...c, slug };
    });
  const only = argVal('--only');
  if (only) {
    const want = new Set(only.split(','));
    companies = companies.filter((c) => want.has(`${c.ats}:${c.slug}`));
  }
  const limit = Number(argVal('--limit') || 0);
  if (limit) companies = companies.slice(0, limit);

  const state = await readJson(path.join(outDir, 'state.json'), { jobs: {} });
  const prevStatus = await readJson(path.join(outDir, 'company_status.json'), {});
  const status = {};
  const matches = [];
  const counts = { companies: companies.length, ok: 0, failed: 0, notFound: 0, jobs: 0, titleKept: 0, locationKept: 0 };

  await pool(companies, CONCURRENCY, async (c) => {
    const key = `${c.ats}:${c.slug}`;
    let jobs;
    try {
      jobs = fixtures ? await loadFixture(fixtures, c) : await fetchCompany(c);
      counts.ok++;
      status[key] = { name: c.name, ok: true, jobs: jobs.length, checked: today, failStreak: 0 };
    } catch (err) {
      const nf = err?.status === 404 || err?.status === 410;
      nf ? counts.notFound++ : counts.failed++;
      const streak = (prevStatus[key]?.failStreak || 0) + 1;
      status[key] = { name: c.name, ok: false, error: String(err?.message || err).slice(0, 200), notFound: nf, checked: today, failStreak: streak };
      return;
    }
    counts.jobs += jobs.length;
    for (const job of jobs) {
      const tv = titleVerdict(job.title);
      if (!tv.keep) continue;
      counts.titleKept++;
      if (job._detail) await fillSmartRecruitersDetail(job);
      const lv = locationVerdict(job);
      if (!lv.keep) continue;
      counts.locationKept++;
      matches.push({ ...job, titleReason: tv.reason, location: lv });
    }
  });

  // Dedupe + first/last seen
  const seenNow = new Set();
  for (const m of matches) {
    seenNow.add(m.id);
    const s = state.jobs[m.id] || { firstSeen: today };
    s.lastSeen = today;
    state.jobs[m.id] = s;
    m.firstSeen = s.firstSeen;
    m.isNew = s.firstSeen === today;
  }
  // Prune jobs not seen for a while
  const cutoff = new Date(Date.now() - STATE_TTL_DAYS * 864e5).toISOString().slice(0, 10);
  for (const [id, s] of Object.entries(state.jobs)) {
    if (!seenNow.has(id) && s.lastSeen < cutoff) delete state.jobs[id];
  }

  const trim = (m) => ({
    id: m.id,
    company: m.company,
    companyDomain: m.companyDomain,
    ats: m.ats,
    slug: m.slug,
    title: m.title,
    url: m.url,
    locationText: m.locationText,
    workplace: m.workplace,
    isRemote: m.isRemote,
    department: m.department,
    posted: m.posted,
    salary: m.salary,
    firstSeen: m.firstSeen,
    isNew: m.isNew,
    locationVerdict: m.location.verdict,
    locationReason: m.location.reason,
    locationEvidence: m.location.evidence,
    description: (m.description || '').slice(0, 6000),
  });

  // Collapse the same role listed once per country (e.g. Bjak) into one entry,
  // keeping the listing whose location is best for Portugal.
  const rank = (m) =>
    (/\b(portugal|lisbon|lisboa|porto)\b/i.test(m.locationText || '') ? 3 : 0) +
    (m.location.verdict === 'allowed' ? 2 : 1);
  const groups = new Map();
  for (const m of matches) {
    const key = `${m.ats}:${m.slug}:${String(m.title).toLowerCase().replace(/\s+/g, ' ').trim()}`;
    const g = groups.get(key);
    if (!g) {
      groups.set(key, { best: m, all: [m] });
    } else {
      g.all.push(m);
      if (rank(m) > rank(g.best)) g.best = m;
    }
  }
  const collapsed = [...groups.values()].map(({ best, all }) => {
    const firstSeen = all.map((x) => x.firstSeen).sort()[0];
    return { ...best, firstSeen, isNew: firstSeen === today, otherListings: all.length - 1 };
  });

  collapsed.sort((a, b) => String(b.posted || '').localeCompare(String(a.posted || '')));
  const open = collapsed.map((m) => ({ ...trim(m), otherListings: m.otherListings }));
  const fresh = open.filter((m) => m.isNew);

  // Carry forward status for companies not crawled this run (e.g. --only)
  const mergedStatus = { ...prevStatus, ...status };

  counts.open = open.length;
  counts.new = fresh.length;
  counts.date = today;
  counts.deadSlugs = Object.entries(mergedStatus).filter(([, s]) => s.notFound && s.failStreak >= 3).map(([k]) => k);

  await writeJson(path.join(outDir, 'open_matches.json'), open);
  await writeJson(path.join(outDir, 'new_matches.json'), fresh);
  await writeJson(path.join(outDir, 'company_status.json'), mergedStatus);
  await writeJson(path.join(outDir, 'state.json'), state);
  await writeJson(path.join(outDir, 'run_report.json'), counts);

  console.log(JSON.stringify(counts, null, 1));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
