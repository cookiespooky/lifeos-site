# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

The Life OS product site, `https://lifeos.antonlozhkin.ru/` (English under `/en/`). Notepub, like `../site/`.
`README.md` (Russian) is the full documentation — page formats, theme, English version; read the section you touch.
Publishing, the server and the stop-lists are in `../.claude/rules/lifeos-site.md` — not repeated here.

## Commands

```bash
scripts/build.sh --no-vault        # the gate: build both languages from data/components.json into dist/ (dist/en/)
scripts/build.sh                   # same, but first re-export the component registry from ../life
scripts/preview.sh                 # build and serve http://127.0.0.1:8085/ and /en/
LIFEOS_SITE_DRAFTS=1 scripts/preview.sh   # include blog drafts (draft: true)
python3 scripts/gen.py --check && python3 scripts/gen.py --check --lang en   # after editing src/*.md
python3 scripts/brand.py [--lang en]      # redraw favicon/og.png (needs Pillow) after the mark or first screen changes
```

There are no tests: `gen.py --check` (stop-words, inline styles, missing logos, `ru_hash`) and notepub's
`validate` inside `build.sh` are the checks.

## How a page is made

`src/*.md` (hand-written) + `data/components.json` (the only input from the vault) → `scripts/gen.py` → `content/`
and `content-en/` (generated, never edit) → notepub with `config*.yaml` + `rules*.yaml` → `dist/` → `scripts/llms.py`
writes `llms.txt` from the built pages.

- `gen.py` does the real work: it replaces markers in `src/` (`{{uses}}`, `{{groups}}`, `{{parts}}`, `{{howtos}}`,
  `{{usetabs}}`, `{{example}}`, `{{benefits}}`, `{{ways}}`) with finished HTML using theme classes, builds one page per
  component (`type: part` → `/chto-vnutri/<slug>/`), the use cases (`src/for-*.md`, `type: use` → `/dlya/<slug>/`),
  pairs ru/en twins for `hreflang` (`twins()`), and prefixes root links with `/en` for English (`under_base()`).
- `src/home.md` is the home page and the client presentation; its markdown dialect (`## Label {#id .dark}` = a stripe,
  `####` + numbered list = a chain, several chains = tabs) is defined in README, «Формат главной». First screen —
  `src/flow.md` (`type: flow`); deleting it brings back the registry graph, whose code stays in `gen.py`/`main.js`.
- The «Как это работает» stripe: the live scheme under its heading is `theme/assets/live.js` + the `.lm` block in
  `theme/assets/styles.css`, mounted by `<div class="lm lm--flow" data-lm="flow"></div>` in `src/home.md`; the chain
  tabs under it explain it step by step. `live.js` was copied from `../site/`, but its third scheme (`EVENTS`, `play`)
  is this site's own — keep it when re-copying. Its strings live in the `RU`/`EN` dictionaries in `live.js`.
- The look lives only in `theme/assets/tokens.css` (four colours, font, radius — start here), `theme/assets/styles.css`
  and `theme/templates/`; `gen.py` never writes inline styles. Header/footer words — `settings` in `config*.yaml`
  (edit `config.yaml` and `config.dev.yaml` together, likewise the `en` pair).
- English pages (`src/en/*.md`) are written anew, not translated line by line; component texts are in
  `src/en/components.json`, each with `ru_hash` — a changed Russian text fails the build until it is retranslated.
- `src/drafts/` and `video/` are not in git and not built; `src/blog/` is managed by `lifeos articles` from `life/`.

## Copy

No word «заметка» on the site, «система», not «модель»; calm descriptive tone, technical detail only in howtos
checked on an outsider. The `STOP` list in `gen.py` enforces part of it and must match `component_stop` in
`../life/lifeos.yaml` by hand.
