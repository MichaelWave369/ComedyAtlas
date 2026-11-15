import test from "node:test";
import assert from "node:assert/strict";
import {
  syntheticLearningCohort,partitionExamples,transitionExamples,
  trainTransitionModel,predictNextPhase,baselineDistribution,
  evaluatePhasePrediction,runLearningExperiment,exportLearningReport,
  SMOOTHING_OPTIONS,PHASE_IDS
} from "../src/learning-core.mjs";
import {planResearchSplits} from "../src/research-core.mjs";

const demo=syntheticLearningCohort();
test("original synthetic data is independent of personal browser storage and schema valid",()=>{
  assert.equal(demo.rhythms.length,36);
  assert.equal(demo.evidence.length,36);
  assert.equal(new Set(demo.evidence.map(x=>x.groupKey)).size,36);
  assert.ok(demo.evidence.every(x=>x.sourceUrl===""));
  assert.ok(demo.rhythms.every(x=>x.segments.length>=5));
  assert.equal(demo.templateFamilies,4);
});
test("group-disjoint partitions have exactly one representative per source",()=>{
  const plan=planResearchSplits(demo.evidence,demo.rhythms,{seed:369,ratio:"default"});
  const partitions=partitionExamples(plan);
  const all=Object.values(partitions).flat();
  assert.equal(all.length,36);
  assert.equal(new Set(all.map(x=>x.groupKey)).size,36);
  assert.ok(all.every(x=>x.phases.length>=2));
  const group=plan.annotations.train[0];
  plan.annotations.train.push({...group,id:"evidence-doubledextra01"});
  assert.equal(partitionExamples(plan).train.length,plan.buckets.train.length);
});
test("a manual cross-split source collision is rejected, never trained over",()=>{
  const plan=planResearchSplits(demo.evidence,demo.rhythms);
  plan.annotations.test.push({...plan.annotations.train[0]});
  assert.throws(()=>partitionExamples(plan),/leakage/);
});
test("first order model probabilities normalize and fallback for unseen previous phase",()=>{
  const model=trainTransitionModel([
    {groupKey:"a",phases:["setup","tension","payoff"]},
    {groupKey:"b",phases:["setup","tension","release"]}
  ],1);
  const distribution=predictNextPhase(model,"setup");
  assert.equal(Object.keys(distribution).length,6);
  assert.ok(Math.abs(Object.values(distribution).reduce((a,b)=>a+b,0)-1)<1e-10);
  assert.ok(distribution.tension>distribution.payoff);
  const fallback=predictNextPhase(model,"silence");
  assert.ok(fallback.tension>fallback.silence);
  assert.throws(()=>predictNextPhase(model,"not-a-phase"));
  assert.throws(()=>trainTransitionModel([{groupKey:"a",phases:["setup","payoff"]}],-1));
});
test("evaluation reports accuracy, log-loss and confusion without selecting test parameters",()=>{
  const groups=[
    {groupKey:"a",phases:["setup","tension","payoff"]},
    {groupKey:"b",phases:["setup","tension","payoff"]}
  ];
  const model=trainTransitionModel(groups,0.5);
  const learned=evaluatePhasePrediction(model,groups);
  const baseline=evaluatePhasePrediction(model,groups,"majority");
  assert.equal(learned.groups,2);
  assert.equal(learned.transitions,4);
  assert.ok(learned.accuracy>baseline.accuracy);
  assert.ok(learned.groupBalancedLogLoss<baseline.groupBalancedLogLoss);
  assert.equal(Object.values(learned.confusion).flatMap(Object.values).reduce((a,b)=>a+b,0),4);
  assert.equal(evaluatePhasePrediction(model,[]),null);
});
test("complete pipeline uses fixed validation tuning and held-out group evaluation",()=>{
  const first=runLearningExperiment(demo.evidence,demo.rhythms,{seed:369});
  const repeat=runLearningExperiment([...demo.evidence].reverse(),[...demo.rhythms].reverse(),{seed:369});
  assert.deepEqual(first.smoothingOptions,repeat.smoothingOptions);
  assert.deepEqual(first.heldOutTest,repeat.heldOutTest);
  assert.ok(SMOOTHING_OPTIONS.includes(first.selectedAlpha));
  assert.equal(Object.values(first.sourceGroups).slice(0,3).reduce((s,n)=>s+n,0),36);
  assert.ok(first.heldOutTest.learned.transitions>0); // real held-out transition count
});
test("small cohort refuses misleading held-out evaluation",()=>{
  assert.throws(()=>runLearningExperiment(demo.evidence.slice(0,5),demo.rhythms.slice(0,5)),/At least six/);
});
test("feature-only report omits group IDs, titles, reviewer pseudonyms and raw media",()=>{
  const result=runLearningExperiment(demo.evidence,demo.rhythms);
  const report=exportLearningReport(result,"synthetic");
  const serialized=JSON.stringify(report);
  assert.equal(report.kind,"ComedyAtlasLocalLearningExperiment");
  for(const secret of ["\"groupKey\"","\"rhythmId\"","\"sourceTitle\"","\"sourceUrl\"","\"annotator\"","\"segments\"","sourceGroups.train.","synthetic-generator"])
    assert.ok(!serialized.includes(secret),"Unexpected identifier "+secret);
  assert.ok(!serialized.includes("synthetic-performance-"));
  assert.equal(report.model.phases.length,PHASE_IDS.length);
  assert.throws(()=>exportLearningReport(result,"bad"));
});
