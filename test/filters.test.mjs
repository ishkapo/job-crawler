// Cases taken from real postings reviewed for Role Radar.
import test from 'node:test';
import assert from 'node:assert/strict';
import { titleVerdict, locationVerdict, tzWindowIncludesPortugal } from '../src/filters.mjs';

const keep = (job) => locationVerdict(job).keep;

test('titles: target roles are kept', () => {
  for (const t of [
    'Staff Software Engineer',
    'Principal Software Engineer',
    'Engineering Manager - Developer Experience *EU/UK remote* (m/f/d)',
    'Head of Engineering',
    'VP of Engineering',
    'Chief Technology Officer',
    'Fractional CTO',
    'Chief of Staff',
    'Backend Engineer, AI (Agent Systems)',
    'Senior Backend Engineer – Mobility',
    'Technical Lead',
    'Tech Lead - Payments and Billing',
    'Solutions Architect, Integrations',
    'Head of Delivery',
    'Senior Software Engineer - Go',
    'Engineering Lead',
    'Staff Engineer, Full Stack (Trust, Safety & Risk)',
  ]) assert.equal(titleVerdict(t).keep, true, t);
});

test('titles: excluded functions are dropped', () => {
  for (const t of [
    'Staff DevOps Engineer (Platform)',
    'Staff Software Engineer (SRE)',
    'Senior Security Engineer Crypto',
    'Senior Software Engineer, Frontend',
    'Senior iOS Engineer, Crypto Perpetuals',
    'Lead Automation Engineer',
    'Head of Finance',
    'Account Executive, Money Management',
    'Senior Product Manager, Payments',
    'Product Engineer - AI Neobank',
    'Senior Data Scientist',
    'Junior Backend Developer',
    'Customer Success Manager',
    'Staff Machine Learning Engineer',
  ]) assert.equal(titleVerdict(t).keep, false, t);
});

test('location: Portugal / Europe / worldwide postings are kept', () => {
  assert.ok(keep({ locationText: 'Remote (European Union)', workplace: 'remote', isRemote: true, description: '' }));
  assert.ok(keep({ locationText: 'Portugal', workplace: 'remote', description: '' }));
  assert.ok(keep({ locationText: 'Remote | Ireland | Europe | United States | Poland | United Kingdom', workplace: 'remote', description: '' }));
  assert.ok(keep({ locationText: 'Europe or US', workplace: 'remote', description: '' }));
  assert.ok(keep({ locationText: 'Porto', workplace: 'hybrid', description: 'two days a week in our Porto office' }));
  assert.ok(keep({ locationText: 'Lisbon, Portugal', workplace: null, description: 'hybrid, three days in the Lisbon office' }));
});

test('location: remote with no country restriction is kept for review', () => {
  const v = locationVerdict({ locationText: 'Remote', workplace: 'remote', isRemote: true, description: 'We are around 180 people, fully remote.' });
  assert.equal(v.keep, true);
  assert.equal(v.verdict, 'remote-unspecified');
});

test('location: remote with a non-Portugal restriction in the text is dropped', () => {
  assert.equal(keep({
    locationText: 'Remote', workplace: 'remote', isRemote: true,
    description: "This role is fully remote; however, we're only open to candidates based in the US and Canada.",
  }), false);
  assert.equal(keep({
    locationText: 'Remote', workplace: 'remote',
    description: 'Candidates must be located in the United States to be considered.',
  }), false);
});

test('location: named places outside Portugal/Europe are dropped', () => {
  assert.equal(keep({ locationText: 'Remote - United States (East Coast)', workplace: 'remote', description: '' }), false);
  assert.equal(keep({ locationText: 'Remote - USA', workplace: 'remote', description: '' }), false);
  assert.equal(keep({ locationText: 'San Francisco, CA, New York, NY, Portland, OR, or Remote within Canada or United States', description: '' }), false);
  assert.equal(keep({ locationText: 'Remote, Canada (EST) OR Remote, UK', description: '' }), false);
  assert.equal(keep({ locationText: 'Hong Kong | Singapore', description: '' }), false);
});

test('location: hybrid outside Portugal is dropped even if an aggregator said Lisbon', () => {
  // The Hiscox case: the posting itself never mentions Portugal.
  assert.equal(keep({ locationText: 'York', workplace: 'hybrid', description: 'We have introduced hybrid working. This hybrid model is set by the team.' }), false);
});

test('location: a Lisbon office in the company blurb does not open a US/UK role', () => {
  assert.equal(keep({ locationText: 'San Francisco OR Seattle | USA', workplace: null,
    description: 'SingleStore is headquartered in San Francisco with offices in Sunnyvale, Raleigh, Seattle, Boston, London, Lisbon, Bangalore.' }), false);
  assert.equal(keep({ locationText: 'United Kingdom, London', workplace: 'hybrid',
    description: 'Offices in London, New York, Singapore, Sydney and our newly established Engineering Hub in Lisbon.' }), false);
  assert.equal(keep({ locationText: 'Berlin | Germany', workplace: null, description: 'Perks: work from anywhere for 4 weeks a year.' }), false);
  assert.equal(keep({ locationText: 'Vietnam', workplace: 'remote', isRemote: true,
    description: 'Full-time schedule: 4 hours per day overlapping with Portugal business hours.' }), false);
});

test('location: per-country remote listing that hires globally is kept', () => {
  assert.ok(keep({ locationText: 'Spain', workplace: 'remote', isRemote: true,
    description: 'LOCATION This is a remote role. We hire globally and work across time zones.' }));
});

test('location: a time-zone window covering Portugal opens the role', () => {
  assert.ok(tzWindowIncludesPortugal('Fully remote role within UTC -1 to UTC +3 time zones.'));
  assert.ok(!tzWindowIncludesPortugal('Must work within UTC-8 to UTC-5.'));
  assert.ok(keep({ locationText: 'Nairobi | Cape Town | Lagos', workplace: 'remote', description: 'Fully remote role within UTC -1 to UTC +3 time zones.' }));
});
