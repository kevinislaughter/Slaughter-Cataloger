/* Slaughter Cataloger 3 — UI kit: rendering, hooks, routing, and the
   schema-driven field used by every form. */
(function (SC) {
  'use strict';
  const { h, Fragment } = globalThis.preact;
  const { useState, useEffect, useRef, useMemo, useCallback } = globalThis.preactHooks;
  const html = globalThis.htm.bind(h);
  const S = SC.schema, R = SC.records;

  // Re-render when the store or session changes.
  function useStore() {
    const store = SC.session.store;
    const [, setV] = useState(store.version);
    useEffect(() => store.subscribe(v => setV(v)), []);
    return store;
  }
  function useSessionUI() {
    const [, setN] = useState(0);
    useEffect(() => SC.session.subscribeUI(() => setN(n => n + 1)), []);
    return SC.session.ui;
  }

  // ── Routing: #/panel/titleID/issueID ──────────────────────────────────
  const PANELS = ['library', 'names', 'issues', 'contents', 'compiler', 'guide'];
  function parseRoute() {
    const parts = (location.hash || '').replace(/^#\/?/, '').split('/').map(decodeURIComponent);
    const panel = PANELS.indexOf(parts[0]) !== -1 ? parts[0] : 'library';
    return { panel, titleID: parts[1] || '', issueID: parts[2] || '' };
  }
  function routeHref(r) {
    return '#/' + [r.panel, r.titleID, r.issueID].filter((x, i) => i === 0 || x).map(encodeURIComponent).join('/');
  }
  function navigate(r, replace) {
    const cur = parseRoute();
    const next = Object.assign({}, cur, r);
    if (r.panel && r.titleID === undefined) next.titleID = cur.titleID;
    const href = routeHref(next);
    if (href === location.hash) return;
    if (replace) history.replaceState(null, '', href); else location.hash = href;
    if (replace) window.dispatchEvent(new HashChangeEvent('hashchange'));
  }
  function useRoute() {
    const [route, setRoute] = useState(parseRoute());
    useEffect(() => {
      const on = () => setRoute(parseRoute());
      window.addEventListener('hashchange', on);
      return () => window.removeEventListener('hashchange', on);
    }, []);
    return route;
  }

  // ── Small helpers ─────────────────────────────────────────────────────
  const fmt = n => Number(n || 0).toLocaleString('en-US');
  const plural = (n, one, many) => fmt(n) + ' ' + (n === 1 ? one : (many || one + 's'));
  const cls = (...xs) => xs.filter(Boolean).join(' ');

  // Field states. spec / na hold canonical CSV headers.
  function fieldState(rec, col) {
    const spec = (rec.spec || []).indexOf(col.header) !== -1;
    const na = (rec.na || []).indexOf(col.header) !== -1;
    return { spec, na };
  }
  // Returns a patch for the record after toggling '?' or 'N/A' on a field.
  function toggleState(ent, rec, col, which) {
    let spec = (rec.spec || []).slice(), na = (rec.na || []).slice();
    const has = (arr) => arr.indexOf(col.header) !== -1;
    const without = (arr) => arr.filter(x => x !== col.header);
    const patch = {};
    if (which === 'spec') {
      if (has(spec)) spec = without(spec); else { spec.push(col.header); na = without(na); }
    } else {
      if (has(na)) na = without(na); else { na.push(col.header); spec = without(spec); patch[col.key] = ''; }
    }
    patch.spec = R.orderStates(ent, spec);
    patch.na = R.orderStates(ent, na);
    patch.speculative = patch.spec.length > 0;
    return patch;
  }
  // Uncertain value, bibliographic style: "1881" -> "[1881?]"; an already supplied "[Untitled]" -> "[Untitled?]".
  function uncertain(v) {
    const t = String(v == null ? '' : v);
    const m = /^\[(.*)\]$/.exec(t.trim());
    return html`<span class="unc">[${m ? m[1] : t}${/\?$/.test(m ? m[1] : t) ? '' : '?'}]</span>`;
  }
  // How an issue is named in lists: its short name, else its numbers.
  const issueLabel = i => i.shortname || [i.volume && 'Vol. ' + i.volume, i.issue && 'No. ' + i.issue, i.number && 'Whole No. ' + i.number].filter(Boolean).join(', ') || i.issueDesignation || i.issueID || 'New issue';
  // "Aug 20, 1881", "March–April 1989", "Dec–Jan 1989–1990"; the printed date when nothing else is known.
  function issueDate(i) {
    const y = i.year ? (i.yearEnd && i.yearEnd !== i.year ? i.year + '–' + i.yearEnd : i.year) : '';
    const md = [i.months, i.day].filter(Boolean).join(' ');
    return (md && y ? md + (i.day ? ', ' : ' ') + y : md || y) || i.datePrinted || '';
  }
  const isUnaddressed = (col, value, st) => col.states && !st.spec && !st.na && String(value == null ? '' : value).trim() === '';

  // ── Field ─────────────────────────────────────────────────────────────
  /* props: col, value, state {spec,na}, onCommit(v), onToggle(which), placeholder,
            readOnly, note (small text under the input), invalid (message),
            inheritedValue (issues: the title's value, shown when this record has none of its own),
            onReset (go back to the inherited value), children (shown under the input) */
  function Field(p) {
    const col = p.col, st = p.state || { spec: false, na: false };
    const str = v => v == null ? '' : String(v);
    // While the person is typing, the field shows what they typed; otherwise it shows the record's
    // value, so changes from outside (undo, a suggestion, the next draft) appear at once. Only typing
    // is committed: leaving a field you did not type in never writes to the record.
    const [draft, setDraft] = useState(str(p.value));
    const typed = useRef(false);
    const shown = typed.current ? draft : str(p.value);
    const commit = (v) => { typed.current = false; if (String(v) !== str(p.value)) p.onCommit(v); else setDraft(str(p.value)); };
    const id = 'f-' + (p.idPrefix || '') + col.key;
    const inheriting = p.inheritedValue !== undefined && !st.na && str(p.value) === '';
    const overriding = p.inheritedValue !== undefined && !inheriting;
    const unaddressed = !p.readOnly && !inheriting && isUnaddressed(col, p.value, st);
    const common = {
      id, disabled: p.readOnly || p.valueLocked || st.na, title: col.tip || '',
      'data-sc-field': '', 'data-pending': typed.current && draft !== str(p.value) ? 'true' : undefined,
      onBlur: (e) => { if (typed.current) commit(e.target.value); },
      onInput: (e) => { typed.current = true; setDraft(e.target.value); },
      onKeyDown: (e) => {
        if (e.key === 'Escape') { typed.current = false; setDraft(str(p.value)); e.target.blur(); }
        if (e.key === 'Enter' && col.type !== 'long') { e.preventDefault(); if (typed.current) commit(e.target.value); }
      }
    };
    let input;
    if (col.type === 'enum') {
      const opts = col.options.slice();
      if (p.value && opts.indexOf(p.value) === -1) opts.push(p.value);   // keep values the list does not know
      input = html`<select id=${id} disabled=${p.readOnly} value=${p.value || ''} onChange=${e => p.onCommit(e.target.value)}>
        ${!col.required && html`<option value="">—</option>`}
        ${opts.map(o => html`<option value=${o}>${o}</option>`)}</select>`;
    } else if (col.type === 'bool') {
      input = html`<label class="check"><input type="checkbox" id=${id} disabled=${p.readOnly} checked=${!!p.value} onChange=${e => p.onCommit(e.target.checked)} /> ${p.checkLabel || 'Yes'}</label>`;
    } else if (col.type === 'long') {
      input = html`<textarea rows="3" ...${common} value=${st.na ? '' : shown} placeholder=${st.na ? 'not applicable' : (p.inheritedValue || p.placeholder || '')}></textarea>`;
    } else {
      input = html`<input type="text" autocomplete="off" spellcheck=${col.type === 'text'} ...${common} value=${st.na ? '' : shown}
        placeholder=${st.na ? 'not applicable' : (p.inheritedValue || p.placeholder || '')} inputmode=${col.type === 'int' ? 'numeric' : undefined} />`;
    }
    return html`<div class=${cls('field', 'span-' + (col.span || 1), st.spec && 'is-spec', st.na && 'is-na', unaddressed && 'is-unaddressed', p.invalid && 'is-invalid', inheriting && 'is-inherited', p.className)}>
      <div class="field-head">
        <label for=${id} title=${col.tip || ''}>${p.label || col.label}${inheriting && html` <span class="src">from title</span>`}</label>
        ${col.states && !p.readOnly && html`<span class="toggles">
          <button type="button" class=${cls('tog', st.spec && 'on')} aria-pressed=${st.spec} title="Speculative: inferred, uncertain, or from a secondary source" onClick=${() => p.onToggle('spec')}>?</button>
          ${!col.noNA && html`<button type="button" class=${cls('tog', st.na && 'on')} aria-pressed=${st.na} title="Not applicable: considered, and does not apply" onClick=${() => p.onToggle('na')}>N/A</button>`}
        </span>`}
      </div>
      ${input}
      ${overriding && p.onReset && !p.readOnly && html`<div class="field-note inh-note">${st.na ? 'Not applicable to this issue' : 'Set for this issue'}. Title: ${p.inheritedValue ? html`<span class="tv">${p.inheritedValue}</span>` : html`<em>blank</em>`}
        <button type="button" class="link" title="Use the title's value again" onClick=${p.onReset}>use title's</button></div>`}
      ${p.children}
      ${p.invalid ? html`<div class="field-note bad">${p.invalid}</div>` : p.note ? html`<div class="field-note">${p.note}</div>` : null}
    </div>`;
  }

  function Message({ msg, onClose }) {
    if (!msg) return null;
    return html`<div class=${'message ' + msg.level} role="status"><span>${msg.text}</span>
      ${onClose && html`<button type="button" class="link" onClick=${onClose}>Dismiss</button>`}</div>`;
  }

  SC.ui = { h, Fragment, html, useState, useEffect, useRef, useMemo, useCallback, useStore, useSessionUI, useRoute, navigate, parseRoute, routeHref,
    fmt, plural, cls, fieldState, toggleState, isUnaddressed, uncertain, issueLabel, issueDate, Field, Message };
})(globalThis.SC = globalThis.SC || {});
