# COMMISSIONER

A free, Reigns-style swipe game set in LoCo Pro Wrestling. You play Adam
Starling, Commissioner, from the day after The Last Stand at the Lodge
(September 1, 2026) to Consequences on Coffman Street (Sunday, January 24,
2027). Every card is a roster member or a Longmont oddity with a dilemma.
Swipe left or right. Keep four meters (Crowd, Locker Room, Bank, The Lodge)
away from both 0 and 100. Twenty endings; one of them is the real show.

- Live: `https://commissioner.locopro.pw/`
- Hosting: GitHub Pages through `.github/workflows/deploy-pages.yml`
- Publish source: `_site`, built by `scripts/build-pages.sh` (excludes
  `scripts/`, `tests/`, `output/`, `package.json`, docs)
- Money paths: end screen links to `https://consequences.locopro.pw/` and
  `https://www.patreon.com/LoCoProWrestling`; the in-game "A Fan Online" card
  also names the Patreon.

## Run locally

```sh
cd /Users/gecko/locoprowrestling/commissioner
python3 -m http.server 8765
```

Open `http://localhost:8765/`.

## Verify

```sh
cd /Users/gecko/locoprowrestling/commissioner
node tests/verify-site.mjs
node tests/browser-smoke.mjs http://localhost:8765/
```

`verify-site.mjs` checks every card, ending, sprite and local reference, bans
en and em dashes, and simulates 8,000 games (random and careful players). It
fails if any ending is unreachable. CI runs it before every deploy.

`browser-smoke.mjs` drives real Chrome at phone size through five games, the
winning path, the endings gallery, and both share paths. It writes
screenshots to `output/` and fails on any console error or failed request.

## Content rules

- Cards live in `cards.js`. Engine logic lives in `engine.js` (no DOM), UI in
  `ui.js`.
- Every on-screen name comes from `/Users/gecko/locoprowrestling/ROSTER.md` or
  `/Users/gecko/locoprowrestling/.knowledgebase/roster.md`. Unnamed bit
  players ("A Lodge Member", "A Large Elk") are generic on purpose.
- Card dialogue avoids third-person pronouns for wrestlers. The one pronoun
  in the file ("his", Anuka Gutierrez) matches canon.
- The Vigilante's identity is never hinted. The Netherrealm is never described.
  The Cody Devine and Rob Buster absences are never connected.
- The Consequences ending names only confirmed facts: date and venue.

## Art

Sprites come from the un-normalized original microphone sheets in
`/Users/gecko/locoprowrestling/newfightgame/generated-art/characters/production/microphone-roster/`
(`*-transparent-v1-2026-07-12.png`), plus Adam Starling's v3 production sheet
and Nicky Hyde's non-engine library master. Do not use the
`LoCoProAssetLibrary` mic masters: they are the grid-normalized engine copies
(`normalize-strict-mic-sheet.sh` crops every 256px cell), so any pose that
crossed a cell line arrives cut. `scripts/extract-sprites.py` labels the whole
sheet into 8-connected components and takes each pose whole (flood
extraction, never a grid crop). It keeps nearby sparks, drops debris below the
feet, and recolors key-magenta outline pixels instead of deleting them.
Source paths, hashes and dropped islands are recorded in
`assets/sprites/SOURCES.json`. Re-run after a source sheet changes:

```sh
/usr/bin/python3 /Users/gecko/locoprowrestling/commissioner/scripts/extract-sprites.py
```

The share preview `assets/og-image.png` is rendered from `scripts/og.html` by
`node tests/render-og.mjs`.
