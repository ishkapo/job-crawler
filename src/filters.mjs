// Title and location pre-filters. These are deliberately recall-oriented:
// the daily Claude scan reads every kept posting and makes the final call.

// ---------- Title ----------
const TECH = /\b(engineer(ing)?|developer|architect(ure)?|cto|c\.t\.o|technology|technical|tech|platform|back-?end|blockchain|solidity|smart contracts?|software|full[ -]?stack|devex|developer experience|delivery|chief of staff|founding engineer)\b/i;

const LEVEL = /\b(staff|principal|lead|head|director|vp|vice president|svp|evp|chief|cto|manager|architect|senior|sr\.?|founding|fractional|interim)\b/i;

// Always-in titles even without a level word (backend/blockchain ICs at fintechs are worth reading).
const ALWAYS = /\b(back-?end|blockchain|solidity|smart contracts?|chief of staff|cto|chief technology officer|head of (engineering|technology|delivery|platform)|vp,? (of )?engineering|director,? (of )?engineering|solutions? engineer)\b/i;

const EXCLUDE = new RegExp(
  [
    'intern(ship)?', 'junior', 'jr\\.?', 'graduate', 'apprentice', 'working student', 'werkstudent', 'trainee', 'entry[- ]level',
    'devops', '\\bsre\\b', 'site reliability', 'reliability', 'security', 'secops', 'appsec', 'pentest', 'vulnerability',
    'front-?end', 'front end', '\\bios\\b', 'android', 'mobile', '\\bqa\\b', 'quality assurance', 'quality engineer', 'test(ing)?\\b', 'sdet',
    '(qa|test|quality) automation', 'automation engineer',
    'data scientist', 'machine learning', '\\bml\\b', 'research scientist', 'data analyst', 'analytics engineer', 'business intelligence',
    'designer', 'ux\\b', 'ui\\b', 'sales', 'account (executive|manager)', 'marketing', 'growth marketing', 'recruit', 'talent',
    'product manager', 'product owner', 'product lead', 'product marketing', 'support', 'customer', 'success', 'helpdesk', 'it support',
    'legal', 'counsel', 'compliance (officer|analyst|manager)', 'finance\\b', 'financial (analyst|controller)', 'accounting', 'accountant', 'payroll',
    '\\bhr\\b', 'people (partner|operations)', 'office manager', 'electrical', 'mechanical', 'hardware', 'firmware', 'embedded',
    'network engineer', 'field engineer', 'manufacturing', 'process engineer', 'civil', 'construction', 'clinical',
  ].join('|'),
  'i',
);

export function titleVerdict(title = '') {
  const t = String(title);
  if (EXCLUDE.test(t) && !/chief of staff|chief technology/i.test(t)) return { keep: false, reason: 'title excluded' };
  if (ALWAYS.test(t)) return { keep: true, reason: 'core title' };
  if (TECH.test(t) && LEVEL.test(t)) return { keep: true, reason: 'senior tech title' };
  return { keep: false, reason: 'not a senior tech title' };
}

// ---------- Location ----------
// Places that work for someone living in Portugal.
const ALLOW = /\b(portugal|lisbon|lisboa|porto|oporto|europe|european|emea|e\.?u\.?|eea|worldwide|world-?wide|anywhere|global(ly)?|international|cet|cest|wet)\b/i;

// "UTC-1 to UTC+3", "GMT+0 – GMT+4", "CET ±3": does the window include Portugal (UTC+0 / UTC+1)?
export function tzWindowIncludesPortugal(text = '') {
  const s = String(text);
  const range = s.match(/\b(?:utc|gmt)\s?([+-−]?\s?\d{1,2})(?::\d\d)?\s?(?:to|–|-|—|and)\s?(?:utc|gmt)?\s?([+-−]?\s?\d{1,2})\b/i);
  if (range) {
    const a = Number(range[1].replace(/[\s−]/g, (m) => (m === '−' ? '-' : '')));
    const b = Number(range[2].replace(/[\s−]/g, (m) => (m === '−' ? '-' : '')));
    const lo = Math.min(a, b), hi = Math.max(a, b);
    if (lo <= 1 && hi >= 0) return true;
  }
  const plusMinus = s.match(/\b(cet|utc|gmt)\s?±\s?(\d{1,2})\b/i);
  if (plusMinus) {
    const base = /cet/i.test(plusMinus[1]) ? 1 : 0;
    const d = Number(plusMinus[2]);
    if (base - d <= 1 && base + d >= 0) return true;
  }
  if (/\b(cet|cest|wet|utc\s?\+?\s?[01]|gmt\s?\+?\s?[01])\b(?!\s?[-−]\s?\d)/i.test(s) && /\b(time ?zone|hours|overlap|working)\b/i.test(s)) return true;
  return false;
}
// Generic words that say nothing about geography.
const GENERIC = /\b(remote|hybrid|on-?site|onsite|office|home|based|work from home|wfh|fully|100%|flexible|distributed|location|locations|multiple|various|first|friendly|or|and|in|within|from|the|any|opportunity|anywhere in)\b|[-–—(),/|:*]/gi;

