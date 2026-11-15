# ComedyAtlas

**Laughter is a melody. Silence is the setup.**

An open, exploratory atlas of comic mechanisms, performance styles, and rhythm. ComedyAtlas connects jokes, sketches, performers, and musical sampling ideas through a **nine-signal humor model** and an interactive, brain-inspired visualization.

> The "Comedy Brain" is an interpretive map, **not a neuroscientific brain scan, clinical assessment, or objective measurement of talent**. The starter scores are editorial examples, not evidence-backed ratings. Humor is personal and contextual.

## What works in v0.8

- Interactive nine-node Comedy Brain: select a mechanism to see its meaning, cues, and the performers it connects to.
- Compare two example performance profiles on all nine signals, with a transparent weighted-vector similarity estimate.
- Search the seed catalog of sketches, styles, and sample-inspired musical moments; filter by mechanism.
- Responsive layout, keyboard-friendly controls, static-host compatible, and zero runtime dependencies.
- **Observation Studio** to add personal, source-attributed moments and score all nine signals from 0 to 5.
- Switch signature comparisons between **editorial examples** and **averages derived from your own annotated moments** (sample count disclosed).
- Local-only browser persistence with explicit JSON export and import. No backend, cloud sync, or content uploads.
- **Rhythm Engine:** annotate ordered Setup → Silence → Tension → Escalation → Punchline → Release segments with durations (0.01s precision), energy 0–5, and original notes.
- See a proportional timeline plus an energy strip, seconds of silence, and punchline onset positions.
- Save up to 60 timelines locally; export/import versioned portable rhythm-only JSON backups. Link a timeline to a seeded Atlas moment or your own saved Observation Studio entry.
- **Local Audio Lab (v0.4):** decode a browser-supported audio file locally, display a waveform, and detect low-energy windows with adjustable RMS dBFS cutoff and minimum duration.
- Optional overlay of an existing saved Rhythm Engine timeline; report absolute start-time alignment, annotated-vs-acoustic hold overlap, and duration differences.
- Preview the chosen audio from an in-browser object URL and export derived numeric features to JSON. Source audio is never uploaded, stored in localStorage, or committed to the repository.
- **Pattern Discovery (v0.5):** derive normalized timing features from human-annotated Rhythm Engine timelines and compare their structure using transparent, deterministic formulas.
- Explore nearest structural neighbors and two-/three-phase motifs supported by multiple independent saved examples.
- Four original synthetic demo timelines work without local data. Personal notebook analysis remains a separate opt-in cohort.
- Export versioned feature-only JSON without source audio, transcripts, or free-form segment notes.
- **Evidence Workbench (v0.6):** link each locally saved rhythm annotation to an underlying source group, optional URL, annotator pseudonym, confidence estimate, review status, and self-reported rights status.
- Track counts of reviewed source groups, double-coded groups, annotator identities, orphaned references, and cross-annotator structural resemblance.
- Find recurring two/three-phase motifs counted per manually grouped **underlying source**, rather than per timeline. Inspect an explicit preliminary audit checklist.
- Versioned local JSON backup/import and an opt-in feature manifest export that excludes source audio and free-form notes.
- **Research Pipeline (v0.7):** deterministic source-group-disjoint train/validation/test previews with configurable split ratios and seed.
- Quarantine suspicious shared rhythm IDs or source URLs across separately named source groups, rather than let them leak between partitions.
- Inspect disagreements between independently named reviewers on the same source, including phase mix, transitions, energy, holds, and payoff timing.
- Export an explicitly unauthorized, feature-only research **planning** manifest. No audio, transcripts, notes, original URLs, or reviewer pseudonyms are exported.
- **Local Learning Experiment (v0.8):** fit a transparent smoothed first-order Markov transition model for predicting the next manually annotated comedy phase, alongside a majority-next-phase baseline.
- Tune smoothing only on validation source groups, report group-balanced accuracy/log-loss on held-out test groups, and inspect a confusion matrix and interactive phase probability predictions.
- Try 36 entirely synthetic original demonstration sequences, or explicitly opt into your own saved reviewed annotation features (minimum six eligible source groups). No recordings are uploaded or used.
- Download a minimal aggregate model/evaluation report that omits source names, original URLs, pseudonyms, free-text notes, and raw audio.
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

## Rhythm Engine (v0.3)

Open **Rhythm** in the navigation. The default timeline is an **original fictional example**: it is not a reconstruction of a copyrighted sketch.

