// Checks that each ATS payload shape is normalized correctly (fetch is stubbed).
import test from 'node:test';
import assert from 'node:assert/strict';
import { fetchCompany, htmlToText } from '../src/fetchers.mjs';

function stub(map) {
  globalThis.fetch = async (url) => {
    const key = Object.keys(map).find((k) => url.includes(k));
    if (!key) return { ok: false, status: 404, json: async () => ({}), text: async () => '' };
    const body = map[key];
    return {
      ok: true,
      status: 200,
      json: async () => body,
      text: async () => (typeof body === 'string' ? body : JSON.stringify(body)),
    };
  };
}

test('greenhouse', async () => {
  stub({
    'boards-api.greenhouse.io/v1/boards/acme/jobs': {
      jobs: [{ id: 1, title: 'Staff Backend Engineer', absolute_url: 'https://x/1', location: { name: 'Lisbon, Portugal' },
        offices: [{ name: 'Lisbon' }], departments: [{ name: 'Engineering' }], first_published: '2026-10-20T10:00:00Z',
        content: '&lt;p&gt;Build &amp;amp; ship&lt;/p&gt;' }],
    },
  });
  const [j] = await fetchCompany({ ats: 'greenhouse', slug: 'acme', name: 'Acme' });
  assert.equal(j.id, 'greenhouse:acme:1');
  assert.equal(j.locationText, 'Lisbon, Portugal | Lisbon');
  assert.equal(j.department, 'Engineering');
  assert.match(j.description, /Build & ship/);
});

test('ashby', async () => {
  stub({
    'api.ashbyhq.com/posting-api/job-board/pliant': {
      jobs: [{ id: 'a1', title: 'EM - DevEx', jobUrl: 'https://jobs.ashbyhq.com/pliant/a1', location: 'Remote (European Union)',
        secondaryLocations: [{ location: 'United Kingdom' }], workplaceType: 'Remote', isRemote: true, isListed: true,
        department: 'Engineering', publishedAt: '2026-10-26T08:53:02Z', descriptionPlain: 'Lead DevEx',
        compensation: { compensationTierSummary: '€100K – €130K' } }],
    },
  });
  const [j] = await fetchCompany({ ats: 'ashby', slug: 'pliant', name: 'Pliant' });
  assert.equal(j.workplace, 'remote');
  assert.equal(j.isRemote, true);
  assert.equal(j.locationText, 'Remote (European Union) | United Kingdom');
  assert.equal(j.salary, '€100K – €130K');
});

test('lever', async () => {
  stub({
    'api.eu.lever.co/v0/postings/qonto': [
      { id: 'l1', text: 'Engineering Manager', hostedUrl: 'https://jobs.eu.lever.co/qonto/l1', createdAt: 1792000000000,
        categories: { location: 'Paris', allLocations: ['Paris', 'Lisbon'], team: 'Tech' }, workplaceType: 'hybrid',
        descriptionPlain: 'Intro', lists: [{ text: 'You have', content: '<li>Go</li>' }], additionalPlain: 'More' },
    ],
  });
  const [j] = await fetchCompany({ ats: 'lever-eu', slug: 'qonto', name: 'Qonto' });
  assert.equal(j.workplace, 'hybrid');
  assert.match(j.locationText, /Lisbon/);
  assert.match(j.description, /You have\n• Go/);
});

test('workable', async () => {
  stub({
    'apply.workable.com/api/v1/widget/accounts/sygnum': {
      jobs: [{ shortcode: 'W1', title: 'Head of Engineering', url: 'https://apply.workable.com/sygnum/j/W1/', telecommuting: true,
        city: 'Zurich', country: 'Switzerland', published_on: '2026-10-21', description: '<p>Remote in Europe</p>' }],
    },
  });
  const [j] = await fetchCompany({ ats: 'workable', slug: 'sygnum', name: 'Sygnum' });
  assert.equal(j.isRemote, true);
  assert.equal(j.locationText, 'Zurich, Switzerland');
  assert.equal(j.description, 'Remote in Europe');
});

test('recruitee', async () => {
  stub({
    'tether.recruitee.com/api/offers': {
      offers: [{ id: 7, title: 'Senior Node.js Engineer', careers_url: 'https://careers.tether.io/o/x', location: 'Remote',
        remote: true, published_at: '2026-10-22 10:00:00 UTC', description: '<p>Worldwide</p>', requirements: '<li>Node</li>' }],
    },
  });
  const [j] = await fetchCompany({ ats: 'recruitee', slug: 'tether', name: 'Tether' });
  assert.equal(j.id, 'recruitee:tether:7');
  assert.equal(j.isRemote, true);
  assert.match(j.description, /Worldwide/);
});

test('personio', async () => {
  stub({
    'moss.jobs.personio.de/xml': `<?xml version="1.0"?><workzag-jobs><position><id>99</id><office>Berlin</office>
      <additionalOffices><office>Remote</office></additionalOffices><department>Engineering</department>
      <name>Staff Backend Engineer</name><createdAt>2026-10-10T09:00:00+00:00</createdAt>
      <jobDescriptions><jobDescription><name>About</name><value><![CDATA[<p>Remote across the EU</p>]]></value></jobDescription></jobDescriptions>
      </position></workzag-jobs>`,
  });
  const [j] = await fetchCompany({ ats: 'personio', slug: 'moss', name: 'Moss' });
  assert.equal(j.title, 'Staff Backend Engineer');
  assert.equal(j.locationText, 'Berlin | Remote');
  assert.match(j.description, /Remote across the EU/);
});

test('htmlToText', () => {
  assert.equal(htmlToText('<p>a</p><ul><li>b</li></ul>'), 'a\n• b');
});
