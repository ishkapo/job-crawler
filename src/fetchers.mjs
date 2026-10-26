// Fetchers for public applicant-tracking-system (ATS) job feeds.
// Each fetcher returns an array of normalized jobs:
// { id, ats, slug, company, title, url, locationText, workplace, isRemote,
//   department, posted, salary, description }

const UA = 'job-crawler/1.0 (personal job search; contact via GitHub ishkapo)';
const TIMEOUT_MS = 25_000;

export class FetchError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

async function http(url, { as = 'json' } = {}) {
  let lastErr;
  for (let attempt = 0; attempt < 2; attempt++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(url, {
        headers: { 'user-agent': UA, accept: as === 'json' ? 'application/json' : '*/*' },
        signal: ctrl.signal,
      });
      if (res.status === 404 || res.status === 410) throw new FetchError(`not found ${url}`, res.status);
      if (!res.ok) throw new FetchError(`HTTP ${res.status} ${url}`, res.status);
      return as === 'json' ? await res.json() : await res.text();
    } catch (err) {
      lastErr = err;
      if (err instanceof FetchError && (err.status === 404 || err.status === 410)) throw err;
      await new Promise((r) => setTimeout(r, 1500));
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastErr;
}

const decode = (s) =>
  s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;|&#x27;/g, "'")
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&');

export function htmlToText(html = '') {
  // Greenhouse double-escapes its HTML, so decode before and after stripping tags.
  return decode(
    decode(String(html))
      .replace(/<(br|\/p|\/li|\/h\d|\/div)[^>]*>/gi, '\n')
      .replace(/<li[^>]*>/gi, '• ')
      .replace(/<[^>]+>/g, ' '),
  )
    .replace(/[ \t]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{2,}/g, '\n')
    .trim();
}

const iso = (v) => {
  if (v == null || v === '') return null;
  const d = typeof v === 'number' ? new Date(v) : new Date(String(v));
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
};

// ---------- Greenhouse ----------
async function greenhouse(c) {
  const host = c.ats === 'greenhouse-eu' ? 'boards-api.eu.greenhouse.io' : 'boards-api.greenhouse.io';
  const data = await http(`https://${host}/v1/boards/${encodeURIComponent(c.slug)}/jobs?content=true`);
  return (data.jobs || []).map((j) => ({
    id: `greenhouse:${c.slug}:${j.id}`,
    title: j.title,
    url: j.absolute_url,
    locationText: [j.location?.name, ...(j.offices || []).map((o) => o.name)].filter(Boolean).join(' | '),
    workplace: null,
    isRemote: null,
    department: (j.departments || []).map((d) => d.name).join(', ') || null,
    posted: iso(j.first_published || j.updated_at),
    salary: null,
    description: htmlToText(j.content),
  }));
}

// ---------- Ashby ----------
async function ashby(c) {
  const data = await http(
    `https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(c.slug)}?includeCompensation=true`,
  );
  return (data.jobs || [])
    .filter((j) => j.isListed !== false)
    .map((j) => ({
      id: `ashby:${c.slug}:${j.id}`,
      title: j.title,
      url: j.jobUrl,
      locationText: [
        j.location,
        ...(j.secondaryLocations || []).map((s) => s.location),
        j.address?.postalAddress?.addressCountry,
      ].filter(Boolean).join(' | '),
      workplace: j.workplaceType ? String(j.workplaceType).toLowerCase() : null,
      isRemote: typeof j.isRemote === 'boolean' ? j.isRemote : null,
      department: j.department || j.team || null,
      posted: iso(j.publishedAt),
      salary: j.compensation?.compensationTierSummary || j.compensation?.scrapeableCompensationSalarySummary || null,
      description: j.descriptionPlain || htmlToText(j.descriptionHtml),
    }));
}

// ---------- Lever ----------
async function lever(c) {
  const host = c.ats === 'lever-eu' ? 'api.eu.lever.co' : 'api.lever.co';
  const data = await http(`https://${host}/v0/postings/${encodeURIComponent(c.slug)}?mode=json`);
  return (Array.isArray(data) ? data : []).map((j) => ({
    id: `lever:${c.slug}:${j.id}`,
    title: j.text,
    url: j.hostedUrl,
    locationText: [j.categories?.location, ...(j.categories?.allLocations || []), j.country].filter(Boolean).join(' | '),
    workplace: j.workplaceType ? String(j.workplaceType).toLowerCase() : null,
    isRemote: j.workplaceType ? String(j.workplaceType).toLowerCase() === 'remote' : null,
    department: j.categories?.team || j.categories?.department || null,
    posted: iso(j.createdAt),
    salary: j.salaryRange
      ? `${j.salaryRange.currency || ''} ${j.salaryRange.min}–${j.salaryRange.max} ${j.salaryRange.interval || ''}`.trim()
      : null,
    description: [
      j.descriptionPlain,
      ...(j.lists || []).map((l) => `${l.text}\n${htmlToText(l.content)}`),
      j.additionalPlain,
    ].filter(Boolean).join('\n'),
  }));
}

// ---------- Workable ----------
async function workable(c) {
  const data = await http(`https://apply.workable.com/api/v1/widget/accounts/${encodeURIComponent(c.slug)}?details=true`);
  return (data.jobs || []).map((j) => ({
    id: `workable:${c.slug}:${j.shortcode}`,
    title: j.title,
    url: j.url || j.shortlink || `https://apply.workable.com/${c.slug}/j/${j.shortcode}/`,
    locationText: [
      ...(j.locations || []).map((l) => [l.city, l.region, l.country].filter(Boolean).join(', ')),
      [j.city, j.state, j.country].filter(Boolean).join(', '),
    ].filter(Boolean).join(' | '),
    workplace: j.telecommuting ? 'remote' : (j.workplace_type || null),
    isRemote: typeof j.telecommuting === 'boolean' ? j.telecommuting : null,
    department: j.department || null,
    posted: iso(j.published_on || j.created_at),
    salary: null,
    description: htmlToText(j.description),
  }));
}

// ---------- Recruitee ----------
async function recruitee(c) {
  const data = await http(`https://${encodeURIComponent(c.slug)}.recruitee.com/api/offers/`);
  return (data.offers || []).map((j) => ({
    id: `recruitee:${c.slug}:${j.id}`,
    title: j.title,
    url: j.careers_url,
    locationText: [j.location, ...(j.locations || []).map((l) => [l.city, l.country].filter(Boolean).join(', '))]
      .filter(Boolean).join(' | '),
    workplace: j.remote ? 'remote' : (j.hybrid ? 'hybrid' : null),
    isRemote: typeof j.remote === 'boolean' ? j.remote : null,
    department: j.department || null,
    posted: iso(j.published_at || j.created_at),
    salary: j.salary?.min ? `${j.salary.currency || ''} ${j.salary.min}–${j.salary.max} ${j.salary.period || ''}`.trim() : null,
    description: htmlToText([j.description, j.requirements].filter(Boolean).join('\n')),
  }));
}

// ---------- Personio (XML feed) ----------
function xmlTag(block, tag) {
  const m = block.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, 'i'));
  return m ? m[1].replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').trim() : '';
}
async function personio(c) {
  const xml = await http(`https://${encodeURIComponent(c.slug)}.jobs.personio.de/xml?language=en`, { as: 'text' });
  const positions = xml.match(/<position>[\s\S]*?<\/position>/gi) || [];
  return positions.map((p) => {
    const id = xmlTag(p, 'id');
    const descs = (p.match(/<value>[\s\S]*?<\/value>/gi) || []).map((v) => htmlToText(xmlTag(v, 'value'))).join('\n');
    return {
      id: `personio:${c.slug}:${id}`,
      title: xmlTag(p, 'name'),
      url: `https://${c.slug}.jobs.personio.de/job/${id}`,
      locationText: [xmlTag(p, 'office'), ...(p.match(/<additionalOffices>[\s\S]*?<\/additionalOffices>/i)?.[0].match(/<office>([\s\S]*?)<\/office>/gi) || []).map((o) => xmlTag(o, 'office'))]
        .filter(Boolean).join(' | '),
      workplace: null,
      isRemote: null,
      department: xmlTag(p, 'department') || null,
      posted: iso(xmlTag(p, 'createdAt')),
      salary: null,
      description: descs,
    };
  });
}

