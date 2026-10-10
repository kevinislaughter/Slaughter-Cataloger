#!/usr/bin/env node
/* Unit tests for js/core/names.js (credits, headings, matching, suggestions) and for
   name authorities in records.js / store.js (the Authorities CSV and undo).
   usage: node tools/test-names.js */
'use strict';
const path = require('path');
const ROOT = path.join(__dirname, '..');
globalThis.SC = {};
['csv', 'ids', 'schema', 'records', 'store', 'names'].forEach(f => require(path.join(ROOT, 'js', 'core', f + '.js')));
const { names: NM, records: R } = globalThis.SC;
const SCx = globalThis.SC;

let fails = 0, count = 0;
const eq = (got, want, what) => {
  count++;
  const g = JSON.stringify(got), w = JSON.stringify(want);
  if (g !== w) { fails++; console.log('FAIL ' + what + '\n   got  ' + g + '\n   want ' + w); }
};
const head = n => NM.suggestHeading(n).name;

// ── Keys and headings ───────────────────────────────────────────────────
eq(NM.nameKey('B. R. Tucker'), NM.nameKey('B.R. Tucker'), 'spacing and points do not matter');
eq(NM.nameKey('Proudhon, P.-J.') === NM.nameKey('Proudhon P J'), true, 'hyphens and commas do not matter');
eq(NM.nameKey('Françoise'), 'francoise', 'accents do not matter');
eq(NM.nameKey('Ἡράκλειτος').length > 0, true, 'Greek names keep their letters');
eq(NM.splitCredits('B. R. Tucker; Victor Yarros ;'), ['B. R. Tucker', 'Victor Yarros'], 'credits split on semicolons');
eq(NM.splitCredits('J.M.L. Babcock/Tucker'), ['J.M.L. Babcock', 'Tucker'], 'a letter and its reply, split on the slash');
eq(NM.splitCredits('Robert W. Hume / Tucker'), ['Robert W. Hume', 'Tucker'], 'a slash with spaces');
eq(NM.splitCredits('Stephen Pearl Andrews & B.R. Tucker'), ['Stephen Pearl Andrews', 'B.R. Tucker'], 'joint authors split on &');
eq(NM.splitCredits('Report for 1881/82'), ['Report for 1881/82'], 'no split between numbers');
eq(NM.suggestHeading('Benjamin R. Tucker, editor'), { name: 'Tucker, Benjamin R.', nameType: 'Person', honorifics: '', roles: 'editor' }, 'a trailing role is set aside');
eq(head('Benjamin R. Tucker'), 'Tucker, Benjamin R.', 'surname first');
eq(head('Ludwig von Mises'), 'Mises, Ludwig von', 'lower-case particle after the forenames');
eq(head('François de La Rochefoucauld'), 'La Rochefoucauld, François de', 'capitalized particle stays with the surname');
eq(head('Martin Luther King, Jr.'), 'King, Martin Luther, Jr.', 'suffix at the end');
eq(NM.suggestHeading('Rev. Cliff Case'), { name: 'Case, Cliff', nameType: 'Person', honorifics: 'Rev.', roles: '' }, 'honorific set aside');
eq(NM.suggestHeading('translated by Thomas Common'), { name: 'Common, Thomas', nameType: 'Person', honorifics: '', roles: 'translated by' }, 'role set aside');
eq(head('Svein Olav Nyberg [signed Svein Olav]'), 'Nyberg, Svein Olav', 'bracketed note set aside');
eq(NM.suggestHeading('Gun Owners of America').nameType, 'Corporate body', 'a body is not inverted');
eq(head('The Devil’s Advocate'), 'The Devil’s Advocate', '"The ..." is not inverted');
eq(head('Saturday Evening Post'), 'Saturday Evening Post', 'a periodical is not inverted');
eq(NM.suggestHeading('B.R.T.'), { name: 'B.R.T.', nameType: 'Unknown', honorifics: '', roles: '' }, 'an initialism stays as it is');
eq(head('Tucker, Benjamin R.'), 'Tucker, Benjamin R.', 'already surname first');
eq(NM.directOrder('La Rochefoucauld, François de'), 'François de La Rochefoucauld', 'direct order of a heading');
eq(NM.directOrder('King, Martin Luther, Jr.'), 'Martin Luther King, Jr.', 'direct order keeps the suffix');
eq(NM.splitForms('B.R.T. | Benj. R. Tucker;B. R. Tucker'), ['B.R.T.', 'Benj. R. Tucker', 'B. R. Tucker'], 'forms split on | (and ;)');
eq(NM.joinForms(['a', 'b', 'a', ' ']), 'a | b', 'forms joined with |, once each');

// ── Probably the same person ────────────────────────────────────────────
const P = n => NM.parse(n);
eq(NM.compatible(P('B. R. Tucker'), P('Benjamin R. Tucker')), true, 'initials agree with a full name');
eq(NM.compatible(P('Benj. R. Tucker'), P('Benjamin Tucker')), true, 'an abbreviated forename agrees');
eq(NM.compatible(P('Wm. Flygare'), P('William Flygare')), true, 'Wm. is William');
eq(NM.compatible(P('Benjamin Tucker'), P('Bertha Tucker')), false, 'different forenames');
eq(NM.compatible(P('B. R. Tucker'), P('B. S. Tucker')), false, 'different initials');
eq(NM.compatible(P('Benjamin R. Tucker'), P('Benjamin R. Tuckerman')), false, 'different surnames');

