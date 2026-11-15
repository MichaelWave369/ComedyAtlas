import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const read=(path)=>readFileSync(new URL("../"+path,import.meta.url),"utf8");
const html=read("index.html");
const rhythm=read("src/rhythm-studio.mjs");
const app=read("src/app.mjs");

test("HTML ids remain unique as the UI expands",()=>{
  const ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(x=>x[1]);
  assert.equal(new Set(ids).size,ids.length,"Duplicate HTML ids found.");
});

test("every rhythm editor target is represented in HTML",()=>{
  const references=[...rhythm.matchAll(/\$\("([^"]+)"\)/g)].map(x=>x[1]);
  const ids=new Set([...html.matchAll(/\bid="([^"]+)"/g)].map(x=>x[1]));
  for(const id of references)assert.ok(ids.has(id),"Missing rhythm control: "+id);
});

test("rhythm engine mounts and receives source updates from Observation Studio",()=>{
  assert.ok(app.includes('import { mountRhythm } from "./rhythm-studio.mjs"'));
  assert.ok(app.includes("const rhythm = mountRhythm(state.atlas"));
  assert.ok(app.includes("rhythm.updateReferences()"));
  assert.ok(html.includes('href="#rhythm"'));
});

test("Audio Lab controls exist and connect to browser initialization",()=>{
  const audioLab=read("src/audio-lab.mjs");
  const ids=new Set([...html.matchAll(/\bid="([^"]+)"/g)].map(x=>x[1]));
  const targets=[...audioLab.matchAll(/\$\("([^"]+)"\)/g)].map(match=>match[1]);
  for(const id of targets)assert.ok(ids.has(id),"Missing audio lab control: "+id);
  assert.ok(app.includes('import { mountAudioLab } from "./audio-lab.mjs"'));
  assert.ok(app.includes("mountAudioLab()"));
  assert.ok(html.includes('href="#audio-lab"'));
  assert.ok(audioLab.includes("URL.revokeObjectURL"));
  assert.ok(audioLab.includes("decodeAudioData"));
});

test("Rhythm notebook sends local changes to the audio overlay",()=>{
  const rhythm=read("src/rhythm-studio.mjs");
  assert.ok(rhythm.includes('comedyatlas:rhythms-updated'));
  assert.ok(read("src/audio-lab.mjs").includes('comedyatlas:rhythms-updated'));
});

test("Pattern lab links to its UI and dynamically updates with local rhythm changes",()=>{
  const lab=read("src/pattern-lab.mjs");
  const ids=new Set([...html.matchAll(/\bid="([^"]+)"/g)].map(x=>x[1]));
  const targets=[...lab.matchAll(/\$\("([^"]+)"\)/g)].map(x=>x[1]);
  for(const id of targets)assert.ok(ids.has(id),"Missing pattern control: "+id);
  assert.ok(html.includes('href="#patterns"'));
  assert.ok(app.includes('import { mountPatternLab } from "./pattern-lab.mjs"'));
  assert.ok(app.includes("mountPatternLab()"));
  assert.ok(lab.includes("comedyatlas:rhythms-updated"));
});

test("the pattern page has a dedicated accessible explanation of its score",()=>{
  assert.ok(html.includes("STRUCTURAL RESEMBLANCE"));
  assert.ok(html.includes("Original fictional examples"));
  assert.ok(html.includes("human-annotated"));
  assert.ok(html.includes('id="pattern-score"'));
});

test("Evidence Workbench is mounted, all input targets exist, and local rhythm changes refresh it",()=>{
  const lab=read("src/evidence-studio.mjs");
  const ids=new Set([...html.matchAll(/\bid="([^"]+)"/g)].map(x=>x[1]));
  for(const match of lab.matchAll(/\$\("([^"]+)"\)/g))
    assert.ok(ids.has(match[1]),"Missing evidence control: "+match[1]);
  assert.ok(app.includes('import { mountEvidenceWorkbench } from "./evidence-studio.mjs"'));
  assert.ok(app.includes("mountEvidenceWorkbench()"));
  assert.ok(html.includes('href="#evidence"'));
  assert.ok(lab.includes("comedyatlas:rhythms-updated"));
  assert.ok(lab.includes("localStorage"));
});
test("Pattern view distinguishes timeline counts from independent source groups",()=>{
  assert.ok(html.includes("Minimum distinct timelines"));
  assert.ok(html.includes("Source-independent motifs"));
  assert.ok(html.includes("Independent examples are not simply separate files."));
});
