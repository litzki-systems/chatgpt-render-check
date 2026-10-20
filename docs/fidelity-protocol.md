# Renderer fidelity protocol

Renderer fidelity — how closely this project's HTML → markdown → chunks
reconstruction matches what ChatGPT's retrieval pipeline actually produces —
is **open and unverified**. Nothing in this repository, including the
fingerprint-conformance check below, establishes that match. This document
describes the one test rig that measures it, and how to run it.

## What the fidelity rig checks, and what it does not

`bin/chatgpt-render-fidelity.mjs` compares this project's reconstruction
against a real ChatGPT-observed sample, if and only if you supply one. It
does **not**:

* confirm the fingerprint hypotheses from the secondary source (Peec AI
  infographic, attributed to Metehan Yesilyurt, posted 2026-09-07; the
  source posts are linked in the README);
* establish citation probability or ranking impact;
* work at all without a real sample — its bundled fixtures are synthetic
  and exist only so the rig itself is exercised and testable, never as a
  substitute for real fidelity evidence.

For the narrower "do our fingerprint modes hit the eight infographic
markers on a synthetic fixture" check, use
`bin/chatgpt-render-fingerprint-conformance.mjs` instead (see README). That
tool compares output against **our own transcription** of the claimed
feature list — not against a real ChatGPT rendering. Its 8/8 for `mode:
'snippet'` and `mode: 'page_contents'`, and 4/8 for `mode: 'stock'`, says
the modes differ exactly where they were designed to (italic, image, link,
form input/button); it says nothing about whether any mode matches real
ChatGPT output.

**Which representation a sample belongs to matters here.** A sample
captured from a search-result record carries `【n†text】` citation anchors;
one captured from a fetched page does not (see the Method section of the README and
finding 3 in `docs/findings.md`). Comparing a reconstruction against
the wrong one produces a character-similarity penalty that is an artifact
of the representation mismatch, not a fidelity signal. Record which
representation a sample came from, and use `stripCitationAnchors()` from
`lib/render.mjs` to normalize when the two must be compared directly. Note
that the rig itself still reconstructs with `RECONSTRUCTION_MODE = 'stock'`
— neither fingerprint mode is wired into it yet.

## Building a sample

A sample is one JSON file:

```json
{
  "url": "https://example.com/page",
  "rendered_body": "<the text ChatGPT actually showed for this page, exactly as observed>",
  "chunks": [
    { "text": "<first chunk of that observed text>" },
    { "text": "<second chunk>" }
  ]
}
```

* `rendered_body` and `chunks[].text` must come from a real ChatGPT
  rendering of that URL, not from this project's own renderer. This
  repository ships no capture tooling and no real samples; supplying one is
  up to whoever runs the rig.
* Either add `"html_path": "/path/to/raw-page.html"` pointing at the raw
  HTML you captured alongside the observation, or omit it and the rig
  fetches `url` itself at run time (subject to the same fetch layer and
  robots.txt handling as the rest of the project — see README).

## Running it

```bash
node bin/chatgpt-render-fidelity.mjs --file sample.json
```

With no `--file`, the rig runs its two bundled **synthetic** fixtures
instead (clearly labeled as synthetic in their output) so the tool itself
stays exercised and testable without a real sample on hand:

```bash
node bin/chatgpt-render-fidelity.mjs
```

## Expected output

For each combination of `targetWords` (140/155/170/185/200) and
`countMode` (`markdown`/`plain`), the rig reports:

* normalized character similarity, reconstructed body vs. observed body;
* fraction of chunk boundaries that land at exactly the same position;
* median boundary-position deviation, in words;
* chunk count, this reconstruction vs. the observation.

The best-scoring combination is printed first, the full table of all ten
combinations below it. A single run is a single data point — it says
"this is how close the reconstruction came on this one sample", not "this
is the fidelity of the renderer" in general.
