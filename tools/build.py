#!/usr/bin/env python3
"""Inline css/ and js/ into one self-contained HTML file for release.
usage: python3 tools/build.py [output.html]
The source folder also runs as-is: open index.html from disk."""
import re, sys, pathlib

ROOT = pathlib.Path(__file__).resolve().parent.parent
out = pathlib.Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / 'dist' / 'slaughter-cataloger-3.html'
src = (ROOT / 'index.html').read_text(encoding='utf-8')

def inline_css(m):
    css = (ROOT / m.group(1)).read_text(encoding='utf-8')
    return '<style>\n' + css + '\n</style>'

def inline_js(m):
    js = (ROOT / m.group(1)).read_text(encoding='utf-8').replace('</script', '<\\/script')
    return '<script>/* ' + m.group(1) + ' */\n' + js + '\n</script>'

html = re.sub(r'<link rel="stylesheet" href="([^"]+)">', inline_css, src)
html = re.sub(r'<script src="([^"]+)"></script>', inline_js, html)
html = re.sub(r'<!-- /?build:scripts[^>]*-->\n?', '', html)
out.parent.mkdir(parents=True, exist_ok=True)
out.write_text(html, encoding='utf-8')
print(f'wrote {out} ({len(html.encode("utf-8")):,} bytes)')