// Phrases in a description that restrict who can be hired, outside Portugal.
const NON_PT = '(the )?(u\\.?s\\.?a?|united states|us|canada|uk|united kingdom|india|latam|latin america|brazil|mexico|apac|asia|australia|singapore|israel|philippines|nigeria|kenya|south africa|americas|north america)\\b';
const RESTRICT = [
  new RegExp(`\\b(open|available) (only )?to (candidates|applicants|people|those)[^.\\n]{0,30}\\b(based|located|living|residing) in ${NON_PT}`, 'i'),
  new RegExp(`\\bonly (open|available) to[^.\\n]{0,40}\\bin ${NON_PT}`, 'i'),
  /\b(must|need to|needs to|required to|should|have to)\b[^.\n]{0,40}\b(be )?(based|located|resid(e|ing|ent)|live|living|work(ing)?)\b[^.\n]{0,40}\b(in|within|from)\b[^.\n]{0,30}\b(the )?(u\.?s\.?a?|united states|us\b|canada|uk|united kingdom|india|latam|latin america|brazil|mexico|apac|asia|australia|singapore|israel|philippines|nigeria|kenya|south africa|germany|spain|poland|netherlands|france|ireland|switzerland)\b/i,
  /\b(u\.?s\.?|us|uk|canada|india|latam)[- ](only|based)\b/i,
  /\bonly (accept|consider|hire|hiring)[^.\n]{0,40}\b(u\.?s\.?|united states|uk|canada|india)\b/i,
  /\b(eligible|authori[sz]ed) to work in the (u\.?s\.?|united states|uk|united kingdom|canada)\b/i,
  /\bremote \((us|u\.s\.|usa|united states|uk|canada|india)\)/i,
  /\b(est|pst|cst|mst|eastern|pacific|central) (time|timezone|time zone)[^.\n]{0,30}\b(required|overlap|hours)\b/i,
];

// Phrases that explicitly open the role to Portugal / Europe.
// Strong signals: the role itself is open to Portugal / Europe.
const OPEN_STRONG = [
  /\b(based|located|living|residing|work(ing)?|remote(ly)?|hire|hiring|candidates?|role|position)\b[^.\n]{0,30}\b(in|from|within)\b[^.\n]{0,10}\b(portugal|lisbon|lisboa|porto)\b/i,
  /\b(portugal|lisbon|lisboa|porto)\b[^.\n]{0,15}\b(remote|hybrid|office|based|hub)\b[^.\n]{0,30}\b(role|position|team|you|this)\b/i,
  /\bremote\b[^.\n]{0,40}\b(across|within|in|from|throughout)\b[^.\n]{0,15}\b(europe|the eu|eu|emea|european union|eea)\b/i,
  /\b(europe|eu|emea)[- ](remote|based)\b/i,
];
// Weak signals: only trusted when the location field itself says "Remote" without naming places.
const OPEN_WEAK = [
  /\b(this is a remote role|fully remote|100% remote)\b[^.\n]{0,80}\b(hire|hiring) (globally|worldwide|internationally)\b/i,
  /\bwe (hire|are hiring) (globally|worldwide|internationally)\b/i,
  /\b(work|working) from anywhere in the world\b/i,
];
const OPEN = [...OPEN_STRONG, ...OPEN_WEAK];