1. Select a colored phase block to inspect/edit it. Use **Update selected**, **Move earlier/later**, or **Remove**. Use **Add segment** to append a phase.
2. Adjust its duration (0.1 to 120 seconds with 0.01-second precision), perceived energy (0–5), and optional commentary. Each timeline can hold 1–32 blocks, with a total length of at most 15 minutes.
3. Add a custom title, optional linked Atlas moment, and a **reference tempo** (40–240 BPM). Quarter-note beat count is `duration × BPM / 60`; it is a mathematical conversion, not automatic tempo or laughter detection.
4. Press **Save timeline** to persist the draft in this browser. Edits to a saved timeline remain drafts until you save again. **Export JSON** regularly to avoid loss from clearing browser data.
5. Import JSON backup of `ComedyAtlasRhythmNotebook`, schema 1. The importer rejects malformed files or oversized records before merging. Existing saved IDs win on duplicates. No remote uploads or media playback.

Each timeline records `segments[].phase`, `duration`, `energy`, and `note`. A saved `referenceId` and `referenceLabel` can link to a local observation (or seeded Atlas entry) without modifying that source entry. The standalone Rhythm Engine is manual; the separate Audio Lab now computes RMS features from selected recordings. Neither recognizes speech/laughter nor trains a "brain".

## Local Audio Lab (v0.4)

Open **Audio Lab**. Use only recordings you have the rights or permission to analyze. The lab uses your browser's `AudioContext.decodeAudioData` to decode a locally selected recording; supported formats depend on your browser.

- **Limits:** audio file no bigger than **40 MB**, decoded recording no longer than **10 minutes**. It measures the first one or two channels without copying a full stereo downmix. It does not transmit data anywhere or persist the audio in a notebook.
- **Energy analysis:** non-overlapping **25 ms** frames, measuring each frame's root-mean-square amplitude. An adjustable threshold (**-65 to -15 dBFS**, default -38 dBFS) identifies low-energy frames. Adjacent quiet frames become windows if they last at least **100–3000 ms** (default 250 ms). Values are approximate and sample-dependent; this is **not** speech recognition, emotion detection, laughing detection, loudness normalization, or a trained comedy model.
- **Waveform:** compressed visual amplitude display, highlights for detected quiet windows and a colored phase strip from an optional saved Rhythm Engine timeline. The strip assumes both begin at time zero, without rescaling, automatic alignment, or time-stretching.
- **Comparison:** reports how much *manually annotated silence* overlaps detected quiet amplitude intervals. These can be different because an intentional pause may contain sound, while a quiet recording may not be a joke.
- **Export:** a numeric, versioned JSON report with settings and quiet intervals. This report contains the **selected filename** (a potentially sensitive label) but **no raw audio** or transcription; inspect before sharing.
- **Privacy:** decoding and playback are browser-local. Audio stays in tab memory and a temporary object URL until clearing the selection or leaving the page. No audio is uploaded or included in `localStorage`, and nothing is sent to a model. Save only derived feature reports intentionally.
- **Playback:** a built-in native audio player lets you listen to the file you selected. This tool is for local inspection, not redistributing copyrighted recordings.

### Privacy and accuracy limits

Detection thresholds are sensitive to background noise, mixing, recording gain, and music beneath dialogue. A "quiet" window is an acoustic measure, not a comedic judgment. Do not infer intent, mental state, comedic success, or performer quality from these features.

## Pattern Discovery (v0.5)

Open **Patterns** in the navigation. The page starts with **four original fictional demonstrations** that are never written to your private notebook. Change the source to **My saved rhythm timelines** to analyze your own sequences; only **saved** timelines appear, not unsaved drafts.

- Choose two timelines to compare. A resemblance percentage is **not a funny score** and **not learned from audience reactions**. It measures only five types of structural similarity extracted from **manual annotations**, with fixed weights:
  - **30% phase proportions:** total normalized time spent in each named phase, compared using one minus total variation distance.
  - **25% phase transitions:** multiset Jaccard overlap of consecutive phase changes (order matters).
  - **20% energy contour:** one minus mean absolute difference in 12 normalized time buckets, from editor-provided energy levels 0–5.
  - **15% hold placement:** one minus mean absolute difference in time-bucket presence of manually annotated "silence" phases.
  - **10% punchline placement:** symmetric closest-distance similarity of normalized payoff onset locations, penalized for differences in the number of marked payoffs.
- Durations are divided by each timeline's total duration, so two proportionally identical 10-second and 20-second timelines produce 100% structural resemblance even though their lengths differ. Reference BPM is **not** included because it is chosen by the annotator, not measured from the performer.
- The **Nearest neighbors** view ranks other sequences by this same deterministic formula. **Recurring motifs** count two- or three-phase sequences, with support defined as the number of **distinct timelines** (not necessarily independent source performances) containing a motif at least once (not the number of times one creator repeated the pattern).
- **Export feature dataset** downloads `ComedyAtlasPatternFeatures` schema 1. It excludes raw audio, transcripts, and free-form segment notes. It **does** include sequence titles and reference labels, so inspect before publishing.
- Source observations may be subjective, mislabeled, or culturally specific. High structural resemblance does not establish a causal explanation for laughter, an authentic performer trait, or general human preference. This stage is **pattern mining**, not a trained AI model. Future versions can add provenance review, reliability estimates, and actual trained models when appropriate datasets exist.

