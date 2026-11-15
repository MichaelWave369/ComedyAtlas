import test from "node:test";
import assert from "node:assert/strict";
import {
  EVIDENCE_KIND,EVIDENCE_VERSION,MAX_EVIDENCE,
  normalizeEvidence,parseEvidence,serializeEvidence,mergeEvidence,
  evidenceSummary,sourceAwareMotifs,evidenceManifest
} from "../src/evidence-core.mjs";
import {originalPatternExamples} from "../src/pattern-core.mjs";
const rhythms=originalPatternExamples();
const ids=new Set(rhythms.map(r=>r.id));
const now="2026-11-14T20:00:00.000Z";
const e=(n,group,annotator,rhythmId=rhythms[0].id,extra={})=>({
  id:"evidence-00000"+String(n).padStart(3,"0"),
  rhythmId,groupKey:group,sourceTitle:"Original study "+group,
  sourceUrl:"https://example.org/study",annotator,confidence:"medium",
  reviewStatus:"reviewed",rightsStatus:"permission-claimed",
  note:"Personal editorial observation",createdAt:now,...extra
});
test("valid evidence round trips and normalizes source group keys",()=>{
  const sample=normalizeEvidence(e(1,"ALBUM-SKETCH-01","observer.one"),ids);
  assert.equal(sample.groupKey,"album-sketch-01");
  assert.deepEqual(parseEvidence(serializeEvidence([sample]),ids),[sample]);
});
test("reject unknown rhythm IDs, unsafe URL protocols, PII-like aliases and invalid labels",()=>{
  const invalid=[
    e(1,"a","a","missing-rhythm"),
    e(1,"a","a",rhythms[0].id,{sourceUrl:"javascript:alert(1)"}),
    e(1,"a","a",rhythms[0].id,{sourceUrl:"https://u:p@example.org"}),
    e(1,"a b","a"),
    e(1,"a","name@example.com"),
    e(1,"a","a",rhythms[0].id,{confidence:"certain"}),
    e(1,"a","a",rhythms[0].id,{reviewStatus:"verified"}),
    e(1,"a","a",rhythms[0].id,{rightsStatus:"licensed"}),
    e(1,"a","a",rhythms[0].id,{createdAt:"today"}),
    e(1,"a","a",rhythms[0].id,{note:"x".repeat(601)})
  ];
  for(const record of invalid)assert.throws(()=>normalizeEvidence(record,ids));
});
test("atomic import rejects malformed and duplicate records",()=>{
  const record=normalizeEvidence(e(1,"a","person-a"),ids);
  const pack=records=>JSON.stringify({kind:EVIDENCE_KIND,schemaVersion:EVIDENCE_VERSION,records});
  assert.throws(()=>parseEvidence(pack([record,{...record,rhythmId:"missing"}]),ids));
  assert.throws(()=>parseEvidence(pack([record,record]),ids));
  assert.throws(()=>parseEvidence(pack(Array.from({length:MAX_EVIDENCE+1},()=>record)),ids));
  assert.throws(()=>parseEvidence(pack([]).replace('"schemaVersion":1','"schemaVersion":7'),ids));
  assert.throws(()=>parseEvidence("garbage",ids));
  assert.throws(()=>parseEvidence(" ".repeat(1024*1024+1),ids));
});
test("merge avoids replacing existing IDs",()=>{
  const old=normalizeEvidence(e(1,"g","a"),ids);
  const overwritten=normalizeEvidence(e(1,"g","b"),ids);
  const next=normalizeEvidence(e(2,"h","c"),ids);
  const merged=mergeEvidence([old],[overwritten,next]);
  assert.equal(merged.length,2);
  assert.equal(merged.find(r=>r.id===old.id).annotator,"a");
});
test("counts unique source groups, not duplicate submissions, and separately counts annotators",()=>{
  const records=[
    e(1,"source-a","alpha",rhythms[0].id),
    e(2,"source-a","alpha",rhythms[0].id),
    e(3,"source-a","beta",rhythms[1].id),
    e(4,"source-b","alpha",rhythms[2].id),
    e(5,"source-b","beta",rhythms[2].id),
    e(6,"source-c","alpha",rhythms[3].id),
    e(7,"source-x","gamma",rhythms[3].id,{reviewStatus:"draft"})
  ].map(r=>normalizeEvidence(r,ids));
  const report=evidenceSummary(records,rhythms);
  assert.equal(report.sourceGroups,3);
  assert.equal(report.distinctAnnotators,2);
  assert.equal(report.doubleCodedSources,2);
  assert.equal(report.agreementPairs,2);
  assert.equal(report.rightsClaimedGroups,3);
  assert.equal(report.draftRecords,1);
  assert.equal(report.pilotReviewChecklistComplete,true);
  assert.ok(report.averageStructuralAgreement>=0&&report.averageStructuralAgreement<=100);
  const features=evidenceManifest(records,rhythms);
  assert.equal(features.records.length,7);
  assert.equal(features.kind,"ComedyAtlasEvidenceManifest");
  assert.equal(JSON.stringify(features).includes("Personal editorial observation"),false);
  assert.equal(JSON.stringify(features).includes("segments"),false);
});
test("orphaned records are retained for backup but not counted as evidence",()=>{
  const records=[normalizeEvidence(e(1,"source-a","alpha"),ids)];
  const report=evidenceSummary(records,[]);
  assert.equal(report.orphanRecords,1);
  assert.equal(report.sourceGroups,0);
  assert.equal(report.pilotReviewChecklistComplete,false);
  assert.equal(evidenceManifest(records,[]).records.length,0);
});
test("source-aware motifs count duplicate rhythms once per source",()=>{
  const records=[
    e(1,"show-1","alpha",rhythms[0].id),
    e(2,"show-1","beta",rhythms[0].id),
    e(3,"show-2","alpha",rhythms[1].id),
    e(4,"show-3","beta",rhythms[2].id,{reviewStatus:"draft"})
  ].map(r=>normalizeEvidence(r,ids));
  const motif=sourceAwareMotifs(records,rhythms).find(x=>x.key==="setup|tension");
  assert.equal(motif.sourceSupport,2);
  assert.deepEqual(motif.groupKeys,["show-1","show-2"]);
  assert.equal(sourceAwareMotifs(records,rhythms,{minSources:3}).length,0);
  assert.throws(()=>sourceAwareMotifs(records,rhythms,{length:4}));
});
test("not ready for even a pilot when rights are unknown or groups too few",()=>{
  const records=[
    e(1,"one","a",rhythms[0].id,{rightsStatus:"unknown"}),
    e(2,"one","b",rhythms[1].id)
  ].map(r=>normalizeEvidence(r,ids));
  const summary=evidenceSummary(records,rhythms);
  assert.equal(summary.pilotReviewChecklistComplete,false);
  assert.equal(summary.sourceGroups,1);
  assert.equal(summary.checks.threeRightsClaims,false);
});
