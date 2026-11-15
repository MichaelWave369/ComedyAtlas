import test from "node:test";
import assert from "node:assert/strict";
import {
  normalizeReliabilityOptions,runReliabilityStudy,pairedSourceOutcomes,
  bootstrapSourceGains,exportReliabilityStudy,REPEAT_OPTIONS
} from "../src/reliability-core.mjs";
import {syntheticLearningCohort,trainTransitionModel} from "../src/learning-core.mjs";
import {planResearchSplits} from "../src/research-core.mjs";

const demo=syntheticLearningCohort();
const defaultOptions={seed:369,ratio:"default",repeats:12};
test("settings bound costly evaluation runs and preserve reproducible ratios",()=>{
  assert.deepEqual(normalizeReliabilityOptions(defaultOptions),defaultOptions);
  assert.deepEqual(REPEAT_OPTIONS,[12,24,36]);
  assert.throws(()=>normalizeReliabilityOptions({repeats:120}));
  assert.throws(()=>normalizeReliabilityOptions({seed:-1}));
  assert.throws(()=>normalizeReliabilityOptions({ratio:"made-up"}));
});

test("paired group outcomes weigh each held-out source rather than individual transitions",()=>{
  const model=trainTransitionModel([{groupKey:"train",phases:["setup","tension","payoff"]}],1);
  const outcomes=pairedSourceOutcomes(model,[
    {groupKey:"long",phases:["setup","tension","payoff","setup","tension","payoff"]},
    {groupKey:"short",phases:["setup","payoff"]}
  ]);
  assert.equal(outcomes.length,2);
  assert.equal(outcomes[0].transitions,5);
  assert.equal(outcomes[1].transitions,1);
  assert.ok(outcomes.every(o=>Number.isFinite(o.logLossGain)));
  assert.throws(()=>pairedSourceOutcomes(model,[
    {groupKey:"same",phases:["setup","payoff"]},
    {groupKey:"same",phases:["setup","tension"]}
  ]),/Duplicate source group/);
});

test("whole-group paired bootstrap is reproducible and never treats one tiny sample as confident",()=>{
  const source=[{logLossGain:0.1},{logLossGain:0.4},{logLossGain:-0.2},{logLossGain:0.2}];
  const first=bootstrapSourceGains(source,{draws:200,seed:7});
  assert.deepEqual(first,bootstrapSourceGains(source,{draws:200,seed:7}));
  assert.equal(first.available,true);
  assert.ok(first.lower<=first.upper);
  assert.ok(first.probabilityModelLowerLoss>=0&&first.probabilityModelLowerLoss<=1);
  assert.equal(bootstrapSourceGains(source.slice(0,2)).available,false);
  assert.throws(()=>bootstrapSourceGains(source,{draws:2}));
});

test("study is deterministic, uses held-out groups, and reports split variability without fake confidence",()=>{
  const first=runReliabilityStudy(demo.evidence,demo.rhythms,defaultOptions);
  const reversed=runReliabilityStudy([...demo.evidence].reverse(),[...demo.rhythms].reverse(),defaultOptions);
  assert.deepEqual(first,reversed);
  assert.equal(first.runs.length,12);
  assert.equal(first.groupCounts.eligible,36);
  assert.ok(first.groupCounts.distinctSourcesEverTested<=36);
  assert.ok(first.groupCounts.distinctHoldoutPartitions<=12);
  assert.equal(first.groupCounts.testCoveragePercent<=100,true);
  assert.ok(first.summary.middle80LogLossGain[0]<=first.summary.middle80LogLossGain[1]);
  assert.ok(first.summary.lowerLogLossRunCount>=0&&first.summary.lowerLogLossRunCount<=12);
  assert.ok(first.runs.every(r=>r.trainGroups+r.validationGroups+r.testGroups===36));
  assert.ok(first.runs.every(r=>r.bootstrap.available));
});

test("small cohorts are refused instead of making a reassuring error bar",()=>{
  assert.throws(()=>runReliabilityStudy(demo.evidence.slice(0,11),demo.rhythms.slice(0,11),defaultOptions),/at least 12/);
});

test("suspicious duplicate original-source groups are quarantined across all repetitions",()=>{
  const records=[...demo.evidence];
  records[1]={...records[1],rhythmId:records[0].rhythmId};
  const plan=planResearchSplits(records,demo.rhythms);
  assert.equal(plan.quarantined.length,2);
  const study=runReliabilityStudy(records,demo.rhythms,defaultOptions);
  assert.equal(study.groupCounts.quarantined,2);
  assert.equal(study.groupCounts.eligible,34);
  assert.ok(study.runs.every(r=>r.trainGroups+r.validationGroups+r.testGroups===34));
});

test("export is numeric and warning-only, without group keys, performance titles, identities or recordings",()=>{
  const study=runReliabilityStudy(demo.evidence,demo.rhythms,defaultOptions);
  const result=exportReliabilityStudy(study,"synthetic");
  const json=JSON.stringify(result);
  assert.equal(result.schemaVersion,1);
  assert.equal(result.runs.length,12);
  for(const forbidden of ['"groupKey"','"rhythmId"','"sourceUrl"','"annotator"','"sourceTitle"','"segments"',"synthetic-performance-","synthetic-generator"])
    assert.ok(!json.includes(forbidden),"Data leaked: "+forbidden);
  assert.throws(()=>exportReliabilityStudy(study,"wrong"));
});

test("observed spread is not labeled a 95% confidence interval",()=>{
  const study=runReliabilityStudy(demo.evidence,demo.rhythms,defaultOptions);
  assert.ok(study.warnings.some(w=>w.includes("NOT a new pristine test set")));
  assert.ok(study.warnings.some(w=>w.includes("not a calibrated confidence interval")));
  assert.equal(study.summary.middle80AccuracyGain.length,2);
});