## Evidence Workbench (v0.6)

Open **Evidence** after saving at least one **Rhythm** timeline. Each local evidence record links an annotation to:

- A stable **source group key** naming one underlying original performance. All copies, edits, or repeated annotations of the same original bit should share a key. The app cannot verify that two separately named sources are independent.
- A source title and optional http(s) URL (no credentials); a pseudonymous annotator ID; a subjective confidence label (`low/medium/high`); review status (`draft/reviewed`); and rights status (`unknown/reference-only/permission-claimed`). **Permission claimed is not permission verified.**
- Brief notes explaining annotation methods and uncertainty, with a 600-character limit.

The **Evidence quality snapshot** counts unique reviewed source groups separately from reviewers. Structural agreement compares phase-pattern similarity **only across distinct annotator pseudonyms within the same source group**, taking one latest reviewed record per pseudonym. It is an annotation comparison, **not** a measure of truth, laughing, or scientific reliability. Pseudonyms are user-entered; they do not establish that two reviewers are independent people.

The **Source-independent motifs** panel counts a motif once per reviewed source group even if five annotated copies contain it. This is distinct from v0.5's uncorrected **distinct-timeline** motif count, which remains available for exploratory comparison.

### Audit checklist, not permission to train

The preliminary local checklist asks for **3** distinct reviewed source groups, **2** distinct annotator pseudonyms, **2** double-coded source groups, **3** source groups with *self-reported* permission claims, and zero missing referenced timelines. If all boxes are checked, this means **only** that those local metadata conditions are met. It does **not** verify the original source material, authorship, dataset licenses, identities, sample size sufficiency, agreement adequacy, or eligibility for model training. A separate independent legal and quality review is still necessary.

- Stored in `localStorage` as `ComedyAtlasEvidenceNotebook`, schema 1. Limits: **250 entries** and **1 MB** per backup/import. Invalid backups are rejected without mutating the existing notebook; records whose linked timeline is missing can be preserved in an imported notebook but are excluded from metrics.
- If an unreadable notebook is detected, writes are locked to prevent accidental overwrites; the recovery control prepares a raw backup before offering a reset.
- **Export full notebook** preserves links, notes, pseudonyms and URLs. **Export feature manifest** includes metadata and derived rhythm features, excluding raw audio, transcripts, and free-form segment notes. Both exports may expose identifying source titles/URLs or pseudonyms, so inspect files before sharing.
- Source links and rights claims are never fetched or externally checked. No network services, media uploads, automated source verification, paid APIs, or trained models are used.

## Research Pipeline (v0.7)

Open **Research** to prepare a deterministic **planning preview** from your **saved and reviewed** Evidence Workbench annotations.

The pipeline:

