# ComedyAtlas

**Laughter is a melody. Silence is the setup.**

An open, exploratory atlas of comic mechanisms, performance styles, and rhythm. ComedyAtlas connects jokes, sketches, performers, and musical sampling ideas through a **nine-signal humor model** and an interactive, brain-inspired visualization.

> The "Comedy Brain" is an interpretive map, **not a neuroscientific brain scan, clinical assessment, or objective measurement of talent**. The starter scores are editorial examples, not evidence-backed ratings. Humor is personal and contextual.

## What works in v0.1

- Interactive nine-node Comedy Brain: select a mechanism to see its meaning, cues, and the performers it connects to.
- Compare two example performance profiles on all nine signals, with a transparent weighted-vector similarity estimate.
- Search the seed catalog of sketches, styles, and sample-inspired musical moments; filter by mechanism.
- Responsive layout, keyboard-friendly controls, static-host compatible, and zero runtime dependencies.
- Small, plain-JSON data model ready for contributions and later PhiOS/PhiStream integrations.

## Run locally

A static server is needed because browsers restrict `fetch()` from `file://` pages.

```sh
python -m http.server 8000
# Open http://localhost:8000
```

Or use any static host such as GitHub Pages (deploy repository root on `main` after merging).

Run automated model tests:

```sh
npm test
```

Requires Node.js 20+ for tests. No npm install needed.

## Data shape

Edit `data/atlas.json`:

- `mechanisms`: stable `id`, display `name`, plain-language `description`, `cues`, and `music` lens.
- `profiles`: a performer/character `id`, `name`, `kind`, `context`, `note`, and `weights` keyed by the nine mechanism IDs. Weights are integers from **0 to 5**, expressing an editorial interpretation of **style prominence**, not skill or quality.
- `moments`: `id`, `title`, `source`, `profileId`, `medium`, `description`, and `mechanisms` list.

The model intentionally separates **observation** (a bit uses repetition) from **interpretation** (how prominent is repetition?) and from **subjective response** (did you laugh?). Similarity is cosine similarity of the editorial weight vectors, **not** a psychological or artistic fact.

## The 9 signals

1. Timing & Silence
2. Escalation
3. Absurdity
4. Character
5. Social Friction
6. Deadpan Conviction
7. Repetition & Callback
8. Taboo & Shock
9. Rhythm & Musicality

## Roadmap

- [ ] User-created entries with schema validation and export/import
- [ ] Evidence, provenance, content timestamps, and source links for claims
- [ ] Optional beat/timing annotation and waveform markers on **authorized** audio
- [ ] Editable signatures and transparent confidence/provenance
- [ ] Accessible graph and cross-medium connections
- [ ] Local-first PhiOS / PhiStream adapters (versioned JSON contract)
- [ ] Voluntary contributor review rather than definitive performer rankings

## Copyright, privacy, and care

This repository ships **no video clips, dialogue recordings, samples, actor likenesses, or copyrighted scripts**. Titles and short factual references help organize commentary; adding audio/video requires appropriate rights or permission. No endorsement by named performers or show creators is implied. Dark-comedy categories describe creative techniques, **not** recommended behavior. No user activity tracking or backend is included.

MIT licensed. See [LICENSE](LICENSE).
