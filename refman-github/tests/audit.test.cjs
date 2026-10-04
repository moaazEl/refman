'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { auditText } = require('../src/audit.cjs');
const { formatSource, combined } = require('../src/citations.cjs');
const author = (family, given = 'Alex') => ({ family, given });
const source = (id, family, year = '2020', more = {}) => ({ id, type: 'book', title: `Work ${id}`, year, authors: [author(family)], publisher: 'Press', include: true, ...more });

test('matches parenthetical, narrative and multi-source multi-year citations', () => {
  const p = { sources: [source('a', 'Jones', '2019'), source('b', 'Jones', '2021'), source('c', 'Smith')] };
  const result = auditText(`Jones (2019, 2021) found a relationship.\nEvidence also exists ${combined(['a', 'b', 'c'], p)}.`, p);
  assert.equal(result.matched.length, 5);
  assert.equal(result.summary.matchedSources, 3);
  assert.deepEqual(result.unmatchedCitations, []);
  assert.deepEqual(result.uncitedSelected, []);
  assert.ok(result.matched.some(c => c.kind === 'narrative'));
  assert.equal(result.summary.claimSupportChecked, false);
});
test('separates unknown citations, selected-but-unrecognized sources and excluded cited sources', () => {
  const p = { sources: [source('a', 'Jones'), source('b', 'Smith', '2021', { include: false }), source('c', 'Brown')] };
  const result = auditText('Known (Jones, 2020). Smith (2021) agrees. Unknown (Taylor, 2023).', p);
  assert.equal(result.matched.length, 2);
  assert.equal(result.notIncluded[0].sourceId, 'b');
  assert.equal(result.uncitedSelected[0].sourceId, 'c');
  assert.equal(result.unmatchedCitations[0].author, 'Taylor');
});
test('recognizes exact generated two-author, many-author, corporate first/subsequent citations', () => {
  const p = { sources: [source('two', 'Smith', '2020', { authors: [author('Smith'), author('Jones')] }), source('many', 'Brown', '2021', { authors: [author('Brown'), author('Taylor'), author('Hill')] }), source('org', '', '2022', { authors: [{ literal: 'World Health Organization' }], abbreviation: 'WHO' })] };
  const text = p.sources.map(s => { const f = formatSource(s, p); return `${f.firstNarrative} argue this ${f.firstParenthetical}. Later ${f.narrative} agree ${f.parenthetical}.`; }).join('\n');
  const result = auditText(text, p);
  assert.equal(result.matched.length, 12);
  assert.deepEqual(result.unmatchedCitations, []);
  assert.deepEqual(result.ambiguous, []);
});
test('same-author same-year suffixes match and missing suffix is ambiguous', () => {
  const p = { sources: [source('a', 'Jones', '2020', { title: 'Apple' }), source('b', 'Jones', '2020', { title: 'Zebra' })] };
  const result = auditText('(Jones, 2020a, 2020b). Jones (2020) also reports this.', p);
  assert.equal(result.matched.length, 2);
  assert.equal(result.ambiguous.length, 1);
  assert.deepEqual(result.ambiguous[0].candidates.map(c => c.sourceId), ['a', 'b']);
});
test('does not silently assign indistinguishable authors with same surname and initials', () => {
  const p = { sources: [source('a', 'Smith', '2020', { authors: [author('Smith', 'Jane')] }), source('b', 'Smith', '2020', { authors: [author('Smith', 'John')] })] };
  const result = auditText('(J. Smith, 2020). Smith (2020) agrees.', p);
  assert.equal(result.matched.length, 0);
  assert.equal(result.ambiguous.length, 2);
  assert.equal(result.uncitedSelected.length, 0);
});
test('full title citation matches while abbreviated title is flagged for review', () => {
  const p = { sources: [source('a', '', '2020', { authors: [], title: 'Safe practice for nurses', type: 'article' })] };
  const result = auditText('The report (“Safe Practice for Nurses”, 2020) agrees. (“Safe Practice”, 2020) is shortened.', p);
  assert.equal(result.matched.length, 1);
  assert.equal(result.matched[0].titleBased, true);
  assert.equal(result.ambiguous.length, 1);
  assert.ok(result.warnings.some(w => w.code === 'title-match'));
});
test('no-date citations and Unicode names keep their matching and positions', () => {
  const p = { sources: [source('a', 'García', '')] };
  const text = 'García (n.d.) explains this.\r\nFurther evidence (García, n.d., para. 4).';
  const result = auditText(text, p);
  assert.equal(result.matched.length, 2);
  assert.equal(result.matched[1].paragraph, 2);
  for (const c of result.matched) assert.equal(text.slice(c.start, c.end), c.text);
});
test('excludes reference list so bibliography entries do not count as body citations', () => {
  const p = { sources: [source('a', 'Jones'), source('b', 'Smith')] };
  const result = auditText('Body (Jones, 2020).\nReferences\nSmith (2020)\nJones (2020)', p);
  assert.equal(result.matched.length, 1);
  assert.deepEqual(result.uncitedSelected.map(c => c.sourceId), ['b']);
  assert.ok(result.warnings.some(w => w.code === 'references-excluded'));
});
test('flags adjacent quotation without locator, but accepts page or paragraph locator', () => {
  const p = { sources: [source('a', 'Jones')] };
  const result = auditText('“An exact quotation” (Jones, 2020).\n“Another quotation” (Jones, 2020, pp. 4–5).\n“A third quotation” (Jones, 2020, para. 3).', p);
  assert.equal(result.matched.length, 3);
  assert.equal(result.warnings.filter(w => w.code === 'quotation-locator').length, 1);
});
test('secondary citations and nested legal citations explicitly require review', () => {
  const p = { sources: [source('a', 'Jones')] };
  const result = auditText('(Smith, 1990, as cited in Jones, 2020). (Health Act 2020 (Qld), s 4).', p);
  assert.equal(result.matched.length, 0);
  assert.equal(result.ambiguous[0].kind, 'secondary');
  assert.equal(result.ambiguous[0].candidates[0].sourceId, 'a');
  assert.ok(result.warnings.some(w => w.code === 'nested-citation'));
});
test('manual citation overrides match literal known author-year forms', () => {
  const p = { sources: [source('a', 'Jones', '2020', { overrides: { parenthetical: '(Custom Team, 2024)', narrative: 'Custom Team (2024)' } })] };
  const result = auditText('Custom Team (2024) reports this (Custom Team, 2024).', p);
  assert.equal(result.matched.length, 2);
  assert.equal(result.matched[0].sourceId, 'a');
});
test('independent narrative override is matched using its own year', () => {
  const p = { sources: [source('a', 'Jones', '2020', { overrides: { narrative: 'Custom Team (2024)' } })] };
  const result = auditText('Custom Team (2024) reports this (Jones, 2020).', p);
  assert.equal(result.matched.length, 2);
  assert.deepEqual(result.unmatchedCitations, []);
});
test('dates alone are not reported as unknown citations; audit never mutates project', () => {
  const p = { sources: [source('a', 'Jones')] }, before = JSON.stringify(p);
  const result = auditText('We collected data (2020). The sample (n = 2020) was large.', p);
  assert.equal(result.unmatchedCitations.length, 0);
  assert.equal(result.matched.length, 0);
  assert.equal(JSON.stringify(p), before);
  assert.ok(result.warnings.some(w => /cannot establish that a source supports a claim/.test(w.message)));
});