1. Reads validated local Rhythm and Evidence notebooks. **Drafts and missing rhythm links are excluded**, not silently repaired.
2. Deduplicates repeated annotations from the **same annotator pseudonym** within each underlying original source group, keeping the most recently created reviewed record.
3. Detects source-group collisions where two different `groupKey`s link to the **same saved rhythm ID** or the **same canonical http(s) URL** (ignoring URL fragment timestamps). Both groups are **quarantined**, with reasons shown. This is conservative: a single webpage can represent multiple different works. It does **not** automatically identify edited copies or misnamed original sources.
4. For three or more eligible source groups, assigns each complete group to **one and only one** train, validation, or test partition. You can choose ratios (60/20/20, 70/15/15, 80/10/10) and an integer seed (0–999999). It uses stable, seeded non-cryptographic ordering, with at least one source group per partition. On very small datasets, actual counts may deviate from the displayed target percentages. **Fewer than three eligible groups produce no split**, not a misleading training plan.
5. Inspects inter-annotator disagreement for source groups with two or more distinct pseudonyms. Pairwise structural resemblance uses the v0.5 deterministic feature comparison. This is **not** inter-rater reliability (such as Cohen's κ), because our labels are timing vectors, identities are unverified, and sample sizes may be tiny.
6. Can export an opt-in `ComedyAtlasResearchSplitPreview` schema 1 JSON file with group keys, rhythm IDs, derived phase signatures, partition assignments, explicitly self-reported rights labels, audit flags, and warnings. It **does not export raw audio, transcripts, URLs, reviewer pseudonyms, or free-form notes**, though identifying information can still be contained in human-entered group keys or rhythm IDs. Review the preview before sharing.

### Strict research boundaries

The pipeline **does not train a model** or authorize training. Self-reported permission is not legal clearance; source keys are not independently authenticated; pseudonyms do not verify independent human reviewers. A green preliminary metadata checklist means **only** that fields meet locally defined screening criteria. Independent rights, source provenance, methodological validation, annotator independence, data representativeness, and independent human review are essential before real training.

This does not prevent every form of evaluation leakage. Two different URLs may still host copies of the same content. A source group can also span multiple video edits or performances if entered incorrectly. The system surfaces what it can detect and avoids silently treating recordings as verified.

## Local Learning Experiment (v0.8)

Open **Learning** in the navigation.

### Task, not a "funny score"

For a sequence of manually annotated comedy phases, predict the **next phase** from the **previous phase**. A first-order Markov model fits the counts of each ordered phase transition on **training source groups only**. It uses additive smoothing to produce non-zero probabilities for all six possible next phases. A baseline model always predicts the most common next phase observed in the training split. Neither model looks at words, jokes, audio, intent, laughter, or any audience response.

### Reproducible training and evaluation

- Choose **Synthetic demonstration**, which generates 36 fictional, programmatic timing examples from **four reused template families**. These are not 36 independent human performances, so synthetic benchmark results are *illustrative*, not external evidence. They remain separate from local storage.
- Or choose **My reviewed source groups**. This explicitly reads saved v0.6 Evidence/Rhythm notebooks and requires at least **six eligible, non-conflicting reviewed source groups**. The v0.7 research pipeline excludes orphan references, drafts, and quarantined cross-source conflicts, and keeps each original source group in exactly one partition.
- Within each source group, this model uses only the lexicographically first eligible reviewed evidence annotation, not all its reviewers. Additional annotations remain available for disagreement research and never give one source extra votes in training.
- Choose a seed and source-group split ratio. Model fitting happens **only on train**, additive-smoothing strength is selected among 0.25, 0.5, 1, 2, and 4 using **validation group-balanced log-loss**, and both learned and baseline models are evaluated on the same held-out **test** groups.
- The report shows group-balanced **accuracy** (fraction of correctly predicted next phase) and **log-loss** (penalizing confident incorrect predictions), transition counts, confusion matrix and conditional phase probabilities. Each original source group has equal weight in group-balanced metrics. It does not indicate humor effectiveness.
- **Do not tune hyperparameters, model features, or seeds based on test results and then claim a pristine held-out result.** The app is exploratory and cannot enforce a once-ever sealed test.
- All computation is browser-local using plain JavaScript. No paid services, neural model weights, media upload, cloud model, or third-party network call is involved.
- Export **ComedyAtlasLocalLearningExperiment** schema 1 JSON with aggregate results and model transition counts. It includes neither source group IDs, reviewer names, URLs, transcripts, recording bytes, nor personal timeline titles. Model counts may still reveal patterns from a small dataset: inspect the file before publishing.

A more complicated model is **not automatically better**. The page explicitly reports when the learned model fails to beat the simple baseline on the test data.

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
- [x] Manual beat/timing annotations and visual timeline (no audio import yet)
- [x] Browser-local waveform and acoustic low-energy window analysis for authorized recordings
- [x] Observed style averages with transparent sample counts (editorial seeds remain separate)
- [x] Linked rhythm timelines to Atlas references (local identifiers)
- [x] Human-annotated pattern similarity and recurring phase motif mining
- [x] User-entered source metadata, duplicate-source grouping, and structural annotation-agreement diagnostics (unverified)
- [x] Group-disjoint research partition previews, duplicate source quarantine, and annotation disagreement inspection
- [x] Local first-order statistical phase-transition learning with group-held-out baseline comparisons
- [ ] Independently verified provenance, rights, annotator independence, and externally validated learned models
- [ ] Automatically aligned time annotations and editable waveform markers
- [ ] Accessible graph connecting moments, signatures, and timings
- [ ] Local-first PhiOS / PhiStream adapters (versioned JSON contract)
- [ ] Voluntary contributor review rather than definitive performer rankings

## Copyright, privacy, and care

This repository ships **no video clips, dialogue recordings, samples, actor likenesses, or copyrighted scripts**. Titles and short factual references help organize commentary; adding audio/video requires appropriate rights or permission. No endorsement by named performers or show creators is implied. Dark-comedy categories describe creative techniques, **not** recommended behavior. No user activity tracking or backend is included.

MIT licensed. See [LICENSE](LICENSE).
