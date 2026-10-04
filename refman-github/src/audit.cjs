'use strict';

const { formatSource } = require('./citations.cjs');
const YEAR = '(?:\\d{4}[a-z]*|n\\.d\\.(?:-[a-z]+)?)';
const startsYear = new RegExp(`^(${YEAR})(?=$|[\\s,;])`, 'i');
const authorYear = new RegExp(`^(.+?),\\s*(${YEAR})(?=$|[\\s,;])`, 'i');
const baseYear = value => String(value).replace(/(?<=\d{4})[a-z]+$|(?<=n\.d\.)-[a-z]+$/i, '').toLowerCase();
const normalizeCharacters = value => String(value || '').replace(/[“”]/g, '"').replace(/[‘’]/g, "'").replace(/[–—]/g, '-').replace(/\u00a0/g, ' ');
const key = value => normalizeCharacters(value).replace(/\s+/g, ' ').trim().toLocaleLowerCase('en');
const escapeRegex = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const bareTitle = value => key(value).replace(/^"|"$/g, '');
const sourceInfo = source => ({ sourceId: source.id, title: source.title || 'Untitled source', included: source.include !== false });

function splitAuthorYear(value) {
  const match = authorYear.exec(value.trim());
  return match ? { author: match[1].trim(), year: match[2], rest: value.trim().slice(match[0].length) } : null;
}
function parentheticalGroups(text) {
  const groups = [];
  let start = -1, depth = 0;
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '(') { if (!depth) start = i; depth++; }
    if (text[i] === ')' && depth) { depth--; if (!depth && i - start <= 1200) groups.push({ start, end: i + 1, inner: text.slice(start + 1, i) }); }
    if (text[i] === '\n' && depth && i - start > 1200) { depth = 0; start = -1; }
  }
  return groups;
}
function readYears(value) {
  const years = [];
  let remaining = value.trim();
  for (let count = 0; count < 40; count++) {
    const match = startsYear.exec(remaining);
    if (!match) break;
    years.push(match[1]); remaining = remaining.slice(match[0].length).trim();
    if (/^,\s*/.test(remaining) && startsYear.test(remaining.replace(/^,\s*/, ''))) remaining = remaining.replace(/^,\s*/, '');
    else break;
  }
  return { years, trailing: remaining };
}
function tailLabel(text, label) {
  const pattern = escapeRegex(normalizeCharacters(label)).replace(/\s+/g, '\\s+');
  return new RegExp(`(?:^|[^\\p{L}\\p{N}])(${pattern})\\s*$`, 'iu').exec(text);
}

