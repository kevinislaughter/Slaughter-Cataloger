# Release smoke test

This is a manual check in a real browser, with a real folder on a real disk. It complements the automated suite (`sh run-tests.sh`), which drives Chromium against an in-memory folder and the browser's private file system, but can't reach your disk, a real spreadsheet, Zotero or WordPress. It takes about 20 minutes.

**Record:** date, browser and version, operating system, and the result of each step (pass, or what happened instead).

## Setup

1. Copy `sample-data/3.0/folkstudies/` to somewhere ordinary, e.g. `Documents/sc3-smoke/`.
2. Open `dist/slaughter-cataloger-3.html` in **Chrome** (and again in **Edge** if you can), straight from disk.

## A. Open, edit, save, back up

| # | Do | Expect |
|---|---|---|
| A1 | **Open library folder**, choose `sc3-smoke`, and allow editing | 1 title, 2 issues, 91 contents items; "All changes saved" |
| A2 | Library → the title → change *General notes*; press Ctrl/⌘+S | "Saved SCAT_FOLKSTUDIES_TITLES.csv. The versions they replaced are in _backups/<date-time>-<code>." |
| A3 | Open the folder on disk: look at `_backups/<that folder>/` | `SCAT_FOLKSTUDIES_TITLES.csv` is the file **as it was before** the edit (open it in a text editor and check the notes; it is the same size as the original was). `BACKUPS.txt` lists it |
| A5 | Delete the `_backups` folder on disk. In the app, edit and Save again | Saved; a new `_backups/<date-time>-<code>/` holds the version it replaced |
| A4 | Open the saved `SCAT_FOLKSTUDIES_TITLES.csv` in a text editor | Your new notes are there; nothing else in the file changed |

## B. Undo past a save (review B-01)

| # | Do | Expect |
|---|---|---|
| B1 | Change *General notes* to "B", then Save | "All changes saved" |
| B2 | Undo (Ctrl/⌘+Z) | The notes go back; "1 file changed" |
| B3 | Type "D" in *General notes* | Still "1 file changed" (not "All changes saved") |
| B4 | Save | The file on disk has "D" |

## C. Reload, crash, reconnect

| # | Do | Expect |
|---|---|---|
| C1 | Edit a contents item's title; **don't save**; reload the tab | **Allow access** banner. After allowing: the edit is there, marked unsaved |
| C2 | Save. Then edit again, without saving, and quit the browser entirely; reopen it and the app | The unsaved edit is restored |
| C3 | Save. With the app still open, open `SCAT_FOLKSTUDIES_TITLES.csv` in a spreadsheet, change a cell, save it there (as **CSV UTF-8**). In the app, edit the title and Save | The message says the file had been changed on disk and names the backup copy of the spreadsheet's version. Check that copy in `_backups/` |
| C4 | Close the app's tab. In the folder, copy `SCAT_FOLKSTUDIES_INSTAURX-1975_ISSUES.csv` to the desktop, then delete it from the folder. Reopen the app and **Allow access** | The issues are still shown; the Library page lists the file as missing. Put the file back and reconnect: "Back in the folder" |
| C5 | Save twice within a few seconds in two separate sessions: Save, then **Open another folder** on the same folder, edit, Save | Two separate backup folders, each holding its own earlier version |

## D. Two tabs

| # | Do | Expect |
|---|---|---|
| D1 | With the library open, open the app in a second tab | "Already open in another tab" |
| D2 | **Use this tab instead** | The second tab has your work; the first says it has stopped |

## E. A broken file

| # | Do | Expect |
|---|---|---|
| E1 | Close the app. In the folder, open the Issues CSV in a text editor and delete one comma on a data row; save | — |
| E2 | Open the folder in the app | The load report names the Issues file and the line; that title shows no issues |
| E3 | Issues → that title → **Record the first issue** → give it a short name → **Record issue** | Refused: "… is in the folder but was not loaded …". The broken file on disk is unchanged |
| E4 | Close the app. Put the Issues file back as it was, then save `SCAT_FOLKSTUDIES_TITLES.csv` from Excel as plain **CSV (Comma delimited)** (Windows; not "CSV UTF-8") after typing an accented letter (é) into a cell. Open the folder in the app | The load report says the Titles file is not UTF-8 and was not loaded; the file on disk is unchanged. Save it as CSV UTF-8 instead and reconnect: it loads, with the é intact |

## F. Firefox or Safari (only if you mean to say they work)

| # | Do | Expect |
|---|---|---|
| F1 | Open the app; **Load CSV files**; choose the folder's CSVs | The library loads |
| F2 | Edit; click **Download changed files** | The changed files download; "1 file changed" stays until **I've replaced the files** |

## G. Outputs in real applications

| # | Do | Expect |
|---|---|---|
| G1 | Compiler → the title → **RIS** → Download; in Zotero, File → Import | One item per contents item; titles, issue, pages and authors right; the "Speculative fields" note present where expected |
| G2 | Compiler → **BibTeX** → Download; open in JabRef (or import into Zotero) | Parses without errors; accented names intact |
| G3 | Compiler → **WordPress** → Copy; in a WordPress draft, open the Code editor, paste, switch to the Visual editor | No "This block contains unexpected or invalid content" warnings; the catalog looks right |
| G4 | Compiler → **Proofing catalog** → Open → print to PDF | Each issue starts on a new page |

## Result

| Browser / OS | A | B | C | D | E | F | G | Notes |
|---|---|---|---|---|---|---|---|---|
| | | | | | | | | |
