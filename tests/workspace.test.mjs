import test from "node:test";
import assert from "node:assert/strict";
import {
  WORKSPACE_KIND, WORKSPACE_VERSION, MAX_OBSERVATIONS,
  normalizeObservation, parseWorkspace, serializeWorkspace, mergeWorkspace,
  deriveObservedProfile, observationToMoment
} from "../src/workspace.mjs";
import { MECHANISM_IDS } from "../src/core.mjs";

const allowed = new Set(["norm","tim"]);
const base = {
  id:"local-00000001",title:"A long pause",source:"A recorded performance",profileId:"norm",
  medium:"Stand-up",description:"The silence makes the audience wait.",
  sourceUrl:"https://example.org/video",timestamp:"02:14",
  scores:Object.fromEntries(MECHANISM_IDS.map((id) => [id,id==="timing"?5:0])),
  createdAt:"2026-11-14T20:00:00.000Z"
};
function exportFile(observations) { return JSON.stringify({kind:WORKSPACE_KIND,schemaVersion:WORKSPACE_VERSION,observations}); }

test("valid observations round-trip without changing their structure",() => {
  const normalized=normalizeObservation(base,allowed);
  assert.deepEqual(parseWorkspace(serializeWorkspace([normalized]),allowed),[normalized]);
});

test("reject invalid source URLs, XSS protocols, malformed timestamps, and unknown people",() => {
  for(const sourceUrl of ["javascript:alert(1)","file:///etc/passwd","https://user:pw@example.org"]) {
    assert.throws(() => normalizeObservation({...base,sourceUrl},allowed));
  }
  assert.throws(() => normalizeObservation({...base,timestamp:"garbage"},allowed));
  assert.throws(() => normalizeObservation({...base,profileId:"unknown"},allowed));
  assert.throws(() => normalizeObservation({...base,scores:{...base.scores,timing:6}},allowed));
  assert.throws(() => normalizeObservation({...base,scores:Object.fromEntries(MECHANISM_IDS.map((id)=>[id,0]))},allowed));
});

test("import validation is atomic and versioned",() => {
  assert.throws(() => parseWorkspace("not JSON",allowed));
  assert.throws(() => parseWorkspace(JSON.stringify({kind:WORKSPACE_KIND,schemaVersion:9,observations:[]}),allowed));
  assert.throws(() => parseWorkspace(exportFile([base,{...base,id:"local-00000002",timestamp:"invalid"}]),allowed));
  assert.throws(() => parseWorkspace(exportFile([base,base]),allowed));
  assert.throws(() => parseWorkspace(exportFile(Array(MAX_OBSERVATIONS+1).fill(base)),allowed));
  assert.throws(() => parseWorkspace(" ".repeat(1024*1024+1),allowed));
});

test("import merge preserves current observations on ID collisions",() => {
  const original=normalizeObservation(base,allowed);
  const different=normalizeObservation({...base,title:"Changed title"},allowed);
  const newEntry=normalizeObservation({...base,id:"local-00000002",createdAt:"2026-11-15T20:00:00.000Z"},allowed);
  const merged=mergeWorkspace([original],[different,newEntry]);
  assert.equal(merged.length,2);
  assert.equal(merged.find(x=>x.id===original.id).title,original.title);
  assert.equal(merged[0].id,newEntry.id);
});

test("observed signatures are labeled means, not editorial ratings",() => {
  const first=normalizeObservation(base,allowed);
  const second=normalizeObservation({...base,id:"local-00000002",scores:{...base.scores,timing:3,absurdity:4}},allowed);
  const p=deriveObservedProfile({id:"norm",name:"Norm",weights:{timing:2}},[first,second]);
  assert.equal(p.sampleCount,2);
  assert.equal(p.weights.timing,4);
  assert.equal(p.weights.absurdity,2);
  assert.equal(deriveObservedProfile({id:"tim"},[first,second]),null);
  assert.equal(observationToMoment(first).personal,true);
  assert.deepEqual(observationToMoment(first).mechanisms,["timing"]);
});

test("text fields are limited to avoid maliciously huge imports",()=> {
  assert.throws(()=>normalizeObservation({...base,title:"x".repeat(121)},allowed));
  assert.throws(()=>normalizeObservation({...base,id:"seed-coffin"},allowed));
});
