import test from "node:test";
import assert from "node:assert/strict";
import {
  normalizePlanOptions,buildResearchCohort,planResearchSplits,
  listReviewDisagreements,exportResearchPreview,RESEARCH_SPLITS
} from "../src/research-core.mjs";
import {originalPatternExamples} from "../src/pattern-core.mjs";

const base=originalPatternExamples();
const iso="2026-11-14T20:00:00.000Z";
function record(n,key,annotator,rhythm,changes={}){
  return {
    id:"evidence-research"+String(n).padStart(5,"0"),
    groupKey:key,rhythmId:rhythm.id,sourceTitle:"Fictional source "+key,
    sourceUrl:"",annotator,confidence:"medium",
    reviewStatus:"reviewed",rightsStatus:"permission-claimed",
    note:"A deliberately unexported note",createdAt:iso,...changes
  };
}
function fixture(n=8){
  const rhythms=Array.from({length:n},(_,i)=>({
    ...base[i%4],id:"rhythm-test"+String(i).padStart(5,"0")
  }));
  const records=rhythms.map((rhythm,i)=>record(i,"source-"+i,"reviewer-a",rhythm));
  return {rhythms,records};
}
test("normalization rejects invalid seeds and unknown ratio configurations",()=>{
  assert.deepEqual(normalizePlanOptions(),{seed:369,ratio:"default"});
  for(const seed of [-1,1000000,1.1,"5"])assert.throws(()=>normalizePlanOptions({seed}));
  assert.throws(()=>normalizePlanOptions({ratio:"arbitrary"}));
  assert.equal(Object.keys(RESEARCH_SPLITS).length,3);
});
test("reviewed original sources are grouped by stable source group, not record count",()=>{
  const {records,rhythms}=fixture(4);
  records.push(record(100,"source-0","reviewer-b",rhythms[0]));
  records.push(record(101,"source-0","reviewer-a",rhythms[0]));
  const cohort=buildResearchCohort(records,rhythms);
  assert.equal(cohort.groups.length,4);
  assert.equal(cohort.groups.find(g=>g.key==="source-0").rawCount,3);
  assert.equal(cohort.groups.find(g=>g.key==="source-0").annotators,2);
});
test("group-disjoint deterministic splits keep every source in one partition",()=>{
  const {records,rhythms}=fixture(11);
  const a=planResearchSplits(records,rhythms,{seed:369,ratio:"default"});
  const b=planResearchSplits([...records].reverse(),[...rhythms].reverse(),{seed:369,ratio:"default"});
  assert.deepEqual(a.buckets,b.buckets);
  assert.equal(a.eligibleCount,11);
  assert.deepEqual(Object.values(a.counts).reduce((sum,n)=>sum+n,0),11);
  assert.ok(a.counts.train>=1&&a.counts.validation>=1&&a.counts.test>=1);
  const ids=[...a.buckets.train,...a.buckets.validation,...a.buckets.test];
  assert.equal(new Set(ids).size,11);
  assert.equal(a.annotations.train.length+a.annotations.validation.length+a.annotations.test.length,11);
  assert.equal(a.auditPermissionVerified,false);
});
test("two groups cannot pretend to offer a train/validation/test evaluation",()=>{
  const {records,rhythms}=fixture(2);
  const plan=planResearchSplits(records,rhythms);
  assert.equal(plan.eligibleCount,2);
  assert.equal(plan.counts.unsplit,2);
  assert.deepEqual(plan.buckets,{train:[],validation:[],test:[]});
  assert.equal(plan.previewChecklistComplete,false);
  assert.ok(plan.warnings.some(w=>w.includes("At least three")));
});
test("different source keys sharing the SAME rhythm are quarantined",()=>{
  const {records,rhythms}=fixture(5);
  records.push(record(100,"actually-a-repost","reviewer-b",rhythms[0]));
  const plan=planResearchSplits(records,rhythms);
  assert.deepEqual(plan.quarantined.map(g=>g.key),["actually-a-repost","source-0"]);
  assert.equal(plan.eligibleCount,4);
  assert.ok(!JSON.stringify(plan.annotations).includes("actually-a-repost"));
  assert.ok(!plan.checks.noDuplicateSourceConflicts);
});
test("URL duplicates with differing fragment timestamps are quarantined",()=>{
  const {records,rhythms}=fixture(4);
  records[0].sourceUrl="https://example.org/bit?id=17#t=5";
  records[1].sourceUrl="https://example.org/bit?id=17#t=30";
  records[2].sourceUrl="https://example.org/bit?id=18";
  const plan=planResearchSplits(records,rhythms);
  assert.deepEqual(plan.quarantined.map(x=>x.key),["source-0","source-1"]);
});
test("drafts and orphan links stay out of split and manifest features",()=>{
  const {records,rhythms}=fixture(5);
  records[1].reviewStatus="draft";
  records.push(record(100,"orphan","reviewer-c",rhythms[0],{rhythmId:"rhythm-nonexistent"}));
  const plan=planResearchSplits(records,rhythms);
  assert.equal(plan.draftCount,1);
  assert.equal(plan.orphanCount,1);
  assert.equal(plan.eligibleCount,4);
  assert.equal(plan.annotations.train.length+plan.annotations.validation.length+plan.annotations.test.length,4);
  assert.equal(plan.previewChecklistComplete,false);
});
test("repeated same annotator is de-duplicated for disagreement and exported features",()=>{
  const {records,rhythms}=fixture(4);
  records.push(record(100,"source-0","reviewer-a",rhythms[0]));
  const variant={...rhythms[1],id:"rhythm-differentannotation01"};
  rhythms.push(variant);
  records.push(record(101,"source-0","reviewer-b",variant));
  // The second annotator has a unique timeline ID but the same original source key.
  const rows=listReviewDisagreements(records,rhythms);
  assert.equal(rows.length,1);
  assert.equal(rows[0].annotatorCount,2);
  assert.equal(rows[0].pairCount,1);
  assert.ok(rows[0].meanSimilarity<100);
  const plan=planResearchSplits(records,rhythms);
  const count=Object.values(plan.annotations).flat().filter(r=>r.groupKey==="source-0").length;
  assert.equal(count,2);
});
test("split manifest contains only derived features and excludes URLs, pseudonyms and raw notes",()=>{
  const {records,rhythms}=fixture(5);
  records[0].sourceUrl="https://example.org/secret-permission";
  records[0].note="PRIVATE NOTE PLEASE DO NOT EXPORT";
  rhythms[0].title="PRIVATE TIMELINE TITLE";
  rhythms[0].referenceLabel="PRIVATE SOURCE REFERENCE LABEL";
  const plan=planResearchSplits(records,rhythms);
  const pack=exportResearchPreview(plan,listReviewDisagreements(records,rhythms));
  const string=JSON.stringify(pack);
  assert.equal(pack.kind,"ComedyAtlasResearchSplitPreview");
  for(const forbidden of ["PRIVATE NOTE PLEASE DO NOT EXPORT","secret-permission","reviewer-a","sourceTitle","sourceUrl","segments","PRIVATE TIMELINE TITLE","PRIVATE SOURCE REFERENCE LABEL"])
    assert.ok(!string.includes(forbidden),"Leaked "+forbidden);
  assert.ok(string.includes("groupKey"));
  assert.ok(string.includes("No rights have been verified")); // explicit disclaimer about rights
});
test("claimed permissions are never reported as verified training authorization",()=>{
  const {records,rhythms}=fixture(6);
  records[0].rightsStatus="unknown";
  const plan=planResearchSplits(records,rhythms);
  assert.equal(plan.previewChecklistComplete,false);
  assert.equal(plan.auditPermissionVerified,false);
  assert.ok(plan.warnings.some(w=>w.includes("NOT proof")));
});