function splitParts(text) {
  return String(text || '')
    .split(/\s*[|;]\s*|\s+or\s+/i)
    .map((s) => s.trim())
    .filter(Boolean);
}

function findQuote(desc, regexes) {
  for (const r of regexes) {
    const m = desc.match(r);
    if (m) {
      const i = Math.max(0, m.index - 60);
      return desc.slice(i, m.index + m[0].length + 60).replace(/\s+/g, ' ').trim();
    }
  }
  return null;
}

/**
 * Decide whether a job can plausibly be done from Portugal.
 * Returns { keep, verdict, reason, evidence }.
 * verdict: 'allowed' | 'remote-unspecified' | 'restricted' | 'elsewhere'
 */
export function locationVerdict(job) {
  const loc = String(job.locationText || '');
  const desc = String(job.description || '').slice(0, 12000);
  const parts = splitParts(loc);
  const workplace = (job.workplace || '').toLowerCase();
  const onsiteOrHybrid = /hybrid|on-?site|office/.test(workplace) || /\bhybrid\b|\bon-?site\b|\bin[- ]office\b/i.test(loc);

  const allowedParts = parts.filter((p) => ALLOW.test(p));
  const geoParts = parts.filter((p) => p.replace(GENERIC, ' ').replace(/\s+/g, ' ').trim().length > 1);
  const restrictQuote = findQuote(desc, RESTRICT);
  const tzOpen = tzWindowIncludesPortugal(desc) || tzWindowIncludesPortugal(loc);
  const tzQuote = tzOpen ? findQuote(desc + ' ' + loc, [/\b(utc|gmt|cet|cest|wet)\b[^.\n]{0,40}/i]) || 'time-zone window includes Portugal' : null;
  const strongQuote = findQuote(desc, OPEN_STRONG) || tzQuote;
  const openQuote = strongQuote || findQuote(desc, OPEN_WEAK);
  // Portugal must be in the location field, or in a sentence about where this role is done
  // (a company blurb like "offices in Seattle, London and Lisbon" does not count).
  const portugalNamed = /\b(portugal|lisbon|lisboa|porto|oporto)\b/i.test(loc) ||
    !!findQuote(desc, [OPEN_STRONG[0], OPEN_STRONG[1]]);

  // Hybrid / on-site: only Portugal works.
  if (onsiteOrHybrid && !(job.isRemote === true)) {
    if (portugalNamed) {
      return { keep: true, verdict: 'allowed', reason: 'hybrid/on-site in Portugal', evidence: loc || openQuote };
    }
    if (!allowedParts.length || !/europe|emea|e\.?u\.?|worldwide|anywhere|global/i.test(loc)) {
      return { keep: false, verdict: 'elsewhere', reason: 'hybrid/on-site outside Portugal', evidence: loc };
    }
  }

  if (allowedParts.length) {
    if (restrictQuote && !portugalNamed && !openQuote) {
      return { keep: false, verdict: 'restricted', reason: 'listed Europe/global but description restricts', evidence: restrictQuote };
    }
    return { keep: true, verdict: 'allowed', reason: 'location lists Portugal/Europe/EMEA/worldwide', evidence: allowedParts.join(' | ') };
  }

  if (geoParts.length === 0) {
    // Only "Remote" (or nothing) — read the description.
    if (restrictQuote && !openQuote) {
      return { keep: false, verdict: 'restricted', reason: 'remote but description restricts the country', evidence: restrictQuote };
    }
    if (openQuote) return { keep: true, verdict: 'allowed', reason: 'description opens to Portugal/Europe', evidence: openQuote };
    return { keep: true, verdict: 'remote-unspecified', reason: 'remote, no country restriction found', evidence: loc || 'no location field' };
  }

  // Named places that are not Portugal/Europe: only an explicit statement about this role reopens it.
  if (strongQuote && !restrictQuote) {
    return { keep: true, verdict: 'allowed', reason: 'location lists other places but description opens to Portugal/Europe', evidence: strongQuote };
  }
  if (job.isRemote === true && openQuote && !restrictQuote) {
    return { keep: true, verdict: 'allowed', reason: 'remote role listed per country; description says it hires globally', evidence: openQuote };
  }
  return { keep: false, verdict: 'elsewhere', reason: 'location names places outside Portugal/Europe', evidence: loc };
}
