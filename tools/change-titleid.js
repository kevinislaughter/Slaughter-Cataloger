#!/usr/bin/env node
/* Change a title's TitleID, deliberately, everywhere it is used (3.0 libraries).

   usage: node tools/change-titleid.js <library folder> <OLD-TITLEID> <NEW-TITLEID> --out <folder>

   - Title record: TitleID, Title Code and First Year follow the new ID.
   - IssueIDs and ContentIDs keep their own codes with the new prefix
     (OLDCODE-YYYY-K7M4Q2B -> NEWCODE-YYYY-K7M4Q2B), so old and new can always be matched.
   - Parent links, Issue/Contents files and their names follow.
   - A sentence recording the change is added to the title's General Notes.
   - Any other text that still mentions the old ID is listed for review.
   Writes the whole library to --out; the input folder is not modified. */
'use strict';
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..');
['js/core/csv.js', 'js/core/ids.js', 'js/core/schema.js', 'js/core/records.js', 'js/core/store.js'].forEach(f => require(path.join(ROOT, f)));
const SC = globalThis.SC, R = SC.records, ids = SC.ids;

const args = process.argv.slice(2);
const oi = args.indexOf('--out');
const [dir, OLD, NEW] = args.filter((a, i) => i !== oi && i !== oi + 1);
const OUT = oi !== -1 ? path.resolve(args[oi + 1]) : null;
if (!dir || !OLD || !NEW || !OUT) { console.error('usage: change-titleid.js <folder> <OLD-TITLEID> <NEW-TITLEID> --out <folder>'); process.exit(2); }
const fail = m => { console.error('Not changed: ' + m); process.exit(1); };
if (!ids.RE.titleID.test(NEW)) fail(NEW + ' is not a valid TitleID (8-character code, hyphen, YYYY / YYYX / YYXX / XXXX).');

const names = fs.readdirSync(dir).filter(n => /\.csv$/i.test(n));
const files = names.map(n => R.readFile(n, fs.readFileSync(path.join(dir, n), 'utf8'), { lastModified: fs.statSync(path.join(dir, n)).mtimeMs }));
const refused = files.filter(f => !f.ok);
if (refused.length) fail(refused.map(f => f.name + ': ' + f.error).join('; '));
const built = R.buildLibrary(files, {});
const st = built.state;
if (built.changed.length) fail('the library is not cleanly saved as 3.0 (' + built.changed.join(', ') + ').');
if (!st.titles.has(OLD)) fail(OLD + ' is not in this library.');
if (st.titles.has(NEW)) fail(NEW + ' already exists.');
const [newCode, newYear] = [NEW.slice(0, 8), NEW.slice(9)];
for (const t of st.titles.values()) if (t.titleID !== OLD && t.titleCode === newCode) fail('Title Code ' + newCode + ' is used by ' + t.titleID + '.');

const swap = id => (id && id.indexOf(OLD + '-') === 0) ? NEW + id.slice(OLD.length) : id;
const renameFile = n => n.indexOf(OLD) !== -1 ? n.split(OLD).join(NEW) : n;
const pad = n => String(n).padStart(2, '0'), d = new Date();      // local date (run with TZ set to the cataloguer's zone)
const today = d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
const counts = { issues: 0, contents: 0, files: [] };

// title
const t = Object.assign({}, st.titles.get(OLD), { titleID: NEW, titleCode: newCode, firstYear: newYear });
const record = 'TitleID changed from ' + OLD + ' to ' + NEW + ' on ' + today + '; IssueIDs and ContentIDs keep their codes with the new prefix (' + OLD + '-K… became ' + NEW + '-K…).';
t.generalNotes = (t.generalNotes ? t.generalNotes.replace(/\s+$/, '') + ' ' : '') + record;
st.titles.delete(OLD);
st.titles.set(NEW, R.freezeRec(t));
// issues
Array.from(st.issues.values()).filter(i => i.titleID === OLD).forEach(i => {
  st.issues.delete(i.issueID);
  const n = Object.assign({}, i, { issueID: swap(i.issueID), titleID: NEW, _src: renameFile(i._src) });
  st.issues.set(n.issueID, R.freezeRec(n)); counts.issues++;
});
// contents (IDs, issue links, parent links)
Array.from(st.contents.values()).filter(c => c.issueID.indexOf(OLD + '-') === 0 || c.contentID.indexOf(OLD + '-') === 0 || c.titleID === OLD).forEach(c => {
  st.contents.delete(c.contentID);
  const n = Object.assign({}, c, { contentID: swap(c.contentID), issueID: swap(c.issueID), parentID: swap(c.parentID), titleID: c.titleID === OLD ? NEW : c.titleID, _src: renameFile(c._src) });
  st.contents.set(n.contentID, R.freezeRec(n)); counts.contents++;
});
// files
Array.from(st.files.keys()).forEach(n => {
  const m = renameFile(n);
  if (m !== n) { const f = st.files.get(n); st.files.delete(n); st.files.set(m, Object.assign({}, f, { name: m })); counts.files.push(n + ' -> ' + m); }
});

// write and verify
fs.mkdirSync(OUT, { recursive: true });
const written = {};
st.files.forEach((f, n) => { written[n] = R.writeFile(st, n); fs.writeFileSync(path.join(OUT, n), written[n], 'utf8'); });
const back = R.buildLibrary(Object.keys(written).map(n => R.readFile(n, written[n], {})), {});
const problems = [];
if (back.changed.length) problems.push('files change on re-read: ' + back.changed.join(', '));
if (back.state.titles.size !== st.titles.size || back.state.issues.size !== st.issues.size || back.state.contents.size !== st.contents.size) problems.push('record counts differ');
back.state.issues.forEach(i => { if (i.issueID.indexOf(i.titleID + '-') !== 0) problems.push('IssueID ' + i.issueID + ' does not start with ' + i.titleID); });
back.state.contents.forEach(c => { if (c.parentID && !back.state.contents.has(c.parentID)) problems.push('broken parent link ' + c.contentID); });
const stillMentions = [];
Object.keys(written).forEach(n => { const rows = SC.csv.parse(written[n]).rows; rows.slice(1).forEach((r, ri) => r.forEach((v, ci) => { if (v.indexOf(OLD) !== -1) stillMentions.push(n + ' row ' + (ri + 2) + ', ' + rows[0][ci] + ': ' + v.slice(0, 160)); })); });

console.log('TitleID ' + OLD + ' -> ' + NEW + ': ' + counts.issues + ' issue(s), ' + counts.contents + ' contents item(s) re-keyed.');
counts.files.forEach(x => console.log('  file renamed: ' + x));
console.log('Verification: ' + (problems.length ? 'FAILED — ' + problems.join('; ') : 'passed'));
if (stillMentions.length) { console.log('Text that still mentions ' + OLD + ' (review by hand):'); stillMentions.forEach(x => console.log('  ' + x)); }
process.exit(problems.length ? 1 : 0);
