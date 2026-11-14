# ComedyAtlas

**Laughter is a melody. Silence is the setup.**

An open, exploratory atlas of comic mechanisms, performance styles, and rhythm. ComedyAtlas connects jokes, sketches, performers, and musical sampling ideas through a **nine-signal humor model** and an interactive, brain-inspired visualization.

> The "Comedy Brain" is an interpretive map, **not a neuroscientific brain scan, clinical assessment, or objective measurement of talent**. The starter scores are editorial examples, not evidence-backed ratings. Humor is personal and contextual.

## What works in v0.2

- Interactive nine-node Comedy Brain: select a mechanism to see its meaning, cues, and the performers it connects to.
- Compare two example performance profiles on all nine signals, with a transparent weighted-vector similarity estimate.
- Search the seed catalog of sketches, styles, and sample-inspired musical moments; filter by mechanism.
- Responsive layout, keyboard-friendly controls, static-host compatible, and zero runtime dependencies.
- **Observation Studio** to add personal, source-attributed moments and score all nine signals from 0 to 5.
- Switch signature comparisons between **editorial examples** and **averages derived from your own annotated moments** (sample count disclosed).
- Local-only browser persistence with explicit JSON export and import. No backend, cloud sync, or content uploads.
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

## Personal observation notebook

Open the **Studio** section. Enter a title, source, performer/character, original commentary, optional source URL and timestamp, and a 0–5 prominence rating for each signal. One or more scores must be nonzero.

- Your entries remain on your device in `localStorage` until exported or cleared, subject to browser storage policies. Private browsing or clearing site data may delete them.
- **Export JSON** creates a portable versioned backup (`ComedyAtlasPersonalObservations`, schema 1).
- **Import JSON** merges valid observations; ID duplicates preserve your existing copy. Invalid files are rejected atomically.
- Import size is capped at **1 MB** and the notebook is capped at **250 observations**.
- The **My observations** signature mode computes the mean rating of each signal across personal observations linked to a selected performer/character. It does not learn a neural model or say who is funniest. No data is sent to the repo or an external server.
- Source links are optional, validated to http(s), and open as external references. Do not paste copyrighted transcripts or private information into public contributions.

### Data & model ethics

The seed profiles are editorial examples, not verified biographical facts. The observational view is a sample mean, not a scientific measure of humor or audience response. Keep original observations, subjective interpretations, and audience reactions separate; the next model version can track evidence quality and annotator disagreement.

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

- [x] User-created local observations with schema validation and export/import
- [x] Optional observation-level source links and timestamps (not independent verification)
- [ ] Optional beat/timing annotation and waveform markers on **authorized** audio
- [x] Observed style averages with transparent sample counts (editorial seeds remain separate)
- [ ] Accessible graph and cross-medium connections
- [ ] Local-first PhiOS / PhiStream adapters (versioned JSON contract)
- [ ] Voluntary contributor review rather than definitive performer rankings

## Copyright, privacy, and care

This repository ships **no video clips, dialogue recordings, samples, actor likenesses, or copyrighted scripts**. Titles and short factual references help organize commentary; adding audio/video requires appropriate rights or permission. No endorsement by named performers or show creators is implied. Dark-comedy categories describe creative techniques, **not** recommended behavior. No user activity tracking or backend is included.

MIT licensed. See [LICENSE](LICENSE).
