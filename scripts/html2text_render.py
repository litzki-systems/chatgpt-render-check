#!/usr/bin/env python3
"""Renders HTML to Markdown the way ChatGPT's retrieval pipeline does.

Parser choice (Peec AI control test, Metehan Yesilyurt, September 2026):
html2text matches several characteristic fingerprints (bullet format,
heading format, table separator) of actual ChatGPT output. Turndown,
markdownify and Trafilatura each only match 1-2 of them, so none of those
three are implemented here, not even for comparison.

Three modes are available (argv[1], default "stock"):

  stock         - plain html2text defaults, kept for comparison.
  snippet       - the search-result representation. Applies the
                  fingerprint adjustments from the control test that are
                  not html2text defaults: asterisk emphasis marks, links
                  collapsed to bracketed citation anchors 【n†text】
                  (dropping the URL), images collapsed to "Image: <alt>",
                  and form inputs/buttons replaced with bracketed
                  placeholders before conversion.
  page_contents - the fetched-page representation the model actually
                  reads. Identical to `snippet`, plus the citation-anchor
                  wrapper is stripped again (【n†text】 -> text).

Why two fingerprint modes rather than one: a second-hand report of the
same SSE dump (Metehan Yesilyurt, part 2, 2026-09-09) describes the
citation anchor as present in the search-result record (`snippet::parts`)
and absent from the fetched-page record (`page_contents`) for the same
passage. Every other fingerprint marker belongs to the html2text step and
is shared by both. Collapsing the two into one mode would mean claiming
the anchor wrapper appears in a representation where the source says it
does not.

All of this remains an unverified fingerprint hypothesis, not a confirmed
ChatGPT spec — see docs/fidelity-protocol.md.
"""
import re
import sys
import html2text
from bs4 import BeautifulSoup, NavigableString


def strip_chrome(soup):
    """A Peec AI control test observed that ChatGPT's retrieval step appears
    to strip <nav>/<header>/<footer>/<aside> before rendering; this
    reproduces that observation, it does not verify ChatGPT's internals.
    Without this step, most domains end up with pure navigation in the
    first chunk — an artifact of the simulation, not resembling the
    observed real output (same control test as above)."""
    for tag in soup(['nav', 'header', 'footer', 'aside']):
        tag.decompose()


def replace_form_controls(soup):
    """Replace form inputs/buttons with bracketed placeholders before
    conversion, so html2text (which has no native concept of a form
    control) never has a chance to silently drop them."""
    for el in soup.find_all(['input', 'textarea', 'select']):
        label = el.get('placeholder') or el.get('value') or el.get('name') or el.get('aria-label') or el.get('type') or 'input'
        el.replace_with(NavigableString(f'[Input: {label}]'))

    for el in soup.find_all('button'):
        label = el.get_text(strip=True) or el.get('value') or el.get('aria-label') or 'button'
        el.replace_with(NavigableString(f'[Button: {label}]'))

    for el in soup.find_all('input', attrs={'type': re.compile('^(submit|button)$', re.I)}):
        label = el.get('value') or el.get('aria-label') or 'button'
        el.replace_with(NavigableString(f'[Button: {label}]'))


CITATION_ANCHOR_RE = re.compile(r'【\d+†(.*?)】')

MODES = ('stock', 'snippet', 'page_contents')
FINGERPRINT_MODES = ('snippet', 'page_contents')


def apply_chatgpt_fingerprint(markdown):
    """Post-process html2text's inline-link/image markdown into the
    observed ChatGPT-style citation anchors. Link anchor text survives,
    the URL is dropped; images collapse to a plain description line."""
    markdown = re.sub(r'!\[(.*?)\]\([^)]*\)', lambda m: f'Image: {m.group(1)}', markdown)

    counter = {'n': 0}

    def link_marker(m):
        counter['n'] += 1
        return f'【{counter["n"]}†{m.group(1)}】'

    markdown = re.sub(r'\[(.*?)\]\([^)]*\)', link_marker, markdown)
    return markdown


def strip_citation_anchors(markdown):
    """Remove the 【n†...】 wrapper, keeping the anchor text as plain text.

    The wrapper carries no surrounding whitespace, so this changes the
    character count but not the word count, and therefore not the chunk
    boundaries (verified in tests/render.test.mjs)."""
    return CITATION_ANCHOR_RE.sub(lambda m: m.group(1), markdown)


def render(html, mode='stock'):
    if mode not in MODES:
        raise ValueError(f'unknown mode {mode!r}; expected one of {", ".join(MODES)}')

    soup = BeautifulSoup(html, 'html.parser')
    strip_chrome(soup)
    if mode in FINGERPRINT_MODES:
        replace_form_controls(soup)

    h = html2text.HTML2Text()
    h.body_width = 0          # no line wrapping
    h.ignore_images = False    # keep images as ![alt](src)
    h.ignore_links = False
    h.ignore_emphasis = False
    h.skip_internal_links = False
    h.inline_links = True
    h.protect_links = True
    h.wrap_links = False
    h.unicode_snob = True
    if mode in FINGERPRINT_MODES:
        h.emphasis_mark = '*'

    markdown = h.handle(str(soup))
    if mode in FINGERPRINT_MODES:
        markdown = apply_chatgpt_fingerprint(markdown)
    if mode == 'page_contents':
        markdown = strip_citation_anchors(markdown)
    return markdown


if __name__ == '__main__':
    mode = sys.argv[1] if len(sys.argv) > 1 else 'stock'
    try:
        sys.stdout.write(render(sys.stdin.read(), mode=mode))
    except ValueError as exc:
        sys.stderr.write(f'{exc}\n')
        sys.exit(2)