/** A metadata cross-check of citation candidates, never a check of claim support. */
function auditText(input, project = {}) {
  const fullText = String(input || '');
  const result = { matched: [], unmatchedCitations: [], uncitedSelected: [], notIncluded: [], ambiguous: [], warnings: [], summary: {} };
  const warning = (code, message, detail = {}) => result.warnings.push({ code, message, ...detail });
  let body = fullText;
  const heading = /(?:^|[\r\n])\s*(?:References|Reference list|Bibliography)\s*(?=[\r\n]|$)/i.exec(fullText);
  if (heading) {
    body = fullText.slice(0, heading.index);
    warning('references-excluded', 'Text from the standalone References/Bibliography heading onward was excluded from the citation search.', { start: heading.index });
  }
  if (body.length > 2e6) { body = body.slice(0, 2e6); warning('text-truncated', 'Only the first two million characters were checked.'); }
  const scan = normalizeCharacters(body);
  const sources = Array.isArray(project.sources) ? project.sources : [];
  const records = [];
  const aliases = [];
  const narrativeAliases = [];
  for (const source of sources) {
    try {
      const formatted = formatSource(source, project);
      const names = (Array.isArray(source.authors) ? source.authors : []).filter(a => a?.family || a?.literal);
      const record = { source, formatted, titleBased: !names.length, firstFamily: key(names[0]?.family || names[0]?.literal), authorCount: names.length };
      records.push(record);
      for (const form of new Set([formatted.parenthetical, formatted.firstParenthetical])) {
        if (!form) continue;
        const parsed = splitAuthorYear(normalizeCharacters(form).replace(/^\(|\)$/g, ''));
        if (parsed) aliases.push({ ...parsed, record });
      }
      for (const form of new Set([formatted.narrative, formatted.firstNarrative])) {
        const match = /^(.*?)\s+\((.*)\)$/.exec(normalizeCharacters(form || ''));
        if (!match) continue;
        const yearMatch = new RegExp(YEAR, 'i').exec(match[2]);
        if (yearMatch) narrativeAliases.push({ label: match[1], innerPrefix: match[2].slice(0, yearMatch.index), author: match[1], year: yearMatch[0], record });
      }
    } catch (error) { warning('source-format-error', `Could not format ${source.title || source.id || 'a source'}: ${error.message}`, { sourceId: source.id }); }
  }
  const cited = new Set(), possible = new Set();
  const paragraphStarts = [0];
  for (const match of body.matchAll(/\r\n|\r|\n/g)) paragraphStarts.push(match.index + match[0].length);
  const paragraphAt = start => { let lo = 0, hi = paragraphStarts.length; while (lo + 1 < hi) { const mid = (lo + hi) >> 1; if (paragraphStarts[mid] <= start) lo = mid; else hi = mid; } return lo + 1; };
  const details = (group, kind, author, year, locator, start = group.start) => ({ text: body.slice(start, group.end), start, end: group.end, paragraph: paragraphAt(start), kind, author, year, locator: locator || '', excerpt: body.slice(Math.max(0, start - 100), Math.min(body.length, group.end + 100)) });
  function matchCandidate(candidate, knownRecords, knownPotential = []) {
    const exact = knownRecords || aliases.filter(a => key(a.author) === key(candidate.author) && key(a.year) === key(candidate.year)).map(a => a.record);
    const unique = [...new Map(exact.map(r => [r.source.id, r])).values()];
    if (unique.length === 1) {
      const record = unique[0], matched = { ...candidate, ...sourceInfo(record.source), matchBasis: 'formatted-author-and-year', titleBased: record.titleBased };
      result.matched.push(matched); cited.add(record.source.id);
      if (record.source.include === false) result.notIncluded.push(matched);
      if (record.titleBased) warning('title-match', 'Matched the full formatted title and year. Check title shortening and typography manually.', { sourceId: record.source.id, start: candidate.start });
      return;
    }
    let potential = unique.length ? unique : knownPotential;
    if (!potential.length) {
      potential = aliases.filter(a => baseYear(a.year) === baseYear(candidate.year) && (
        key(a.author) === key(candidate.author) ||
        (a.record.titleBased && bareTitle(candidate.author).split(' ').length >= 2 && bareTitle(a.author).startsWith(bareTitle(candidate.author))) ||
        (a.record.firstFamily && (key(candidate.author) === a.record.firstFamily || (a.record.authorCount > 2 && key(candidate.author) === `${a.record.firstFamily} et al.`)))
      )).map(a => a.record);
    }
    potential = [...new Map(potential.map(r => [r.source.id, r])).values()];
    if (potential.length) {
      potential.forEach(r => possible.add(r.source.id));
      result.ambiguous.push({ ...candidate, candidates: potential.map(r => sourceInfo(r.source)), reason: unique.length > 1 ? 'More than one source has this formatted citation.' : 'The citation differs from the expected author/title or year suffix. Review before assigning it to a source.' });
    } else result.unmatchedCitations.push({ ...candidate, reason: 'No matching formatted author/title and year was found in this project.' });
  }
  for (const group of parentheticalGroups(scan)) {
    const inner = group.inner.trim();
    const left = scan.slice(Math.max(0, group.start - 350), group.start);
    // Known narrative forms include corporate first-use forms: Organisation (ORG, 2020).
    const narrative = narrativeAliases.map(alias => ({ alias, match: tailLabel(left, alias.label) })).filter(({ alias, match }) => match && key(inner).startsWith(key(alias.innerPrefix)) && startsYear.test(inner.slice(alias.innerPrefix.length).trim())).sort((a, b) => b.alias.label.length - a.alias.label.length);
    if (narrative.length || startsYear.test(inner)) {
      const best = narrative[0];
      const unknown = !best && /([\p{Lu}][\p{L}'-]+(?:\s+(?:and|&)\s+[\p{Lu}][\p{L}'-]+|\s+et al\.)?)\s*$/u.exec(left);
      if (!best && !unknown) continue; // A standalone parenthesized calendar year is not necessarily a citation.
      const label = best?.alias.label || unknown[1];
      const start = group.start - (best?.match?.[1] || unknown[1]).length - (left.match(/\s*$/)?.[0].length || 0);
      const parsed = readYears(best ? inner.slice(best.alias.innerPrefix.length) : inner);
      for (const year of parsed.years) {
        const selected = best ? narrative.filter(n => key(n.alias.label) === key(label) && key(n.alias.year) === key(year)).map(n => n.alias.record) : undefined;
        const potential = best ? narrative.filter(n => key(n.alias.label) === key(label) && baseYear(n.alias.year) === baseYear(year)).map(n => n.alias.record) : [];
        matchCandidate(details(group, 'narrative', best?.alias.author || label, year, parsed.trailing, start), selected, potential);
      }
      continue;
    }
    if (/\bas cited in\b/i.test(inner)) {
      warning('secondary-citation', 'Secondary citation detected. Verify which work was actually read and which belongs in the reference list.', { start: group.start, text: body.slice(group.start, group.end) });
      const secondary = splitAuthorYear(inner.replace(/^.*?\bas cited in\s+/i, ''));
      if (secondary) {
        const candidates = aliases.filter(a => key(a.author) === key(secondary.author) && key(a.year) === key(secondary.year)).map(a => sourceInfo(a.record.source));
        candidates.forEach(c => possible.add(c.sourceId));
        result.ambiguous.push({ ...details(group, 'secondary', secondary.author, secondary.year, secondary.rest), candidates, reason: 'Secondary citations require manual review; this audit does not verify the original work.' });
      }
      continue;
    }
    if (/[()]/.test(inner)) {
      warning('nested-citation', 'Nested parentheses may be a legal or complex citation. Check this passage manually.', { start: group.start, text: body.slice(group.start, group.end) });
      continue;
    }
    for (const segment of inner.split(';')) {
      const parsed = splitAuthorYear(segment.trim());
      if (!parsed) continue;
      const years = readYears(`${parsed.year}${parsed.rest}`);
      for (const year of years.years) matchCandidate(details(group, 'parenthetical', parsed.author, year, years.trailing));
      if (/\b(?:p{1,2}\.|para(?:graph)?s?\.|section|chap(?:ter)?\.)\s*\S/i.test(years.trailing)) continue;
      const before = scan.slice(Math.max(0, group.start - 220), group.start);
      if (/["']\s*$/.test(before) && /["'][^"'\r\n]{5,}["']\s*$/.test(before)) warning('quotation-locator', 'A quotation appears immediately before this citation, but no page/paragraph locator was detected. Review the quotation and its locator.', { start: group.start, text: body.slice(group.start, group.end) });
      if (years.trailing.trim()) warning('citation-tail', 'Additional citation text was not interpreted. Check its locator or year syntax.', { start: group.start, text: years.trailing.trim() });
    }
  }
  for (const record of records) if (record.source.include !== false && !cited.has(record.source.id) && !possible.has(record.source.id)) result.uncitedSelected.push({ ...sourceInfo(record.source), citation: record.formatted.parenthetical, reason: 'No recognized citation was found in the checked body text.' });
  if (records.some(r => ['legislation', 'bill', 'case', 'statute', 'legal-case'].includes(r.source.type))) warning('legal-review', 'Legal citation forms require manual review and may not be recognized by this author/date audit.');
  warning('scope', 'This checks plain-text citation candidates against library metadata. It cannot establish that a source supports a claim, verify quotations, check italics, infer page numbers, or guarantee every citation was detected. Unmatched and apparently uncited items need review.');
  result.summary = { matchedOccurrences: result.matched.length, matchedSources: cited.size, unmatchedCitations: result.unmatchedCitations.length, uncitedSelected: result.uncitedSelected.length, notIncluded: result.notIncluded.length, ambiguous: result.ambiguous.length, paragraphsChecked: paragraphStarts.length, charactersChecked: body.length, claimSupportChecked: false };
  return result;
}
module.exports = { auditText };
