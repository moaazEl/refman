'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const ai = require('../src/ai.cjs')._test;
const word = require('../src/word.cjs')._test;

test('AI environment excludes billing credentials and inherited provider settings', () => {
  process.env.OPENAI_API_KEY = 'test-secret';
  process.env.CODEX_API_KEY = 'test-secret';
  process.env.CODEX_ACCESS_TOKEN = 'test-secret';
  const env = ai.cleanEnv('/tmp/refman-test');
  assert.equal(env.OPENAI_API_KEY, undefined);
  assert.equal(env.CODEX_API_KEY, undefined);
  assert.equal(env.CODEX_ACCESS_TOKEN, undefined);
  assert.equal(env.CODEX_HOME, '/tmp/refman-test');
  delete process.env.OPENAI_API_KEY; delete process.env.CODEX_API_KEY; delete process.env.CODEX_ACCESS_TOKEN;
});
test('AI context includes essay task and source evidence with bounded full text', () => {
  const input = { sourceId: 's1', project: { question: 'Research question', draft: 'Essay draft', rubric: 'Marking rubric', sources: [{ id: 's1', title: 'Evidence', content: 'x'.repeat(200000) }] }, message: 'Summarise this source.' };
  const prompt = ai.buildPrompt(input);
  assert.match(prompt, /Research question/); assert.match(prompt, /Essay draft/); assert.match(prompt, /Marking rubric/);
  assert.ok(prompt.length < 120000);
  assert.equal(input.project.sources[0].content.length, 200000);
  assert.throws(() => ai.buildPrompt({ project: input.project, sourceId: 'missing' }), /existing source/);
});
test('AI correction proposals reject mismatched source IDs and unsupported fields', () => {
  const raw = { reply: 'Check the date.', proposal: { sourceId: 's1', reason: 'From supplied title page', changes: [{ field: 'year', value: '2024' }, { field: 'content', value: 'malicious replacement' }] } };
  assert.deepEqual(ai.parseReply(JSON.stringify(raw), 's1').proposal.changes, { year: '2024' });
  assert.equal(ai.parseReply(JSON.stringify(raw), 's2').proposal, undefined);
  assert.throws(() => ai.parseReply('broken', 's1'), /unreadable/);
});
test('Word preserves italic and bold text without executing HTML', () => {
  const runs = word.richRuns('<p>A &amp; B. <em>Title</em>.</p><p><strong>Next</strong></p><script>evil()</script>');
  assert.equal(runs.map(r => r.text).join(''), 'A & B. Title.\rNext');
  assert.equal(runs.find(r => r.text === 'Title').italic, true);
  assert.equal(runs.find(r => r.text === 'Next').bold, true);
  assert.equal(word.richRuns('', 'A\nB')[0].text, 'A\rB');
});
test('Word replacement verifies document and precise current reference content', () => {
  const s = word.updateScript({ documentId: 'My essay.docx', hasReferences: true, text: 'Manually edited text' }, {}, [{ text: 'New reference', italic: false, bold: false }]);
  assert.match(s, /full name of d/);
  assert.match(s, /Manually edited text/);
  assert.match(s, /RefmanReferences/);
  assert.match(s, /set first line indent/);
  assert.match(word.literal('a"\\\n'), /\\"/);
  assert.throws(() => word.formatting({ size: 100 }), /font size/);
});
test('AI uses canonical metadata and preserves date evidence in context', () => {
  const prompt = ai.buildPrompt({ sourceId: 's1', project: { rules: 'Use Griffith rules', minYear: 2019, maxYear: 2026, sources: [{ id: 's1', container: 'Journal title', date: '2024-03-02', retrieved: '2026-10-04', evidence: [{ field: 'date', note: 'Visible publication date' }] }] }, message: 'Check this.' });
  assert.match(prompt, /Journal title/); assert.match(prompt, /Visible publication date/); assert.match(prompt, /2024-03-02/); assert.match(prompt, /Use Griffith rules/);
  assert.ok(ai.FIELDS.includes('container')); assert.ok(ai.FIELDS.includes('retrieved')); assert.ok(ai.FIELDS.includes('date'));
  assert.ok(!ai.FIELDS.includes('journal')); assert.ok(!ai.FIELDS.includes('accessDate'));
  const result = ai.parseReply(JSON.stringify({reply: 'Correction', proposal: {sourceId: 's1', reason: 'Source evidence', changes: [{field: 'authors', value: '[{"family":"Smith","given":"Jane"}]'}, {field: 'container', value: 'Journal title'}]}}), 's1');
  assert.deepEqual(result.proposal.changes.authors, [{family: 'Smith', given: 'Jane'}]);
  assert.equal(result.proposal.changes.container, 'Journal title');
});
test('Word initial section is bound to selected content rather than silently appended', () => {
  const source = word.updateScript({documentId: 'Essay.docx', hasReferences: false, selectionStart: 40, selectionEnd: 65, selectionText: 'User selected references'}, {}, [{text: 'New reference', italic: false, bold: false}]);
  assert.match(source, /selected Word destination changed/);
  assert.match(source, /User selected references/);
  assert.doesNotMatch(source, /end of content of text object of d/);
});
test('Word replacement retains selected paragraph boundaries before the following section', () => {
  const before = 'Essay body\rReferences\r';
  const selected = 'Old reference one\rOld reference two\r\r';
  const after = 'Appendix A\rKeep this paragraph unchanged.\r';
  const runs = word.richRuns('<p>New <i>reference one</i>.</p><p>New reference two.</p>');
  const replacement = word.referenceReplacement(runs, selected);
  const document = before + replacement.insertedText + after;
  assert.equal(document, 'Essay body\rReferences\rNew reference one.\rNew reference two.\r\rAppendix A\rKeep this paragraph unchanged.\r');
  assert.equal(replacement.text, 'New reference one.\rNew reference two.');
  const script = word.updateScript({documentId: 'Essay.docx', hasReferences: false, selectionStart: before.length, selectionEnd: before.length + selected.length, selectionText: selected}, {}, runs);
  assert.ok(script.includes('set content of r to ' + word.literal(replacement.insertedText)));
  assert.ok(script.includes(`set r to create range d start p end (p + ${replacement.text.length})`));
  // A later update replaces only the bookmarked references and leaves their
  // existing separator in the document, so blank lines do not accumulate.
  const next = word.referenceReplacement(word.richRuns('<p>Updated reference.</p>'), replacement.text);
  assert.equal(before + next.insertedText + document.slice(before.length + replacement.text.length), 'Essay body\rReferences\rUpdated reference.\r\rAppendix A\rKeep this paragraph unchanged.\r');
});
test('Word cursor insertion keeps explicit trailing breaks outside the bookmark', () => {
  assert.deepEqual(word.referenceReplacement(word.richRuns('', 'Reference\n'), ''), {text: 'Reference', insertedText: 'Reference\r'});
  assert.deepEqual(word.referenceReplacement(word.richRuns('', 'Reference'), ''), {text: 'Reference', insertedText: 'Reference'});
});
