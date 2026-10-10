#!/usr/bin/env node
/* Headless walkthrough of the built app with an in-memory library folder.
   usage: node tools/test-walkthrough.js <app.html> <3.0 EGOIST-JOURNALS folder> <a Beta 2 Titles CSV> [screenshot-dir]
   The folder is the Egoist Journals library in 3.0 form (Egoist_Journals_3.0.zip, unzipped).
   Counts are worked out from the files themselves; the numbering checks rely on the
   last issues of Liberty (vol. 17, no. 1, whole no. 403, April 1908).
   Fails on any page error or failed expectation. */
'use strict';
const path = require('path'), fs = require('fs');
let chromium;
try { ({ chromium } = require('playwright')); } catch (e) { ({ chromium } = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright')); }

const ROOT = path.join(__dirname, '..');
const app = path.resolve(process.argv[2] || path.join(ROOT, 'dist', 'slaughter-cataloger-3.html'));
const dataDir = process.argv[3];
const oldFile = process.argv[4];
const shots = process.argv[5] || '';
if (!dataDir || !oldFile) { console.error('usage: test-walkthrough.js <app.html> <3.0 folder> <beta2-file.csv> [shots]'); process.exit(2); }
const seed = {};
fs.readdirSync(dataDir).filter(n => /\.csv$/i.test(n)).forEach(n => { seed[n] = fs.readFileSync(path.join(dataDir, n), 'utf8'); });
const OLD_NAME = 'SCAT_EGOIST-JOURNALS_TITLES_v2-0_old.csv';     // a leftover Beta 2 file in the folder
seed[OLD_NAME] = fs.readFileSync(oldFile, 'utf8');
const LIB_ISSUES = 'SCAT_EGOIST-JOURNALS_LIBERTYX-1881_ISSUES.csv';
const LIB_CONTENTS = 'SCAT_EGOIST-JOURNALS_LIBERTYX-1881_CONTENTS.csv';
const pick = Object.keys(seed);

// What the app should find, read here with the app's own core modules.
globalThis.SC = {};
['csv', 'ids', 'schema', 'numbering', 'records'].forEach(f => require(path.join(ROOT, 'js', 'core', f + '.js')));
const built = SC.records.buildLibrary(pick.filter(n => n !== OLD_NAME).map(n => SC.records.readFile(n, seed[n], { lastModified: 1000 })), {});
const st = built.state;
const fmt = n => n.toLocaleString('en-US');
const libIssues = Array.from(st.issues.values()).filter(i => i.titleID === 'LIBERTYX-1881');
const inheritPublisher = libIssues.filter(i => (i.overrides || []).indexOf('publisher') === -1).length;
const libAuthors = new Map();
Array.from(st.contents.values()).forEach(c => { if (SC.records.titleOfContent(st, c) === 'LIBERTYX-1881' && c.author) libAuthors.set(c.author, (libAuthors.get(c.author) || 0) + 1); });
const topAuthor = Array.from(libAuthors.entries()).filter(e => e[0].length >= 6).sort((a, b) => b[1] - a[1])[0][0];

// In-memory folder that survives page reloads. It is kept in localStorage, where a file
// whose text is the same as the seed file of that name is stored as a reference only.
function fakeFS(seedFiles) {
  if (window.top !== window) return;               // not inside the Compiler's sandboxed preview frame
  const KEY = '__sc_test_fs__';
  const pack = node => ({ files: Object.fromEntries(Object.entries(node.files).map(([n, f]) => [n, f.text === seedFiles[n] ? { ref: n, lastModified: f.lastModified } : f])),
    dirs: Object.fromEntries(Object.entries(node.dirs).map(([n, d]) => [n, pack(d)])) });
  const unpack = node => ({ files: Object.fromEntries(Object.entries(node.files).map(([n, f]) => [n, f.ref ? { text: seedFiles[f.ref], lastModified: f.lastModified } : f])),
    dirs: Object.fromEntries(Object.entries(node.dirs).map(([n, d]) => [n, unpack(d)])) });
  const saved = JSON.parse(localStorage.getItem(KEY) || 'null');
  let tree = saved ? unpack(saved) : null;
  if (!tree) { tree = { files: {}, dirs: {} }; Object.keys(seedFiles).forEach(n => { tree.files[n] = { text: seedFiles[n], lastModified: 1000 }; }); }
  const persist = () => localStorage.setItem(KEY, JSON.stringify(pack(tree)));
  persist();
  const notFound = () => { const e = new Error('not found'); e.name = 'NotFoundError'; return e; };
  function fileHandle(node, name) {
    return { kind: 'file', name,
      getFile: async () => ({ name, lastModified: node.files[name].lastModified, text: async () => node.files[name].text }),
      createWritable: async () => { let buf = ''; return { write: async t => { buf += t; }, close: async () => { node.files[name] = { text: buf, lastModified: Date.now() }; persist(); } }; } };
  }
  function dirHandle(node, name) {
    return { kind: 'directory', name,
      queryPermission: async () => 'granted', requestPermission: async () => 'granted',
      values: async function* () { for (const n of Object.keys(node.files)) yield fileHandle(node, n); for (const d of Object.keys(node.dirs)) yield dirHandle(node.dirs[d], d); },
      getFileHandle: async (n, o) => { if (!node.files[n]) { if (!(o && o.create)) throw notFound(); node.files[n] = { text: '', lastModified: Date.now() }; persist(); } return fileHandle(node, n); },
      getDirectoryHandle: async (n, o) => { if (!node.dirs[n]) { if (!(o && o.create)) throw notFound(); node.dirs[n] = { files: {}, dirs: {} }; persist(); } return dirHandle(node.dirs[n], n); } };
  }
  window.__SC_TEST_FS__ = { root: dirHandle(tree, 'Egoist Journals'), tree: () => tree };
}

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1360, height: 900 } });
  const page = await ctx.newPage();
  const errors = [], log = [];
  globalThis.__log = log; globalThis.__errors = errors; globalThis.__page = page;
  let failures = 0;
  page.on('pageerror', e => errors.push('page error: ' + e.message));
  page.on('console', m => { if (m.type() === 'error' && !/fonts\.g|ERR_TUNNEL|net::/.test(m.text())) errors.push('console: ' + m.text()); });
  page.on('dialog', d => d.accept());
  await page.addInitScript(fakeFS, seed);
  const step = s => log.push('· ' + s);
  const expect = (ok, what) => { log.push((ok ? '  ok   ' : '  FAIL ') + what); if (!ok) failures++; };
  const shot = async (n, full) => { if (shots) await page.screenshot({ path: path.join(shots, n + '.png'), fullPage: !!full }); };
  const text = sel => page.locator(sel).first().innerText();
  const go = hash => page.evaluate(h => { location.hash = h; }, hash);
  // Click Save and wait for this save's own message (an earlier one may still be showing).
  const save = async () => {
    await page.evaluate(() => { window.__msgBefore = SC.session.ui.message; });
    await page.click('.topbar button:has-text("Save")');
    await page.waitForFunction(() => SC.session.ui.message && SC.session.ui.message !== window.__msgBefore && !SC.session.ui.busy);
    await page.waitForSelector('.message.ok');
    return page.evaluate(() => window.__SC_TEST_FS__.tree());
  };
  const rowsOf = (csvText) => page.evaluate(t => { const rows = SC.csv.parse(t).rows; const h = rows[0]; return rows.slice(1).map(r => Object.fromEntries(h.map((k, i) => [k, r[i]]))); }, csvText);
  const clickAway = () => page.locator('body').click({ position: { x: 5, y: 895 } });
  const paste = (sel, t) => page.evaluate(([s, v]) => { const el = document.querySelector(s); el.focus(); const dt = new DataTransfer(); dt.setData('text/plain', v); el.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true })); }, [sel, t]);
  const itemsHere = () => page.evaluate(() => SC.session.store.contentsOfIssue(SC.ui.parseRoute().issueID).map(c => ({ id: c.contentID, seq: c.sequence, title: c.itemTitle, author: c.author, type: c.contentType, start: c.startPage, end: c.endPage, parent: c.parentID })));

  await page.goto('file://' + app);
  await page.evaluate(() => new Promise(r => { const q = indexedDB.deleteDatabase('slaughter-cataloger-3'); q.onsuccess = q.onerror = q.onblocked = () => r(); }));
  await page.reload();

  step('Welcome screen');
  expect(await page.locator('text=Open library folder').count() === 1, 'offers Open library folder');
  await shot('01-welcome');

  step('Open the folder');
  const t0 = Date.now();
  await page.click('text=Open library folder');
  await page.waitForSelector('table.shelf tbody tr');
  const summary = await text('.summary');
  step('opened in ' + (Date.now() - t0) + ' ms: ' + summary.replace(/\s+/g, ' '));
  const want = [fmt(st.titles.size) + ' titles', fmt(st.issues.size) + ' issues', fmt(st.contents.size) + ' contents items'];
  expect(want.every(w => summary.indexOf(w) !== -1), 'dashboard counts ' + want.join(', '));
  expect((await page.locator('table.shelf tbody tr').count()) === st.titles.size, st.titles.size + ' rows in the shelf list');
  expect(/All changes saved/.test(await text('.save-state')), 'nothing marked changed after opening');
  expect(/Beta 2 format/.test(await text('main')), 'leftover Beta 2 file reported as not loaded');
  await shot('02-dashboard');

  step('Open Liberty and edit it');
  await page.click('table.shelf tbody tr:has(code:text-is("LIBERTYX-1881"))');
  await page.waitForSelector('.entry-main');
  expect(/^Liberty\b/.test(await text('.entry-main')), 'catalog entry shows Liberty');
  await page.fill('#f-knownIssues', '403');
  await page.locator('#f-knownIssues').press('Enter');
  await page.locator('.field:has(#f-subtitle) .tog').first().click();
  const dirty1 = await text('.save-state');
  expect(/1 file changed/.test(dirty1), 'a title edit that issues do not inherit changes only the Titles file (' + dirty1 + ')');
  expect(/\[Liberty\?\]/.test(await text('.entry-main')) === false, 'title itself not marked uncertain');
  await shot('03-title-editor');

  step('Undo and redo');
  await clickAway();
  await page.click('button:has-text("Undo")');
  expect((await page.locator('.field:has(#f-subtitle) .tog.on').count()) === 0, 'undo removes the ? mark');
  await page.click('button:has-text("Redo")');
  expect((await page.locator('.field:has(#f-subtitle) .tog.on').count()) === 1, 'redo restores it');

  step('Save');
  const tree = await save();
  step((await text('.message')).replace(/\s+/g, ' ').slice(0, 200));
  expect(/All changes saved/.test(await text('.save-state')), 'saved state shown');
  const titles = tree.files['SCAT_EGOIST-JOURNALS_TITLES.csv'].text;
  const lib = (await rowsOf(titles)).find(r => r.TitleID === 'LIBERTYX-1881');
  expect(lib && lib['Total Known Issues'] === '403', 'Liberty row has 403 known issues');
  expect(lib && /Subtitle/.test(lib['Speculative Fields'] || '') && lib.Speculative === 'Yes', 'Liberty row lists Subtitle as speculative');
  expect(tree.files[LIB_ISSUES].text === seed[LIB_ISSUES], 'Liberty issues file untouched');
  expect(tree.files[OLD_NAME].text === seed[OLD_NAME], 'Beta 2 file untouched');
  const backups = tree.dirs._backups ? Object.values(tree.dirs._backups.dirs)[0] : null;
  expect(!!backups && !!backups.files['SCAT_EGOIST-JOURNALS_TITLES.csv'], 'original Titles file backed up');
  expect(backups && backups.files['SCAT_EGOIST-JOURNALS_TITLES.csv'].text === seed['SCAT_EGOIST-JOURNALS_TITLES.csv'], 'backup is byte-identical to the original');
  expect(Object.keys(tree.files).length === pick.length, 'no extra files written to the folder');

  step('Inheritance: change the publisher on the title');
  await page.fill('#f-publisher', 'Benj. R. Tucker');
  await page.locator('#f-publisher').press('Enter');
  expect(/2 files changed/.test(await text('.save-state')), 'publisher change also marks the issues file (' + await text('.save-state') + ')');
  const tree1 = await save();
  const pubs = (await rowsOf(tree1.files[LIB_ISSUES].text)).map(r => r.Publisher);
  expect(pubs.filter(p => p === 'Benj. R. Tucker').length === inheritPublisher, 'the ' + inheritPublisher + ' Liberty issues that inherit the publisher now carry the new one');
  await page.click('button:has-text("Undo")');
  const tree1b = await save();
  expect(tree1b.files[LIB_ISSUES].text === seed[LIB_ISSUES], 'undo and save restore the issues file exactly');

  // ── Stage 2 ──
  step('Issues: overview and the run');
  await go('#/issues/LIBERTYX-1881');
  await page.waitForSelector('table.list tbody tr');
  expect((await page.locator('table.list tbody tr.row-link').count()) === libIssues.length, 'overview lists ' + libIssues.length + ' Liberty issues');
  expect(/403 issues of 403 known/.test(await text('.summary')), 'summary counts against Total Known Issues');
  await shot('04-issues-overview');
  await page.click('table.list tbody tr.row-link >> nth=0');
  await page.waitForSelector('.issue-form');
  expect((await page.locator('.run-item').count()) === libIssues.length, 'run list beside the issue shows every issue');
  expect(/Liberty …/.test(await text('.run-title')) && (await text('.run-item.on .ri-name')) === 'V1 I1 N1', 'run list drops the shared "Liberty" and shows V1 I1 N1');
  expect(/Vol\. 1, no\. 1 \(whole no\. 1\)\. August 6, 1881\. 4 pp\.$/.test((await text('.entry-main')).trim()), 'entry typeset: ' + (await text('.entry-main')).trim());

  step('Edit an existing issue, override and restore an inherited field');
  await page.fill('#f-issueDesignation', 'Specimen number');
  await page.locator('#f-issueDesignation').press('Enter');
  expect(/1 file changed/.test(await text('.save-state')), 'editing an issue changes the issues file only');
  await page.evaluate(() => { document.querySelector('details.group').open = true; });
  const cityPh = await page.getAttribute('#f-city', 'placeholder');
  await page.fill('#f-city', 'Philadelphia');
  await page.locator('#f-city').press('Enter');
  const ov = await page.evaluate(() => SC.session.store.state.issues.get(SC.ui.parseRoute().issueID).overrides);
  expect(ov.indexOf('city') !== -1, 'typing in an inherited field overrides it for this issue');
  expect(/Set for this issue\. Title: /.test(await text('.field:has(#f-city) .inh-note')), 'the field shows the title\'s value beside the override (' + (await text('.field:has(#f-city) .inh-note')).replace(/\s+/g, ' ') + ')');
  await shot('05-issue-override');
  await page.click('.field:has(#f-city) .inh-note button');
  const ov2 = await page.evaluate(() => SC.session.store.state.issues.get(SC.ui.parseRoute().issueID));
  expect(ov2.overrides.indexOf('city') === -1 && ov2.city === '' && (await page.inputValue('#f-city')) === '' && (await page.getAttribute('#f-city', 'placeholder')) === cityPh, '"use title\'s" inherits the title\'s city again');
  await clickAway();
  for (let k = 0; k < 3; k++) await page.click('button:has-text("Undo")');
  expect(/All changes saved/.test(await text('.save-state')), 'undo takes the issue back to what was saved, and nothing shows as changed');
  await page.click('button:has-text("Redo")');
  expect(/1 file changed/.test(await text('.save-state')), 'redo marks it changed again');
  await page.click('button:has-text("Undo")');

  step('Record new issues');
  const lastID = libIssues.sort((a, b) => a.entryOrder - b.entryOrder)[libIssues.length - 1].issueID;
  await go('#/issues/LIBERTYX-1881/' + lastID);
  await page.waitForSelector('.issue-form');
  await page.click('.sticky-actions button:has-text("New issue after this")');
  await page.waitForSelector('.draft-card');
  const vals = async () => ({ v: await page.inputValue('#f-volume'), i: await page.inputValue('#f-issue'), n: await page.inputValue('#f-number'), m: await page.inputValue('#f-months'), y: await page.inputValue('#f-year'), s: await page.inputValue('#f-shortname') });
  let d = await vals();
  expect(d.v === '17' && d.i === '2' && d.n === '404', 'numbers move on: vol. 17, no. 2, whole no. 404 (' + [d.v, d.i, d.n].join(' / ') + ')');
  expect(d.m === 'Aug' && d.y === '1908', 'date moves on by the last step, four months: Aug 1908 (' + d.m + ' ' + d.y + ')');
  expect(d.s === 'Liberty V17 I2 N404', 'short name follows the pattern: ' + d.s);
  expect(/fields? not yet addressed/.test(await text('.draft-card .entry-facts')), 'draft shows the count of fields not yet addressed');
  await shot('06-issue-draft');
  await page.keyboard.press('Control+Enter');
  await page.waitForFunction(() => /Recorded/.test((document.querySelector('.message') || {}).textContent || ''));
  expect(/404 issues/.test(await text('.run-count')), 'Ctrl+Enter records it: 404 issues in the run');
  d = await vals();
  expect(d.i === '3' && d.n === '405' && d.m === 'Dec' && d.s === 'Liberty V17 I3 N405', 'the next draft is ready: no. 3, whole no. 405, Dec (' + [d.i, d.n, d.m, d.s].join(' / ') + ')');
  expect(await page.evaluate(() => document.activeElement && document.activeElement.id === 'f-volume'), 'typing starts in the first field of the new draft');
  await page.click('.advance-bar button:has-text("Start next volume")');
  d = await vals();
  expect(d.v === '18' && d.i === '1' && d.s === 'Liberty V18 I1 N405', 'Start next volume: vol. 18, no. 1 (' + d.s + ')');
  await page.fill('#f-shortname', 'Liberty, last issue');
  await page.locator('#f-shortname').press('Enter');
  await page.fill('#f-pages', '8');
  await page.locator('#f-pages').press('Tab');
  expect((await page.inputValue('#f-shortname')) === 'Liberty, last issue', 'a short name you type stays yours');
  await page.click('.sticky-actions button:has-text("Record issue")');
  await page.waitForFunction(() => /Recorded Liberty, last issue/.test((document.querySelector('.message') || {}).textContent || ''));
  const tree2 = await save();
  const issRows = await rowsOf(tree2.files[LIB_ISSUES].text);
  const added = issRows.slice(-2);
  const lastSeed = (await rowsOf(seed[LIB_ISSUES])).slice(-1)[0];
  expect(issRows.length === libIssues.length + 2, 'issues file now has ' + (libIssues.length + 2) + ' rows');
  expect(added.every(r => /^LIBERTYX-1881-K[2-9A-HJKMNP-WYZ]{6}$/.test(r.IssueID)), 'new IssueIDs follow the pattern: ' + added.map(r => r.IssueID).join(', '));
  expect(added[0]['Short Name'] === 'Liberty V17 I2 N404' && added[1]['Short Name'] === 'Liberty, last issue' && added[1].Volume === '18' && added[1].Pages === '8', 'recorded values saved');
  expect(added.every(r => r['Overridden Fields'] === lastSeed['Overridden Fields'] && r.City === lastSeed.City), 'title-level fields the previous issue set are carried over (' + lastSeed['Overridden Fields'] + ')');
  expect(added[0]['Entry Order'] === String(Number(lastSeed['Entry Order']) + 1), 'new issues are entered after the last one');
  await clickAway();
  await page.click('button:has-text("Undo")');
  await page.click('button:has-text("Undo")');
  const tree3 = await save();
  expect(tree3.files[LIB_ISSUES].text === seed[LIB_ISSUES], 'undoing both and saving restores the issues file exactly');

  // ── Stage 3 ──
  step('Contents: the grid');
  const second = libIssues[1].issueID;
  await go('#/contents/LIBERTYX-1881/' + second);
  await page.waitForSelector('table.grid-toc');
  const before = await itemsHere();
  expect((await page.locator('table.grid-toc tbody tr').count()) === before.length + 1, before.length + ' items and an empty row to add the next');
  expect(before.every((c, k) => c.seq === String(k + 1)), 'items in Sequence order');
  await shot('07-contents-grid');

  step('Type a new item, with author completion');
  await page.click('tr.draft-row:last-child td.c-itemTitle .cell');
  await page.keyboard.type('A Typed Item');
  await page.keyboard.press('Tab');
  await page.keyboard.type(topAuthor.slice(0, 4));
  const comp = await page.evaluate(() => { const el = document.activeElement; return { v: el.value, a: el.selectionStart, b: el.selectionEnd }; });
  expect(comp.v === topAuthor && comp.a === 4 && comp.b === topAuthor.length, 'typing "' + topAuthor.slice(0, 4) + '" completes the most used author, "' + topAuthor + '", selected');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(80);
  let items = await itemsHere();
  const typed = items[items.length - 1];
  expect(items.length === before.length + 1 && typed.title === 'A Typed Item' && typed.author === topAuthor && typed.seq === String(items.length), 'item added at the end with title, author and sequence ' + typed.seq);
  expect(await page.evaluate(() => !!document.activeElement.closest('tr.draft-row') && /:author$/.test(document.activeElement.getAttribute('data-cell'))), 'Enter moves down to the new empty row, same column');

  step('Paste a table of contents');
  await paste('tr.draft-row:last-child td.c-itemTitle .cell', 'A Section ........ 5\nA Poem, p. 5\nAnother Poem  6-7');
  await page.waitForTimeout(120);
  await clickAway();
  items = await itemsHere();
  const pasted = items.slice(-3);
  expect(pasted.map(c => c.title + '|' + c.start + '|' + c.end).join(' ; ') === 'A Section|5| ; A Poem|5| ; Another Poem|6|7', 'three pasted lines became three items with pages: ' + pasted.map(c => c.title + ' ' + c.start + (c.end ? '–' + c.end : '')).join(', '));

  step('Nest, move, delete, undo');
  const rowCell = i => page.locator('table.grid-toc tbody tr').nth(i).locator('td.c-itemTitle .cell');
  const n0 = items.length;
  await rowCell(n0 - 2).click();
  await page.keyboard.press('Alt+Shift+ArrowRight');
  await rowCell(n0 - 1).click();
  await page.click('.grid-tools button:has-text("Nest")');
  items = await itemsHere();
  expect(items[n0 - 2].parent === items[n0 - 3].id && items[n0 - 1].parent === items[n0 - 3].id, 'both poems nested in the section');
  expect((await page.locator('.nest-mark').count()) >= 2, 'nested items are indented');
  await rowCell(n0 - 3).click();
  await page.keyboard.press('Alt+Shift+ArrowUp');
  items = await itemsHere();
  expect(items[n0 - 4].title === 'A Section' && items[n0 - 3].title === 'A Poem' && items[n0 - 2].title === 'Another Poem' && items[n0 - 1].title === 'A Typed Item', 'moving the section up takes its nested items along');
  expect(items.every((c, k) => c.seq === String(k + 1)), 'sequence numbers kept 1..n');
  await shot('08-contents-nested');
  await rowCell(n0 - 1).click();
  await page.click('.grid-tools button:has-text("Delete")');
  items = await itemsHere();
  expect(items.length === n0 - 1 && !items.some(c => c.title === 'A Typed Item'), 'delete removes the item');
  await clickAway();
  await page.click('button:has-text("Undo")');
  items = await itemsHere();
  expect(items.length === n0 && items[n0 - 1].title === 'A Typed Item', 'undo brings it back');

  step('Add several items');
  await page.click('button:has-text("Add several items")');
  await page.fill('.bulk-text', 'Editorial, by B. R. Tucker ...... 9\n  Sub one .... 9\nLetters  10');
  await page.check('.bulk-opts label:has-text("Split") input');
  await page.check('.bulk-opts label:has-text("nest") input');
  expect((await page.locator('.bulk-preview tbody tr').count()) === 3, 'preview shows three items before adding');
  await page.click('.bulk .btn.primary');
  items = await itemsHere();
  const bulk = items.slice(-3);
  expect(bulk[0].title === 'Editorial' && bulk[0].author === 'B. R. Tucker' && bulk[1].parent === bulk[0].id && !bulk[2].parent, 'bulk add splits the author and nests the indented line');

  step('Save contents');
  const tree4 = await save();
  const cRows = (await rowsOf(tree4.files[LIB_CONTENTS].text)).filter(r => r.IssueID === second);
  const byId = Object.fromEntries(cRows.map(r => [r.ContentID, r]));
  expect(cRows.length === items.length, 'contents file holds ' + items.length + ' items for the issue');
  const sec = cRows.find(r => r['Item Title'] === 'A Section'), poem = cRows.find(r => r['Item Title'] === 'A Poem');
  expect(sec && poem && poem['Parent ContentID'] === sec.ContentID && poem['Parent Item'] === 'A Section' && /Parent Item/.test(sec['N/A Fields']), 'nesting saved as Parent ContentID and Parent Item; top-level items mark Parent Item N/A');
  expect(cRows.every(r => /^LIBERTYX-1881-C[2-9A-HJKMNP-WYZ]{6}$/.test(r.ContentID)) && Object.keys(byId).length === cRows.length, 'every item has its own ContentID');
  expect(cRows.every(r => r['Issue Reference'] === libIssues[1].shortname), 'Issue Reference carries the short name');
  expect(Object.keys(tree4.files).filter(n => tree4.files[n].text !== seed[n]).sort().join(',') === [LIB_CONTENTS, 'SCAT_EGOIST-JOURNALS_TITLES.csv'].sort().join(','), 'only the Liberty contents file (and the Titles file saved earlier) differ from the originals');

  step('On to the next issue');
  await page.click('.next-issue a');
  await page.waitForTimeout(80);
  expect((await page.evaluate(() => SC.ui.parseRoute().issueID)) === libIssues[2].issueID, 'Next issue opens the third issue\'s contents');
  await page.keyboard.press('Alt+PageUp');
  await page.waitForTimeout(80);
  expect((await page.evaluate(() => SC.ui.parseRoute().issueID)) === second, 'Alt+Page Up goes back');

  step('Nested contents (Modern Slavery)');
  await page.selectOption('.context-bar select >> nth=0', 'MODSLAVX-2012');
  await page.waitForSelector('table.list tbody tr');
  await page.click('table.list tbody tr >> nth=0');
  await page.waitForSelector('table.grid-toc');
  expect((await page.locator('.nest-mark').count()) > 0, 'nested items shown under their parent');

  step('Run strips');
  await go('#/issues/MINONEXX-1963');
  await page.waitForSelector('.strip');
  expect((await page.locator('.strip-cells .sc.gap').count()) === 8 && /8 missing/.test(await text('.strip-head')), 'Minus One: the strip marks the 8 missing numbers');
  const years = await page.locator('.strip-label').allInnerTexts();
  expect(years.join(',') === years.slice().sort().join(','), 'year rows in order');
  await go('#/contents/LIBERTYX-1881');
  await page.waitForSelector('.strip');
  expect((await page.locator('.strip-label').count()) === 17, 'Liberty: a row for each of 17 volumes');
  await page.click('.strip-cells a.sc >> nth=4');
  await page.waitForSelector('table.grid-toc');
  expect((await page.evaluate(() => SC.ui.parseRoute().issueID)) === libIssues[4].issueID, 'a square in the Contents picker opens that issue\'s contents');
  await go('#/library/LIBERTYX-1881');
  await page.waitForSelector('.entry-card .strip');
  expect(true, 'the title page shows its run');
  await shot('10-strip');

  step('Library › Names');
  await go('#/library');
  await page.click('.lib-tabs a:has-text("Names")');
  await page.waitForSelector('.nm-list');
  expect(/Names [\d,]+/.test(await text('.lib-tabs')), 'Names tab with a count of names');
  await page.fill('.toolbar input.search', 'tucker');
  await page.click('.nm-row:has(.nm-label:text-is("Benjamin R. Tucker"))');
  await page.waitForSelector('.nm-make');
  expect((await page.inputValue('.nm-name-input')) === 'Tucker, Benjamin R.', 'suggested heading: Tucker, Benjamin R.');
  const groupForms = await page.locator('.nm-group .nm-form').allInnerTexts();
  expect(groupForms.indexOf('B.R.T.') !== -1 && groupForms.indexOf('Benj. R. Tucker') !== -1, 'likely forms of the same name include B.R.T. and Benj. R. Tucker');
  await shot('11-name');
  await page.click('.nm-group button:has-text("Combine")');
  await page.waitForSelector('.nm-forms');
  const headingID = await page.evaluate(() => SC.ui.parseRoute().titleID);
  expect(/^AU-[2-9A-HJKMNP-WYZ]{6}$/.test(headingID), 'a heading with its AuthorityID (' + headingID + ')');
  const formsBefore = await page.locator('.nm-forms > .nm-formlist li').count();
  await page.click('.nm-maybe li:has(.nm-form:text-is("Tucker")) button');
  expect((await page.locator('.nm-forms > .nm-formlist li').count()) === formsBefore + 1, 'adding the bare surname "Tucker" from the possible forms');
  await page.selectOption('#f-a-status', 'Confirmed');
  await page.fill('#f-a-dates', '1854–1939');
  await page.locator('#f-a-dates').press('Enter');
  expect(/1854–1939/.test(await text('.nm-detail .entry-main')), 'heading dates');
  await shot('12-heading');
  const treeN = await save();
  const auth = treeN.files['SCAT_EGOIST-JOURNALS_AUTHORITIES.csv'];
  const authRows = auth ? await rowsOf(auth.text) : [];
  expect(authRows.length === 1 && authRows[0]['Authorized Form'] === 'Tucker, Benjamin R.' && authRows[0].Status === 'Confirmed' && /B\.R\.T\./.test(authRows[0]['Variant Forms']) && / \| Tucker$| \| Tucker \|/.test(authRows[0]['Variant Forms']),
    'saved to SCAT_EGOIST-JOURNALS_AUTHORITIES.csv: heading, status, forms');
  expect(treeN.files[LIB_CONTENTS].text === tree4.files[LIB_CONTENTS].text, 'Liberty contents file untouched by making a heading');
  await page.click('.seg-btn:has-text("Suggested matches")');
  await page.waitForSelector('.nm-group');
  expect((await page.locator('.nm-group').count()) > 10, 'suggested matches listed (' + await page.locator('.nm-group').count() + ')');

  // ── Stage 4 ──
  step('Compiler: one title');
  const filesBefore = JSON.stringify(await page.evaluate(() => Object.keys(window.__SC_TEST_FS__.tree().files).sort()));
  await go('#/compiler/LIBERTYX-1881');
  await page.waitForSelector('.cmp-bar');
  const stamp = await page.evaluate(() => { const d = new Date(); return d.getFullYear() + String(d.getMonth() + 1).padStart(2, '0') + String(d.getDate()).padStart(2, '0'); });
  const libNow = await page.evaluate(() => ({ issues: SC.session.store.issuesOfTitle('LIBERTYX-1881').length, items: SC.session.store.contentsOfTitle('LIBERTYX-1881').length }));
  expect((await text('.cmp-file code')) === 'SCATOUT_EGOIST-JOURNALS_LIBERTYX-1881_CATALOG_' + stamp + '.html', 'catalog of the current title, named SCATOUT_EGOIST-JOURNALS_LIBERTYX-1881_CATALOG_<date>.html');
  expect(/1 title · 403 issues/.test(await text('.cmp-counts')), 'counts the whole run (' + await text('.cmp-counts') + ')');
  const frame = page.frameLocator('.cmp-frame');
  expect(/Liberty/.test(await frame.locator('.journal-title').first().innerText()) && (await frame.locator('.issue').count()) === 25, 'preview shows the catalog, first 25 issues');
  await shot('10-compiler-catalog');
  const grab = async () => { const [dl] = await Promise.all([page.waitForEvent('download'), page.click('.cmp-actions button:has-text("Download")')]); return { name: dl.suggestedFilename(), text: fs.readFileSync(await dl.path(), 'utf8') }; };
  let got = await grab();
  expect((got.text.match(/<div class="issue" id=/g) || []).length === libNow.issues, 'downloaded catalog has all ' + libNow.issues + ' issues');
  await page.click('.cmp-output:has(.co-label:text-is("RIS"))');
  expect(/^TY {2}- JOUR/.test(await text('.cmp-text')), 'RIS preview');
  got = await grab();
  expect(/_RIS-ZOTERO_\d{8}\.ris$/.test(got.name) && (got.text.match(/^TY {2}- /gm) || []).length === libNow.items, 'RIS download has one record per item (' + libNow.items + ')');
  expect(/AU {2}- Tucker, Benjamin R\.\n[\s\S]*?N1 {2}- Credited as: B\.R\.T\./.test(got.text), 'RIS gives the heading as author and the credit as printed in a note');
  await page.click('.cmp-output:has(.co-label:text-is("Name index"))');
  expect(/Tucker, Benjamin R\./.test(await frame.locator('body').innerText()), 'name index preview');
  await page.click('.seg-btn:has-text("Plain text")');
  got = await grab();
  expect(/_NAME-INDEX_\d{8}\.txt$/.test(got.name) && /^Tucker, Benjamin R\., 1854–1939 \(as /m.test(got.text) && /^B\.R\.T\. see Tucker, Benjamin R\.$/m.test(got.text), 'name index: the heading with its forms, and B.R.T. see Tucker, Benjamin R.');
  await page.click('.cmp-output:has(.co-label:text-is("Proofing catalog"))');
  got = await grab();
  expect((got.text.match(/<section class="proof-issue">/g) || []).length === libNow.issues && /_PROOFING-CATALOG_/.test(got.name), 'proofing catalog: a section for every issue');
  await page.click('.cmp-output:has(.co-label:text-is("Checklist"))');
  await page.click('.seg-btn:has-text("Plain text")');
  await page.click('.seg-btn:text-is("Plain")');
  got = await grab();
  expect(/_CHECKLIST_\d{8}\.txt$/.test(got.name) && (got.text.match(/^☐ /gm) || []).length === libNow.issues, 'plain-text checklist, one line per issue');
  expect(/☐ Vol\. 1, no\. 1 \(whole no\. 1\) — August 6, 1881/.test(got.text), 'checklist line: Vol. 1, no. 1 (whole no. 1) — August 6, 1881');
  await page.click('label:has-text("Some volumes") input');
  await page.click('.cmp-groups button:has-text("None")');
  await page.click('.cmp-groups label:has-text("Volume 3 ") input');
  expect(/26 issues/.test(await text('.cmp-counts')), 'choosing volume 3 alone: 26 issues');
  await shot('11-compiler-checklist');

  step('Compiler: several titles');
  await page.click('.cmp-block-head button:has-text("All")');
  await page.click('.cmp-output:has(.co-label:text-is("BibTeX"))');
  const allItems = await page.evaluate(() => { const st = SC.session.store; let n = 0; st.state.issues.forEach(i => { n += st.contentsOfIssue(i.issueID).length; }); return n; });
  got = await grab();
  expect(got.name === 'SCATOUT_EGOIST-JOURNALS_BIBTEX_' + stamp + '.bib', 'several titles: the library name alone (' + got.name + ')');
  expect((got.text.match(/^@article\{/gm) || []).length === allItems, 'BibTeX for the whole library: ' + allItems + ' entries');
  expect(JSON.stringify(await page.evaluate(() => Object.keys(window.__SC_TEST_FS__.tree().files).sort())) === filesBefore && /All changes saved|changed/.test(await text('.save-state')), 'compiling writes nothing to the library folder');

  step('A new title, its first issue and its first item');
  await page.click('.stage:has-text("Library")');
  await page.click('button:has-text("Add title")');
  await page.fill('#f-canonicalTitle', 'The Egoist');
  await page.locator('#f-canonicalTitle').press('Tab');
  await page.waitForFunction(() => document.getElementById('f-titleCode').value !== '', null, { timeout: 3000 }).catch(() => {});
  expect((await page.inputValue('#f-titleCode')) === 'EGOISTXX', 'title code suggested as EGOISTXX (' + await page.inputValue('#f-titleCode') + ')');
  const order = await page.$$eval('fieldset.group:first-of-type input', els => els.map(e => e.id));
  expect(order[0] === 'f-canonicalTitle', 'canonical title is the first field of the form');
  await page.fill('#f-firstYear', '1914');
  await page.locator('#f-firstYear').press('Tab');
  await page.click('.sticky-actions button:has-text("Add title")');
  await page.waitForSelector('.entry-id');
  expect(/EGOISTXX-1914/.test(await text('.entry-id')), 'new TitleID EGOISTXX-1914');
  await go('#/issues/EGOISTXX-1914');
  await page.click('.panel-head button:has-text("Record the first issue")');
  await page.waitForSelector('.draft-card');
  await page.fill('#f-volume', '1');
  await page.locator('#f-volume').press('Tab');
  await page.fill('#f-issue', '1');
  await page.locator('#f-issue').press('Tab');
  await page.click('.months-pick button:has-text("Jan")');
  await page.fill('#f-year', '1914');
  await page.locator('#f-year').press('Tab');
  expect((await page.inputValue('#f-shortname')) === 'The Egoist V1 I1', 'a first issue gets the default short name (' + await page.inputValue('#f-shortname') + ')');
  await page.click('.sticky-actions button:has-text("Record issue")');
  await page.waitForFunction(() => /Recorded/.test((document.querySelector('.message') || {}).textContent || ''));
  const eg = await page.evaluate(() => SC.session.store.issuesOfTitle('EGOISTXX-1914').map(i => i.issueID));
  await go('#/contents/EGOISTXX-1914/' + eg[0]);
  await page.waitForSelector('table.grid-toc');
  await page.click('tr.draft-row:last-child td.c-itemTitle .cell');
  await page.keyboard.type('Views and Comments');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(80);

  const firstCID = await page.evaluate(() => Array.from(SC.session.store.state.contents.keys())[0]);
  step('Reload: work restored from the browser');
  await page.reload();
  await page.waitForSelector('.topbar');
  const dirty2 = await text('.save-state');
  expect(/changed/.test(dirty2), 'unsaved new title, issue and item survive reload (' + dirty2 + ')');
  await page.goto('file://' + app + '#/library');
  await page.waitForSelector('table.shelf tbody tr');
  expect((await page.locator('table.shelf tbody tr').count()) === st.titles.size + 1, (st.titles.size + 1) + ' titles after reload');
  expect(await page.evaluate(id => SC.session.store.state.contents.has(id), firstCID), 'ContentIDs are the same after reload');
  const tree5 = await save();
  expect(/EGOISTXX-1914/.test(tree5.files['SCAT_EGOIST-JOURNALS_TITLES.csv'].text), 'new title saved to the Titles file');
  const egIss = tree5.files['SCAT_EGOIST-JOURNALS_EGOISTXX-1914_ISSUES.csv'], egCon = tree5.files['SCAT_EGOIST-JOURNALS_EGOISTXX-1914_CONTENTS.csv'];
  expect(!!egIss && (await rowsOf(egIss.text)).length === 1 && (await rowsOf(egIss.text))[0]['Month(s)'] === 'Jan', 'new Issues file for the new title, with its first issue');
  expect(!!egCon && (await rowsOf(egCon.text))[0]['Item Title'] === 'Views and Comments', 'new Contents file for the new title, with its first item');
  await shot('09-dashboard-after');

  step('Guide');
  await page.click('text=Guide');
  expect(/Recording issues/.test(await text('.guide')) && /Recording contents/.test(await text('.guide')) && /Compiling/.test(await text('.guide')) && /Names and headings/.test(await text('.guide')), 'guide covers recording issues and contents, names, and compiling');

  console.log(log.join('\n'));
  if (errors.length) { console.log('\nPage errors:\n' + errors.join('\n')); failures += errors.length; }
  console.log(failures ? '\nFAILED (' + failures + ')' : '\nPASSED');
  await browser.close();
  process.exit(failures ? 1 : 0);
})().catch(async e => { console.log((globalThis.__log || []).join('\n')); console.log((globalThis.__errors || []).join('\n')); console.error(e.message.split('\n')[0]); if (globalThis.__page && process.argv[5]) await globalThis.__page.screenshot({ path: path.join(process.argv[5], 'failure.png') }); process.exit(2); });
