# Slaughter Cataloger

**A browser-based bibliographic tool for serialized publications.**

Build a structured, exportable bibliography of periodicals — newsletters, magazines, journals, newspapers, zines, bulletins, and any other publication issued in numbered installments. Runs entirely in your browser. No account, no server, no data leaves your machine.

---

## What It Does

The Slaughter Cataloger produces a **canonical issue list**: a record of what was published, when, and under what numbering. It is not a holdings inventory — it does not track which copies you own. It answers the prior question: *what issues exist?*

Each record captures title-level facts (publisher, editor, ISSN, series, city, frequency) and issue-level facts (volume, issue number, whole number, date, contributors, edition, price, pages, size, notes). Output is a 43-column CSV you can open in any spreadsheet application, import into Zotero, or convert to any other format.

---

## How to Use It

1. Download `slaughter-cataloger-beta1.html`
2. Open it in any modern browser
3. Fill in the form, hit **Record**
4. Export to CSV when ready

That's it. No installation, no dependencies, no internet connection required.

Optionally download `slaughter-cataloger-beta1-introduction.html` alongside it for documentation. The two files link to each other and should be kept in the same folder.

---

## Key Features

- **Two-tier form** — Title Level (stable facts about the publication) and Issue Level (facts about a specific numbered issue)
- **Four field states** — Filled, Speculative (?), N/A, and Unaddressed (orange underline) make the status of every field visually clear
- **Examined / Reported** — records the evidential basis of each entry; Reported entries reveal a source note field
- **Issue Designation** — Special toggle annotates an issue (e.g. *Special Poetry Issue*) without displacing its normal Volume / Issue / Whole No. numbering
- **Auto-advance** — Volume, Issue, Whole No., and Month(s) can advance automatically after each record
- **Season mode** — Spring / Summer / Fall / Winter as an alternative to month selection
- **Duplicate detection** — keyed on Title + Series + Volume + Issue + Whole No. + Date as Printed + Edition + Issue Designation
- **Session persistence** — entries auto-save to browser localStorage; restore banner on reopen; 15-minute CSV autosave; unsaved-changes warning on close
- **Undo delete** — six-second undo strip after any row deletion
- **Import / Export** — named CSV columns; original Entry Order restored on re-import; backward-compatible with older exports
- **Hover tooltips** — every field label has an explainer on hover

---

## Documentation

See `slaughter-cataloger-beta1-introduction.html` for a full description of field states, features, and the data model.

---

## Status

**Beta One** — released July 6, 2026.

Functional and ready for real use, but actively being refined based on feedback. Bug reports and suggestions welcome at [thecreep@underworldamusements.com](mailto:thecreep@underworldamusements.com).

---

## License

[Creative Commons Attribution-NonCommercial 4.0 International (CC BY-NC 4.0)](https://creativecommons.org/licenses/by-nc/4.0/)

You are free to use, share, and adapt this tool for non-commercial purposes with attribution.

---

*Developed by Kevin Slaughter / [Underworld Amusements](https://underworldamusements.com)*
