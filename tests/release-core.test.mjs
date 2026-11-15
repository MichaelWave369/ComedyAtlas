import test from "node:test";
import assert from "node:assert/strict";
import {
  normalizeReleaseReview,serializeReleaseReviews,parseReleaseReviews,
  mergeReleaseReviews,syntheticReleaseReviews,auditResearchRelease,
  runFamilyHoldoutBenchmark,exportFamilyBenchmark,MAX_RELEASE_REVIEWS
} from "../src/release-core.mjs";
import {syntheticLearningCohort} from "../src/learning-core.mjs";

const demo=syntheticLearningCohort();
const reviews=syntheticReleaseReviews();
const audit=()=>auditResearchRelease(demo.evidence,demo.rhythms,reviews,{cohort:"synthetic"});
test("synthetic demo declares exactly four underlying template families, not 36 independent ones",()=>{
  assert.equal(reviews.length,36);
  assert.equal(new Set(reviews.map(r=>r.groupKey)).size,36);
  assert.equal(new Set(reviews.map(r=>r.familyKey)).size,4);
  const result=audit();
  assert.equal(result.acceptedSources,36);
  assert.equal(result.acceptedFamilies,4);
  assert.equal(result.familyBenchmarkPossible,true);
  assert.ok(result.warnings.some(s=>s.includes("self-reported")));
});
test("valid decisions have versioned round-trip with normalized source lineage",()=>{
  const entry=normalizeReleaseReview({...reviews[0],familyKey:"Fictional-TEMPLATE-1"});
  assert.equal(entry.familyKey,"fictional-template-1");
  const parsed=parseReleaseReviews(serializeReleaseReviews([entry]));
  assert.deepEqual(parsed,[entry]);
  assert.deepEqual(mergeReleaseReviews([entry],[{...entry,note:"do not replace"}]),[entry]);
});
test("malformed imports and unsafe review metadata fail atomically",()=>{
  for(const change of [
    {familyKey:"x y"},{groupKey:"/bad"},{status:"verified"},{origin:"internet"},
    {reviewer:"somebody@example.org"},{note:"x".repeat(601)},{updatedAt:"tomorrow"}
  ])assert.throws(()=>normalizeReleaseReview({...reviews[0],...change}));
  assert.throws(()=>parseReleaseReviews("not json"));
  assert.throws(()=>parseReleaseReviews(" ".repeat(1024*1024+1)));
  assert.throws(()=>parseReleaseReviews(serializeReleaseReviews([reviews[0],reviews[0]])));
  assert.throws(()=>parseReleaseReviews(serializeReleaseReviews(reviews).replace('"schemaVersion": 1','"schemaVersion": 9')));
  assert.throws(()=>parseReleaseReviews(serializeReleaseReviews(Array.from({length:MAX_RELEASE_REVIEWS+1},(_,i)=>({...reviews[0],groupKey:"group-"+i})))));
});
test("a missing, declined or unknown-origin review never silently enters the approved cohort",()=>{
  const noReview=auditResearchRelease(demo.evidence,demo.rhythms,reviews.slice(1),{cohort:"synthetic"});
  assert.equal(noReview.missingReviewCount,1);
  assert.equal(noReview.acceptedSources,35);
  const declined=[...reviews];declined[0]={...declined[0],status:"needs-review"};
  assert.equal(auditResearchRelease(demo.evidence,demo.rhythms,declined,{cohort:"synthetic"}).acceptedSources,35);
  const wrong=[...reviews];wrong[0]={...wrong[0],origin:"unknown"};
  assert.equal(auditResearchRelease(demo.evidence,demo.rhythms,wrong,{cohort:"synthetic"}).acceptedSources,35);
  const personal=auditResearchRelease(demo.evidence,demo.rhythms,reviews,{cohort:"personal"});
  assert.equal(personal.acceptedSources,0);
  assert.equal(personal.familyBenchmarkPossible,false);
});
test("personal source reviews still require user-entered permission claims",()=>{
  const personalReviews=reviews.map(r=>({...r,origin:"original"}));
  const denied=auditResearchRelease(demo.evidence,demo.rhythms,personalReviews,{cohort:"personal"});
  assert.equal(denied.acceptedSources,0);
  const allowedEvidence=demo.evidence.map(r=>({...r,rightsStatus:"permission-claimed"}));
  const accepted=auditResearchRelease(allowedEvidence,demo.rhythms,personalReviews,{cohort:"personal"});
  assert.equal(accepted.acceptedSources,36);
  assert.equal(accepted.acceptedFamilies,4);
  assert.ok(accepted.warnings.some(s=>s.includes("not licensed")));
});
test("quarantine source ID/URL collisions even when the review ledger approves them",()=>{
  const corrupt=demo.evidence.map(r=>({...r}));
  corrupt[1].rhythmId=corrupt[0].rhythmId;
  const result=auditResearchRelease(corrupt,demo.rhythms,reviews,{cohort:"synthetic"});
  assert.equal(result.duplicateSourceConflicts,2);
  assert.equal(result.rejectedSources,2);
  assert.equal(result.acceptedSources,34);
});
test("family-level benchmark holds each lineage entirely out while tuning only on other families",()=>{
  const result=runFamilyHoldoutBenchmark(audit());
  assert.equal(result.totalFolds,4);
  assert.equal(result.acceptedSources,36);
  assert.equal(result.acceptedFamilies,4);
  assert.equal(new Set(result.folds.map(f=>f.familyKey)).size,4);
  for(const fold of result.folds){
    assert.equal(fold.trainFamilies,3);
    assert.equal(fold.trainSources+fold.testSources,36);
    assert.ok(Number.isFinite(fold.logLossGain));
    assert.ok([0.25,0.5,1,2,4].includes(fold.selectedAlpha));
  }
});
test("benchmark invariant to notebook insertion order and honest about sample families",()=>{
  const first=runFamilyHoldoutBenchmark(audit());
  const reversed=auditResearchRelease([...demo.evidence].reverse(),[...demo.rhythms].reverse(),[...reviews].reverse(),{cohort:"synthetic"});
  const second=runFamilyHoldoutBenchmark(reversed);
  assert.deepEqual(first,second);
  assert.ok(first.warnings.some(w=>w.includes("not an independently audited benchmark")));
});
test("refuses too few distinct families and insufficient sources",()=>{
  const collapsed=reviews.map(r=>({...r,familyKey:"only-one-family"}));
  const result=auditResearchRelease(demo.evidence,demo.rhythms,collapsed,{cohort:"synthetic"});
  assert.equal(result.acceptedFamilies,1);
  assert.throws(()=>runFamilyHoldoutBenchmark(result),/three reviewed source families/);
  assert.throws(()=>auditResearchRelease(demo.evidence,demo.rhythms,[reviews[0],reviews[0]],{cohort:"synthetic"}),/Duplicate review decisions/);
});
test("aggregate report removes source and family identifiers and free-text notebook notes",()=>{
  const report=runFamilyHoldoutBenchmark(audit());
  const exportData=exportFamilyBenchmark(report);
  const json=JSON.stringify(exportData);
  assert.equal(exportData.folds.length,4);
  assert.equal(exportData.kind,"ComedyAtlasFamilyBenchmarkExport");
  for(const secret of ['"familyKey"','"groupKey"','"reviewer"','"sourceTitle"','"sourceUrl"','"note"',"synthetic-performance-","fictional-template-"])
    assert.ok(!json.includes(secret),"Leaked "+secret);
  assert.throws(()=>exportFamilyBenchmark({}));
});

test("pending or excluded source reviews may leave family unknown; approved records may not",()=>{
  const pending=normalizeReleaseReview({...reviews[0],status:"needs-review",familyKey:""});
  assert.equal(pending.familyKey,"");
  assert.equal(normalizeReleaseReview({...reviews[0],status:"excluded",familyKey:""}).familyKey,"");
  assert.throws(()=>normalizeReleaseReview({...reviews[0],status:"approved",familyKey:""}),/documented creative family/);
  assert.deepEqual(parseReleaseReviews(serializeReleaseReviews([pending])),[pending]);
});
