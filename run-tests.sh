#!/bin/sh
# Slaughter Cataloger 3.0 — every automated check in this package, in one command.
#
#   sh run-tests.sh                 everything (the release check)
#   sh run-tests.sh --no-browser    skip the browser checks (exit status 3: not a release check)
#   sh run-tests.sh --offline       skip the third-party format parsers, which need npm (exit 3 as well)
#   sh run-tests.sh --quick         Node unit and data-safety suites only (exit 3)
#
# Needs Node 18+ and Python 3. The browser checks need Playwright with Chromium
# (npm i -g playwright && npx playwright install chromium); a global install is found
# automatically. The format checks install six parser packages into a temporary folder.
# Nothing under sample-data/ is modified.
#
# Exit status: 0 = every check ran and passed; 1 = a check failed; 3 = all checks that ran
# passed, but some were skipped (see the summary) — not a release check.

cd "$(dirname "$0")" || exit 2
TMP=$(mktemp -d 2>/dev/null || mktemp -d -t sc3review)
trap 'rm -rf "$TMP"' EXIT
FAILED=""; SKIPPED=""; PASSED=0
BROWSER=1; FORMATS=1; QUICK=0
for a in "$@"; do
  case "$a" in
    --no-browser) BROWSER=0 ;;
    --offline) FORMATS=0 ;;
    --quick) QUICK=1; BROWSER=0; FORMATS=0 ;;
    *) echo "unknown option $a"; exit 2 ;;
  esac
done

step() {
  name=$1; shift
  printf '\n━━ %s\n' "$name"
  if "$@"; then PASSED=$((PASSED + 1)); else FAILED="$FAILED\n  - $name"; fi
}
skip() { printf '\n━━ %s — SKIPPED (%s)\n' "$1" "$2"; SKIPPED="$SKIPPED\n  - $1 ($2)"; }

D=sample-data/3.0
step "numbering & table-of-contents unit tests"          node tools/test-numbering.js
step "store: undo, revisions, changed files (B-01)"       node tools/test-store.js
step "names & headings unit tests"                        node tools/test-names.js
step "outputs unit tests + every output on Egoist"        node tools/test-outputs.js $D/egoist-journals
step "data safety: FolkStudies (B-03 B-04 M-02 M-03 M-05)" node tools/test-safety.js $D/folkstudies
step "data safety: Egoist Journals"                       node tools/test-safety.js $D/egoist-journals
step "data safety: Shape-Note Periodicals"                node tools/test-safety.js $D/shape-note-periodicals
step "backups: never written over, byte for byte (review 2, F2-01)" node tools/test-backups.js

if [ $QUICK = 0 ]; then
  step "Beta 2 → 3.0 round trip (Egoist Journals)"        node tools/test-roundtrip.js sample-data/beta2/egoist-journals
  step "converter on all four Beta 2 libraries"            node tools/convert-to-3.js sample-data/beta2 --out "$TMP/converted"
  build_matches() {
    python3 tools/build.py "$TMP/built.html" >/dev/null || return 1
    if cmp -s "$TMP/built.html" dist/slaughter-cataloger-3.html; then echo "dist/slaughter-cataloger-3.html matches the source"
    else echo "dist/slaughter-cataloger-3.html is OUT OF DATE with the source (rebuild: python3 tools/build.py)"; return 1; fi
  }
  step "single-file build matches the shipped dist"        build_matches
else
  skip "round trip, converter, build check" "--quick"
fi

if [ $FORMATS = 1 ]; then
  formats() {
    echo "installing parsers into a temporary folder…"
    ( cd "$TMP" && npm init -y >/dev/null 2>&1 && npm install --no-audit --no-fund --silent \
        @retorquere/bibtex-parser tslib @citation-js/core @citation-js/plugin-ris @citation-js/plugin-bibtex @wordpress/block-serialization-default-parser ) \
      || { echo "npm install failed (offline? use --offline to skip)"; return 1; }
    node tools/test-formats.js "$TMP"
  }
  step "outputs read by third-party parsers (BibTeX, RIS, WordPress, HTML)" formats
else
  skip "outputs read by third-party parsers" "--offline or --quick"
fi

if [ $BROWSER = 1 ]; then
  if node -e "try{require.resolve('playwright')}catch(e){require.resolve(require('child_process').execSync('npm root -g').toString().trim()+'/playwright')}" >/dev/null 2>&1; then
    step "browser walkthrough (Chromium)" node tools/test-walkthrough.js \
      dist/slaughter-cataloger-3.html $D/egoist-journals sample-data/beta2/egoist-journals/SCAT_EGOIST-JOURNALS_TITLES.csv
    step "browser: saving, restoring, reconnecting, tabs, crash, real folder API (B-01 B-02 B-05 B-06 B-07 M-01 M-04)" \
      node tools/test-session.js dist/slaughter-cataloger-3.html $D/folkstudies $D/shape-note-periodicals
  else
    printf '\n━━ browser checks — Playwright not found\n'
    echo "Install it (npm i -g playwright && npx playwright install chromium), or run with --no-browser."
    FAILED="$FAILED\n  - browser checks (Playwright not found)"
  fi
else
  skip "browser walkthrough and session checks" "--no-browser or --quick"
fi

printf '\n════════════════════════════════════════\n'
if [ -n "$FAILED" ]; then
  printf "%s passed; FAILED:%b\n" "$PASSED" "$FAILED"
  [ -n "$SKIPPED" ] && printf "Skipped:%b\n" "$SKIPPED"
  exit 1
fi
if [ -n "$SKIPPED" ]; then
  printf "All %s checks that ran passed, but these were skipped:%b\nNOT A RELEASE CHECK.\n" "$PASSED" "$SKIPPED"
  exit 3
fi
echo "All $PASSED checks passed. Nothing skipped."