// ---------- SmartRecruiters ----------
async function smartrecruiters(c) {
  const out = [];
  let offset = 0;
  for (let page = 0; page < 10; page++) {
    const data = await http(
      `https://api.smartrecruiters.com/v1/companies/${encodeURIComponent(c.slug)}/postings?limit=100&offset=${offset}`,
    );
    const items = data.content || [];
    for (const j of items) {
      const loc = j.location || {};
      out.push({
        id: `smartrecruiters:${c.slug}:${j.id}`,
        title: j.name,
        url: `https://jobs.smartrecruiters.com/${c.slug}/${j.id}`,
        locationText: [loc.fullLocation, [loc.city, loc.country].filter(Boolean).join(', ')].filter(Boolean).join(' | '),
        workplace: loc.remote ? 'remote' : (loc.hybrid ? 'hybrid' : null),
        isRemote: typeof loc.remote === 'boolean' ? loc.remote : null,
        department: j.department?.label || null,
        posted: iso(j.releasedDate),
        salary: null,
        description: '', // filled later for title-matched jobs only
        _detail: `https://api.smartrecruiters.com/v1/companies/${encodeURIComponent(c.slug)}/postings/${j.id}`,
      });
    }
    if (items.length < 100) break;
    offset += 100;
  }
  return out;
}

export async function fillSmartRecruitersDetail(job) {
  if (!job._detail) return job;
  try {
    const d = await http(job._detail);
    const s = d.jobAd?.sections || {};
    job.description = htmlToText(
      [s.jobDescription?.text, s.qualifications?.text, s.additionalInformation?.text].filter(Boolean).join('\n'),
    );
    if (d.postingUrl) job.url = d.postingUrl;
  } catch { /* keep without description */ }
  delete job._detail;
  return job;
}

export const FETCHERS = {
  greenhouse,
  'greenhouse-eu': greenhouse,
  ashby,
  lever,
  'lever-eu': lever,
  workable,
  recruitee,
  personio,
  smartrecruiters,
};

export async function fetchCompany(c) {
  const fn = FETCHERS[c.ats];
  if (!fn) throw new Error(`unsupported ATS ${c.ats}`);
  const jobs = await fn(c);
  return jobs.map((j) => ({ ...j, ats: c.ats, slug: c.slug, company: c.name, companyDomain: c.domain || null }));
}
