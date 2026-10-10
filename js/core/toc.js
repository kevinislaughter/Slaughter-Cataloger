/* Slaughter Cataloger 3 — the table of contents of one issue, as a flat list.
   Items are kept in Sequence order; nesting shows as depth, from Parent ContentID.
   A nested item always follows its parent, so an item's "subtree" is the run of
   deeper rows right after it. These functions work out what an edit changes;
   the Contents stage applies the result to the store. Pure, testable in Node.

   rows: ordered [{ id, parentID }]  (sequence order, one issue) */
(function (SC) {
  'use strict';

  function depths(rows) {
    const byId = new Map(rows.map(r => [r.id, r]));
    const memo = new Map();
    const depth = r => {
      if (memo.has(r.id)) return memo.get(r.id);
      let d = 0, x = r;
      const seen = new Set([r.id]);
      while (x.parentID && byId.has(x.parentID) && !seen.has(x.parentID)) { seen.add(x.parentID); x = byId.get(x.parentID); d++; }
      memo.set(r.id, d);
      return d;
    };
    return rows.map(depth);
  }

  // Last index of row i's subtree.
  function subtreeEnd(ds, i) {
    let e = i;
    while (e + 1 < ds.length && ds[e + 1] > ds[i]) e++;
    return e;
  }
  // The previous row at the same depth with no shallower row in between (i's previous sibling).
  function prevSibling(ds, i) {
    for (let j = i - 1; j >= 0; j--) { if (ds[j] < ds[i]) return -1; if (ds[j] === ds[i]) return j; }
    return -1;
  }
  // The nearest earlier row at depth d (the parent a row at depth d+1 would have).
  function nearestAt(ds, i, d) {
    if (d < 0) return -1;
    for (let j = i - 1; j >= 0; j--) if (ds[j] === d) return j;
    return -1;
  }

  // Indent: the row becomes the last child of its previous sibling. Returns { id: newParentID } or null.
  function indent(rows, i) {
    const ds = depths(rows);
    const j = prevSibling(ds, i);
    if (j === -1) return null;
    return { [rows[i].id]: rows[j].id };
  }
  // Outdent: the row moves up a level; siblings that follow it become its children,
  // so the list still reads in sequence order. Returns { id: newParentID } or null.
  function outdent(rows, i) {
    const ds = depths(rows);
    if (!ds[i]) return null;
    const g = nearestAt(ds, i, ds[i] - 2);
    const out = { [rows[i].id]: g === -1 ? '' : rows[g].id };
    for (let k = subtreeEnd(ds, i) + 1; k < rows.length && ds[k] >= ds[i]; k++) if (ds[k] === ds[i]) out[rows[k].id] = rows[i].id;
    return out;
  }

  // Move a row (with its nested items) past its previous / next sibling. Returns the new order of ids, or null.
  function moveUp(rows, i) {
    const ds = depths(rows);
    const j = prevSibling(ds, i);
    if (j === -1) return null;
    const e = subtreeEnd(ds, i);
    const ids = rows.map(r => r.id);
    return ids.slice(0, j).concat(ids.slice(i, e + 1), ids.slice(j, i), ids.slice(e + 1));
  }
  function moveDown(rows, i) {
    const ds = depths(rows);
    const e = subtreeEnd(ds, i);
    const k = e + 1;
    if (k >= rows.length || ds[k] !== ds[i]) return null;
    const e2 = subtreeEnd(ds, k);
    const ids = rows.map(r => r.id);
    return ids.slice(0, i).concat(ids.slice(k, e2 + 1), ids.slice(i, e + 1), ids.slice(e2 + 1));
  }
  // Where a new row "below row i" goes: after i's nested items.
  function insertIndex(rows, i) { return subtreeEnd(depths(rows), i) + 1; }
  // The parent a row at depth d placed at index pos would have (by sequence order).
  function parentFor(rows, pos, d) {
    const ds = depths(rows);
    const j = nearestAt(ds.slice(0, pos), pos, d - 1);
    return j === -1 ? '' : rows[j].id;
  }

  // ── Pasted tables of contents ─────────────────────────────────────────
  const COLS = ['itemTitle', 'author', 'contentType', 'startPage', 'endPage', 'notes'];
  const isRoman = s => SC.numbering.isRoman(s);
  const PAGE = '(\\d+|[ivxlcdm]+)';
  const RE_LEADERS = new RegExp('^(.*?\\S)\\s*[.·…_]{2,}\\s*' + PAGE + '(?:\\s*[-–]\\s*' + PAGE + ')?\\s*$', 'i');
  const RE_SPACES = /^(.*?\S)\s{2,}(\d+)(?:\s*[-–]\s*(\d+))?\s*$/;
  const RE_PP = new RegExp('^(.*?\\S)\\s*,?\\s+pp?\\.\\s*' + PAGE + '(?:\\s*[-–]\\s*' + PAGE + ')?\\s*$', 'i');
  const RE_BY = /^(.*?\S)[.,;:]?\s+by\s+(\S.*)$/i;
  const RE_BULLET = /^(?:[•◦▪‣·*]|[–—-](?=\s))\s*/;

  function pagesOf(line) {
    for (const re of [RE_LEADERS, RE_PP, RE_SPACES]) {
      const m = re.exec(line);
      if (!m) continue;
      const okPage = p => !p || /^\d+$/.test(p) || (re !== RE_SPACES && isRoman(p));
      if (okPage(m[2]) && okPage(m[3])) return { rest: m[1], start: m[2], end: m[3] || '' };
    }
    return null;
  }

  /* Lines of text -> [{ values, depth }].
     opts: startCol (column the paste begins in; default itemTitle), pages (find page numbers at
     line ends; default on), by (split "Title, by Author"), nest (two leading spaces = one level). */
  function parseLines(text, opts) {
    opts = opts || {};
    const startCol = COLS.indexOf(opts.startCol) === -1 ? 'itemTitle' : opts.startCol;
    const lines = String(text || '').replace(/\r\n?/g, '\n').split('\n').filter(l => l.trim());
    const out = [];
    const stack = [];
    lines.forEach(line => {
      let depth = 0;
      if (opts.nest) {
        const w = /^[ \t]*/.exec(line)[0].replace(/\t/g, '  ').length;
        while (stack.length && stack[stack.length - 1] >= w) stack.pop();
        depth = stack.length; stack.push(w);
        line = line.replace(/^[ \t]+/, '');
      }
      const values = {};
      if (line.indexOf('\t') !== -1) {
        const cells = line.replace(/\s+$/, '').split('\t').map(c => c.trim());
        const at = COLS.indexOf(startCol);
        if (startCol === 'itemTitle' && cells.length === 2 && /^(\d+|[ivxlcdm]+)(\s*[-–]\s*(\d+|[ivxlcdm]+))?$/i.test(cells[1])) {
          const p = cells[1].split(/\s*[-–]\s*/);
          values.itemTitle = cells[0]; values.startPage = p[0]; if (p[1]) values.endPage = p[1];
        } else cells.forEach((c, k) => { if (at + k < COLS.length) values[COLS[at + k]] = c; });
      } else {
        let v = line.trim().replace(RE_BULLET, '');
        if (startCol === 'itemTitle') {
          const pg = opts.pages === false ? null : pagesOf(v);
          if (pg) { v = pg.rest; values.startPage = pg.start; if (pg.end) values.endPage = pg.end; }
          const by = opts.by ? RE_BY.exec(v) : null;
          if (by) { v = by[1]; values.author = by[2].trim(); }
        }
        values[startCol] = v;
      }
      // Fixed key order makes results easy to compare.
      const ordered = {};
      COLS.forEach(c => { if (c in values) ordered[c] = values[c]; });
      out.push({ values: ordered, depth });
    });
    return out;
  }

  SC.toc = { COLS, depths, subtreeEnd, prevSibling, indent, outdent, moveUp, moveDown, insertIndex, parentFor, parseLines };
})(globalThis.SC = globalThis.SC || {});
