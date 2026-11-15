# ComedyAtlas research release readiness

**Current state: v1.0 release candidate.** Passing CI means source code met automated expectations; it is not independent scientific validation or verified legal permission.

## Source provenance and rights

- [ ] Obtain explicit, independently reviewable permission or use wholly original source material for any shared audio/video. Respect source licenses and performer rights.
- [ ] Independently confirm that each source group represents one original performance and each family key identifies shared creative ancestry, including remixes, edits, reposts and derivative versions.
- [ ] Maintain a review trail with a named reviewer who can attest to methods and disclose conflicts of interest; local pseudonyms alone cannot verify independence.
- [ ] Document what is and is not allowed in any future training, sharing, transcription or model release.

## Dataset and science

- [ ] Assemble genuinely independent, diversely sourced, human-annotated performances beyond the four synthetic families.
- [ ] Pre-register a fixed benchmark design, metrics, sampling rules and data inclusion criteria **before viewing test outcomes**.
- [ ] Hold out entire creative families and verify that no duplicate original-source material crosses partitions.
- [ ] Recruit independent annotators; test labeling consistency, document disagreements and cultural/contextual limitations.
- [ ] Add uncertainty analysis with appropriate independent sampling. Current split bands and tiny family tests are **descriptive**, not calibrated population confidence intervals.
- [ ] Evaluate whether next-phase label prediction relates to any *separately consented* human-reported reactions. Do not automatically infer a joke is funny from phase accuracy.
- [ ] Show baselines and negative results; no favorable-seed cherry-picking.

## Technical browser and accessibility release gate

- [ ] Run a local HTTP server and test the full app end-to-end in Chromium, Firefox and WebKit / Safari.
- [ ] Validate narrow-screen readability, focus order, keyboard use, reduced motion and accessible contrast.
- [ ] Verify offline/no-backend operation; ensure optional local audio decoding does not transmit a recording.
- [ ] Test corrupted and oversized JSON notebook imports, orphaned evidence, local storage limits, and protected recovery controls.
- [ ] Exercise creating a Rhythm, linking Evidence, reviewing source families, running the benchmark, exporting and re-importing backups.
- [ ] Verify GitHub Pages settings and the published URL after merging; a passing unit test does not imply Pages deployment.
- [ ] Confirm no copyrighted clips/scripts/audio or proprietary datasets enter the public repository.

## Data management

- Observation, Rhythm, Evidence and Release Desk review ledgers use **independent, local browser storage**.
- Never infer licensing from an `approved` decision or a `permission-claimed` field.
- Full backup files can contain source URLs, reviewer pseudonyms, notes and family identifiers. Inspect before publishing.
- Aggregate v1.0 family benchmark export omits those identifiers, but numerical model features can still leak information on tiny datasets.

## Scope of the v1.0 RC

**Included:** manually annotated comedy pattern atlas, local waveform features, local statistical next-phase predictor, source-group and source-family heldout research diagnostics, a self-reported review ledger, zero paid APIs.

**Not included:** independently verified dataset rights, trained language-understanding model, laughing detection, robust cultural validation, a clinical neuroscientific brain model, a generalizable comedy-quality score or a verified production release.
