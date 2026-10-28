#!/usr/bin/env node
// Find which public ATS board each candidate company uses.
// Input: data/candidates.json  [[name, domain, [slug guesses]], ...]
// Output: data/probe_results.json  one entry per board that answered with jobs.
import fs from 'node:fs/promises';
import { fetchCompany } from './fetchers.mjs';

const ATS = ['greenhouse', 'greenhouse-eu', 'ashby', 'lever', 'lever-eu', 'workable', 'recruitee', 'personio'];
const cands = JSON.parse(await fs.readFile('data/candidates.json', 'utf8'));
const tasks = [];
for (const [name, domain, slugs] of cands) for (const slug of slugs) for (const ats of ATS) tasks.push({ name, domain, slug, ats });

const hits = [];
let next = 0;
await Promise.all(Array.from({ length: 10 }, async () => {
  while (next < tasks.length) {
    const t = tasks[next++];
    try {
      const jobs = await fetchCompany({ name: t.name, ats: t.ats, slug: t.slug, domain: t.domain });
      if (!jobs.length) continue;
      hits.push({ ...t, jobs: jobs.length, sample: jobs.slice(0, 4).map((j) => `${j.title} | ${j.locationText || ''}`), url: jobs[0].url });
    } catch { /* not this ATS */ }
  }
}));
hits.sort((a, b) => a.name.localeCompare(b.name));
await fs.writeFile('data/probe_results.json', JSON.stringify(hits, null, 1) + '\n');
console.log(`${tasks.length} probes, ${hits.length} boards with jobs, ${new Set(hits.map((h) => h.name)).size}/${cands.length} companies found`);
