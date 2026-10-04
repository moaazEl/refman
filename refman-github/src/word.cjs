'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFile } = require('node:child_process');
const BOOKMARK = 'RefmanReferences';
const SEP = '\u001e';
const normalize = value => String(value || '').replace(/\r\n?|\n/g, '\r');
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const literal = value => '"' + String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\r/g, '\\r').replace(/\n/g, '\\n') + '"';
function script(source) {
  return new Promise((resolve, reject) => {
    const child = execFile('/usr/bin/osascript', ['-'], { timeout: 25000, maxBuffer: 4e6 }, (error, stdout, stderr) => {
      if (error) return reject(new Error(/1743|not authorized|not allowed/i.test(stderr) ? 'Allow Refman to control Microsoft Word in System Settings → Privacy & Security → Automation.' : (stderr.trim() || error.message)));
      resolve(stdout.replace(/\n$/, ''));
    });
    child.stdin.end(source);
  });
}
const guard = `if not running of application "Microsoft Word" then error "Open Microsoft Word and a document first."
tell application "Microsoft Word"
if (count documents) = 0 then error "Open a Word document first."
set d to active document`;
async function snapshot(includeDocument = false) {
  const result = await script(`${guard}
set docName to name of d
set docId to full name of d
set refText to ""
set present to false
if exists bookmark "${BOOKMARK}" of d then
set present to true
set refText to content of text object of bookmark "${BOOKMARK}" of d
end if
set selRange to text object of selection
set selStart to start of content of selRange
set selEnd to end of content of selRange
set selText to content of selRange
set outText to docName & character id 30 & docId & character id 30 & (present as text) & character id 30 & refText & character id 30 & selStart & character id 30 & selEnd & character id 30 & selText
${includeDocument ? 'set outText to outText & character id 30 & (content of text object of d)' : ''}
return outText
end tell`);
  const [document, documentId, present, text, start, end, selectionText, documentText] = result.split(SEP);
  const hasReferences = present === 'true';
  const selectionStart = Number(start), selectionEnd = Number(end);
  return { document, documentId, hasReferences, text: text || '', documentText, selectionStart, selectionEnd, selectionText: selectionText || '', hash: hash(`${documentId}\0${hasReferences ? text || '' : `${start}:${end}:${selectionText || ''}`}`) };
}
async function status() {
  const installed = process.platform === 'darwin' && fs.existsSync('/Applications/Microsoft Word.app');
  if (!installed) return { installed: false, available: false, connected: false, message: 'Microsoft Word for Mac is required for direct insertion. You can still export a Word document.' };
  try { const s = await snapshot(); return { ...s, installed: true, available: true, connected: true, message: `Connected to ${s.document}` }; }
  catch (error) { return { installed: true, available: true, connected: false, message: error.message }; }
}
async function insert(text) {
  if (typeof text !== 'string' || !text.trim()) throw new Error('There is no citation to insert.');
  if (text.length > 20000) throw new Error('Citation text is too long.');
  const result = await script(`${guard}
set r to text object of selection
set p to start of content of r
set r to create range d start p end p
set content of r to ${literal(normalize(text))}
return name of d
end tell`);
  return { inserted: true, document: result, text };
}
function decode(text) {
  return text.replace(/&(#x[\da-f]+|#\d+|amp|lt|gt|quot|apos|nbsp);/gi, (_, entity) => {
    if (entity[0] === '#') { const n = entity[1].toLowerCase() === 'x' ? parseInt(entity.slice(2), 16) : Number(entity.slice(1)); return n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : ''; }
    return ({ amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' })[entity.toLowerCase()];
  });
}
// Only a small formatting vocabulary is accepted; scripts, links and CSS never execute.
function richRuns(html, fallback = '') {
  if (!html) return [{ text: normalize(fallback), italic: false, bold: false }];
  let italic = 0, bold = 0;
  const runs = [];
  for (const token of String(html).replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, '').match(/<[^>]*>|[^<]+/g) || []) {
    if (token[0] === '<') {
      const tag = /^<\s*(\/?)([\w]+)/.exec(token);
      if (!tag) continue;
      const closing = !!tag[1], name = tag[2].toLowerCase();
      if (name === 'i' || name === 'em') italic = Math.max(0, italic + (closing ? -1 : 1));
      if (name === 'b' || name === 'strong') bold = Math.max(0, bold + (closing ? -1 : 1));
      if (name === 'br' || (closing && ['p', 'div', 'li'].includes(name))) {
        if (runs.length && !runs[runs.length - 1].text.endsWith('\r')) runs.push({ text: '\r', italic: false, bold: false });
      }
    } else { const text = decode(token).replace(/[\r\n]+/g, ''); if (text) runs.push({ text, italic: italic > 0, bold: bold > 0 }); }
  }
  while (runs.length && /^\r*$/.test(runs[runs.length - 1].text)) runs.pop();
  return runs.length ? runs : [{ text: normalize(fallback), italic: false, bold: false }];
}
function formatting(options) {
  const font = String(options.font || 'Times New Roman').slice(0, 100);
  const size = Number(options.size) || 12;
  const spacing = Number(options.spacing) || 2;
  if (size < 6 || size > 48 || spacing < 1 || spacing > 3) throw new Error('Choose a font size from 6–48 and line spacing from 1–3.');
  return { font, size, spacing };
}
function referenceReplacement(runs, previousText = '') {
  const generated = runs.map(run => run.text).join('');
  const text = generated.replace(/\r+$/, '');
  // Keep selected paragraph separators outside the managed bookmark. Otherwise
  // replacing whole paragraphs can join an Appendix heading to the last entry.
  const boundary = normalize(previousText).match(/\r+$/)?.[0] || generated.match(/\r+$/)?.[0] || '';
  return { text, insertedText: text + boundary };
}
function updateScript(s, options, runs) {
  const { font, size, spacing } = formatting(options);
  const { text, insertedText } = referenceReplacement(runs, s.hasReferences ? s.text : s.selectionText);
  let offset = 0;
  const formats = runs.map(run => {
    const start = offset; offset = Math.min(offset + run.text.length, text.length);
    if (start === offset) return '';
    return `set partRange to create range d start (p + ${start}) end (p + ${offset})\nset italic of font object of partRange to ${run.italic}\nset bold of font object of partRange to ${run.bold}`;
  }).join('\n');
  return `${guard}
if (full name of d) is not ${literal(s.documentId)} then error "The active Word document changed. Please try again."
${s.hasReferences ? `if not (exists bookmark "${BOOKMARK}" of d) then error "The reference bookmark was removed. Please try again."
set r to text object of bookmark "${BOOKMARK}" of d
if (content of r) is not ${literal(s.text)} then error "The references changed while updating. Please try again."
set p to start of content of r` : `if exists bookmark "${BOOKMARK}" of d then error "A reference section was created. Please try again."
set r to text object of selection
if (start of content of r) is not ${Number(s.selectionStart)} or (end of content of r) is not ${Number(s.selectionEnd)} then error "The selected Word destination changed. Please try again."
if (content of r) is not ${literal(s.selectionText || '')} then error "The selected text changed. Please try again."
set p to start of content of r`}
set content of r to ${literal(insertedText)}
set r to create range d start p end (p + ${text.length})
make new bookmark at d with properties {name:"${BOOKMARK}", text object:r}
set name of font object of r to ${literal(font)}
set font size of font object of r to ${size}
set line spacing rule of paragraph format of r to line space multiple
set line spacing of paragraph format of r to ${spacing * 12}
set paragraph format left indent of paragraph format of r to 36
set first line indent of paragraph format of r to -36
${formats}
return content of r
end tell`;
}
async function update(options = {}) {
  const runs = richRuns(options.html, options.text);
  if (!runs.some(r => r.text.trim())) throw new Error('There are no references to send to Word.');
  const before = await snapshot();
  if (!before.hasReferences && !options.confirmed) return { ...before, needsConfirmation: true, expectedHash: before.hash, message: before.selectionText ? `Create Refman's reference section by replacing the selected text in ${before.document}? Select only the references, excluding the heading. Preview: ${before.selectionText.slice(0, 500)}` : `Insert Refman's reference section at the current cursor in ${before.document}? Place the cursor below your References heading before confirming.` };
  if (before.hasReferences && before.hash !== options.expectedHash && !options.confirmed) return { ...before, needsConfirmation: true, expectedHash: before.hash, message: 'The Word reference list contains changes that Refman has not confirmed. Replace it with the current library references?' };
  // Confirmation is tied to the precise content inspected before the dialog.
  if (options.confirmed && (!options.expectedHash || before.hash !== options.expectedHash)) return { ...before, needsConfirmation: true, expectedHash: before.hash, message: 'The Word reference list changed again. Review it before replacing.' };
  const content = await script(updateScript(before, options, runs));
  return { updated: true, document: before.document, documentId: before.documentId, hash: hash(`${before.documentId}\0${content}`), text: content, needsConfirmation: false };
}
async function audit() {
  const s = await snapshot(true);
  const citationMatches = [...(s.documentText || '').matchAll(/\(([^()\r]{1,160}?,\s*(?:\d{4}[a-z]?|n\.d\.)(?:[^()\r]{0,40}))\)/g)].map(m => m[0]);
  return { ...s, citations: [...new Set(citationMatches)], note: 'Parenthetical citation candidates only; review narrative citations and sources manually.' };
}
async function exportDocx(options = {}, filePath) {
  if (!filePath || path.extname(filePath).toLowerCase() !== '.docx') throw new Error('Choose a .docx destination.');
  const { Document, Packer, Paragraph, TextRun, AlignmentType } = require('docx');
  const { font, size, spacing } = formatting(options);
  const runs = richRuns(options.html, options.text);
  const paragraphs = [];
  let row = [];
  for (const run of runs) {
    const parts = normalize(run.text).split('\r');
    parts.forEach((text, index) => { if (index) { paragraphs.push(row); row = []; } if (text) row.push(new TextRun({ text, italics: run.italic, bold: run.bold, font, size: size * 2 })); });
  }
  if (row.length) paragraphs.push(row);
  const doc = new Document({ sections: [{ children: [new Paragraph({ children: [new TextRun({ text: 'References', bold: true, font, size: size * 2 })], alignment: AlignmentType.CENTER, spacing: { line: spacing * 240 } }), ...paragraphs.map(children => new Paragraph({ children, indent: { left: 720, hanging: 720 }, spacing: { line: spacing * 240, after: 0 } }))] }] });
  await fs.promises.writeFile(filePath, await Packer.toBuffer(doc));
  return { exported: true, path: filePath };
}
module.exports = { status, insert, update, audit, exportDocx, _test: { richRuns, literal, normalize, hash, updateScript, formatting, referenceReplacement } };