// ── A small library ─────────────────────────────────────────────────────
function lib() {
  const st = SCx.emptyState();
  st.library = Object.freeze({ slug: 'TEST', name: 'Test', note: '' });
  const credits = ['Benjamin R. Tucker', 'B. R. Tucker', 'B.R.T.', 'Benj. R. Tucker; Victor Yarros', 'Bertha Tucker', 'B. Tucker', 'Tucker, Benjamin R.', 'translated by Thomas Common', 'Thomas Common', ''];
  credits.forEach((a, k) => st.contents.set('TESTTITX-1900-C2222' + (k + 22), R.freezeRec({ contentID: 'TESTTITX-1900-C2222' + (k + 22), issueID: 'TESTTITX-1900-K222222', itemTitle: 'Item ' + k, author: a, sequence: String(k + 1), spec: [], na: [], _src: 'C.csv', entryOrder: k + 1 })));
  st.files.set('C.csv', { name: 'C.csv', kind: 'content', style: SCx.csv.DEFAULT_STYLE, extraHeaders: [], hash: 'x' });
  return st;
}
let st = lib();
let ix = NM.index(st);
eq(ix.forms.size, 10, 'one form per distinct credit');
eq(NM.index({ contents: new Map([['a', { contentID: 'a', author: 'B. R. Tucker' }], ['b', { contentID: 'b', author: 'B.R. Tucker' }]]), authorities: new Map() }).forms.size, 1, 'B. R. Tucker and B.R. Tucker are one form');
eq(ix.forms.get(NM.nameKey('b r tucker')).count, 1, 'counts per form');
const groups = NM.suggestGroups(ix);
eq(groups.map(g => g.suggestion), ['Tucker, Benjamin R.', 'Common, Thomas'], 'suggested groups, largest first');
eq(groups[0].forms.map(f => f.raw).sort(), ['B. R. Tucker', 'B.R.T.', 'Benj. R. Tucker', 'Benjamin R. Tucker', 'Tucker, Benjamin R.'].sort(), 'B.R.T. joins; "B. Tucker" could be Benjamin or Bertha and is left out');

// A heading gathers its forms, its own form and that form in direct order.
const auth = { authorityID: 'AU-222222', name: 'Tucker, Benjamin R.', nameType: 'Person', variants: 'B.R.T. | Benj. R. Tucker', dates: '1854–1939', seeAlso: '', roles: '', honorifics: '', sources: '', notes: '', status: 'Confirmed', spec: [], na: [], _src: 'SCAT_TEST_AUTHORITIES.csv', entryOrder: 1 };
const store = SCx.createStore();
store.load(st);
store.put('authority', auth, 'Add heading');
eq(Array.from(store.dirty), ['SCAT_TEST_AUTHORITIES.csv'], 'a new heading goes to the library\'s Authorities file');
ix = NM.index(store.state);
const e = ix.entries.find(x => x.kind === 'heading');
eq(e.forms.map(f => f.raw).sort(), ['B.R.T.', 'Benj. R. Tucker', 'Benjamin R. Tucker', 'Tucker, Benjamin R.'].sort(), 'heading matches its forms, its own form and the direct order');
eq(e.count, 4, 'credits under the heading');
eq(NM.headingFor(store.state, ix, 'B. R. T.').name, 'Tucker, Benjamin R.', 'a credit finds its heading by key');
eq(NM.headingFor(store.state, ix, 'B. R. Tucker'), null, 'a form not listed stays unheaded');
eq(ix.entries.map(x => x.label), ['Thomas Common', 'translated by Thomas Common', 'B. Tucker', 'B. R. Tucker', 'Tucker, Benjamin R.', 'Bertha Tucker', 'Victor Yarros'],
  'entries in filing order, word by word (by heading, or the heading a name would have)');
store.undo();
eq(store.state.authorities.size, 0, 'undo removes the heading');
store.redo();

// The Authorities file round trip.
const text = R.writeFile(store.state, 'SCAT_TEST_AUTHORITIES.csv');
const back = R.readFile('SCAT_TEST_AUTHORITIES.csv', text, {});
eq(back.ok && back.kind, 'authority', 'the Authorities file reads back');
const r0 = back.records[0];
eq([r0.authorityID, r0.name, r0.variants, r0.dates, r0.status], ['AU-222222', 'Tucker, Benjamin R.', 'B.R.T. | Benj. R. Tucker', '1854–1939', 'Confirmed'], 'with its values');
eq(R.writeFile(store.state, 'SCAT_TEST_AUTHORITIES.csv'), text, 'writing again gives the same file');
const built = R.buildLibrary([back], {});
eq(built.state.authorities.size, 1, 'buildLibrary loads headings');
const noID = R.readFile('SCAT_TEST_AUTHORITIES.csv', text.replace('AU-222222', ''), {});
const built2 = R.buildLibrary([noID], {});
eq(SCx.ids.RE.authorityID.test(Array.from(built2.state.authorities.keys())[0]) && built2.changed.length === 1, true, 'a heading without an AuthorityID is given one, and the file marked changed');
eq(SCx.ids.RE.authorityID.test(SCx.ids.newAuthorityID(() => false)), true, 'AuthorityID pattern AU-xxxxxx');
const snap = SCx.stateFromSnapshot(JSON.parse(JSON.stringify(store.snapshot())));
eq(snap.authorities.get('AU-222222').name, 'Tucker, Benjamin R.', 'headings survive the browser working copy');

console.log(fails ? 'FAILED ' + fails + ' of ' + count + ' name checks' : 'PASSED ' + count + ' name checks');
process.exit(fails ? 1 : 0);
