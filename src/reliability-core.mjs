import {PHASE_IDS,SMOOTHING_OPTIONS,predictNextPhase,baselineDistribution,partitionExamples,runLearningExperiment} from "./learning-core.mjs";
import {planResearchSplits,normalizePlanOptions} from "./research-core.mjs";

export const RELIABILITY_VERSION=1;
export const REPEAT_OPTIONS=Object.freeze([12,24,36]);
export const BOOTSTRAP_DRAWS=240;
const safeRound=(n,d=4)=>Number(n.toFixed(d));
const mean=values=>values.reduce((s,v)=>s+v,0)/values.length;
const bestLabel=probs=>PHASE_IDS.reduce((best,k)=>probs[k]>probs[best]?k:best,PHASE_IDS[0]);

function quantile(data,q){
  if(!Array.isArray(data)||!data.length||q<0||q>1)throw Error("Quantile requires values and a valid probability.");
  const sorted=[...data].sort((a,b)=>a-b),at=(sorted.length-1)*q;
  const low=Math.floor(at),weight=at-low;
  return sorted[low]*(1-weight)+sorted[Math.min(low+1,sorted.length-1)]*weight;
}
function randomGenerator(seed){
  let state=(seed>>>0)||0x9e3779b9;
  return ()=>{
    state=(state+0x6D2B79F5)>>>0;
    let x=state;
    x=Math.imul(x^(x>>>15),x|1);
    x^=x+Math.imul(x^(x>>>7),x|61);
    return ((x^(x>>>14))>>>0)/4294967296;
  };
}

export function normalizeReliabilityOptions(raw={}){
  const {seed,ratio}=normalizePlanOptions(raw);
  const repeats=raw.repeats??24;
  if(!REPEAT_OPTIONS.includes(repeats))throw Error("Repetitions must be 12, 24, or 36.");
  return {seed,ratio,repeats};
}

export function pairedSourceOutcomes(model,testGroups){
  if(!model||!Array.isArray(testGroups)||!testGroups.length)throw Error("Model and held-out source groups required.");
  const encountered=new Set();
  return testGroups.map(group=>{
    if(typeof group.groupKey!=="string"||encountered.has(group.groupKey))throw Error("Duplicate source group in held-out evaluation.");
    encountered.add(group.groupKey);
    if(!Array.isArray(group.phases)||group.phases.length<2)throw Error("Held-out phase sequence must have transitions.");
    let baselineCorrect=0,learnedCorrect=0,baselineLoss=0,learnedLoss=0;
    for(let i=1;i<group.phases.length;i++){
      const previous=group.phases[i-1],actual=group.phases[i];
      if(!PHASE_IDS.includes(previous)||!PHASE_IDS.includes(actual))throw Error("Unknown phase label.");
      const baseline=baselineDistribution(model);
      const learned=predictNextPhase(model,previous);
      baselineCorrect+=Number(bestLabel(baseline)===actual);
      learnedCorrect+=Number(bestLabel(learned)===actual);
      baselineLoss+=-Math.log(Math.max(1e-12,baseline[actual]));
      learnedLoss+=-Math.log(Math.max(1e-12,learned[actual]));
    }
    const total=group.phases.length-1;
    return {
      groupKey:group.groupKey,
      transitions:total,
      baselineAccuracy:baselineCorrect/total,
      learnedAccuracy:learnedCorrect/total,
      baselineLogLoss:baselineLoss/total,
      learnedLogLoss:learnedLoss/total,
      // Positive values mean a Markov advantage over the baseline.
      accuracyGain:(learnedCorrect-baselineCorrect)/total,
      logLossGain:(baselineLoss-learnedLoss)/total
    };
  });
}

export function bootstrapSourceGains(outcomes,{draws=BOOTSTRAP_DRAWS,seed=369}={}){
  if(!Array.isArray(outcomes)||!outcomes.length)throw Error("At least one held-out source is required.");
  if(!Number.isInteger(draws)||draws<20||draws>1000)throw Error("Bootstrap draws must be 20–1000.");
  if(!Number.isInteger(seed))throw Error("Bootstrap seed must be an integer.");
  if(outcomes.length<3)return {
    available:false,reason:"Fewer than three held-out original-source groups.",
    lower:null,upper:null,probabilityModelLowerLoss:null
  };
  const random=randomGenerator(seed);
  const deltas=[];
  for(let draw=0;draw<draws;draw++){
    let sum=0;
    for(let k=0;k<outcomes.length;k++){
      const pick=Math.floor(random()*outcomes.length);
      sum+=outcomes[pick].logLossGain;
    }
    deltas.push(sum/outcomes.length);
  }
  return {
    available:true,draws,
    lower:safeRound(quantile(deltas,0.10)),
    upper:safeRound(quantile(deltas,0.90)),
    probabilityModelLowerLoss:safeRound(deltas.filter(x=>x>0).length/deltas.length)
  };
}

export function runReliabilityStudy(records,rhythms,rawOptions={}){
  const {seed,ratio,repeats}=normalizeReliabilityOptions(rawOptions);
  const first=planResearchSplits(records,rhythms,{seed,ratio});
  if(first.eligibleCount<12)throw Error("Reliability lab requires at least 12 eligible reviewed original-source groups; use v0.8 for smaller experiments.");
  if(first.counts.test<2||first.counts.validation<1)throw Error("Too few groups for a repeated train/validation/test comparison.");
  const runs=[];
  const seenHoldouts=new Set(),coverage=new Set();
  for(let i=0;i<repeats;i++){
    // Distinct, reproducible seeds. Neither model nor smoothing option is
    // selected from this repeated test performance.
    const splitSeed=(seed+i*7919)%1000000;
    const plan=planResearchSplits(records,rhythms,{seed:splitSeed,ratio});
    const partitions=partitionExamples(plan);
    const fitted=runLearningExperiment(records,rhythms,{seed:splitSeed,ratio});
    if(!SMOOTHING_OPTIONS.includes(fitted.selectedAlpha))throw Error("Unexpected fitted smoothing parameter.");
    const test=partitions.test;
    // Both algorithms are evaluated as a paired comparison on exactly the
    // same original-source groups. One label sequence per source.
    const outcome=pairedSourceOutcomes(fitted.model,test);
    const bootstrap=bootstrapSourceGains(outcome,{seed:splitSeed+8731});
    const key=test.map(group=>group.groupKey).sort().join("\u001f");
    seenHoldouts.add(key);
    for(const group of test)coverage.add(group.groupKey);
    const baselineLoss=mean(outcome.map(x=>x.baselineLogLoss));
    const learnedLoss=mean(outcome.map(x=>x.learnedLogLoss));
    const baselineAccuracy=mean(outcome.map(x=>x.baselineAccuracy));
    const learnedAccuracy=mean(outcome.map(x=>x.learnedAccuracy));
    runs.push({
      iteration:i+1,seed:splitSeed,trainGroups:partitions.train.length,
      validationGroups:partitions.validation.length,testGroups:test.length,
      alpha:fitted.selectedAlpha,
      baselineLogLoss:safeRound(baselineLoss),
      learnedLogLoss:safeRound(learnedLoss),
      logLossGain:safeRound(baselineLoss-learnedLoss),
      baselineAccuracy:safeRound(baselineAccuracy),
      learnedAccuracy:safeRound(learnedAccuracy),
      accuracyGain:safeRound(learnedAccuracy-baselineAccuracy),
      bootstrap
    });
  }
  const losses=runs.map(r=>r.logLossGain);
  const accuracies=runs.map(r=>r.accuracyGain);
  const average=(values)=>safeRound(mean(values));
  const interval=(values)=>[safeRound(quantile(values,0.10)),safeRound(quantile(values,0.90))];
  const improving=runs.filter(r=>r.logLossGain>0).length;
  const warnings=[
    "This is repeated source-group holdout sensitivity analysis, NOT a new pristine test set or a confidence interval for real-world humor.",
    "The 10th–90th percentile bands are descriptive variation across overlapping seeded splits; evaluations reuse some of the same source groups.",
    "Each within-split bootstrap resamples whole held-out source groups as paired units. Its 10th–90th band is exploratory, not a calibrated confidence interval.",
    "Synthetic examples reuse four template families: even disjoint synthetic source IDs can share templates and inflate apparent generalization.",
    "User-entered group identities, rights claims, and source independence have not been externally verified.",
    "Repeated test inspection can bias subsequent model design. Freeze an external independent benchmark before making scientific performance claims."
  ];
  return {
    kind:"ComedyAtlasReliabilityStudy",schemaVersion:RELIABILITY_VERSION,
    task:"Sensitivity of v0.8 next-human-annotated-phase prediction to source-group split assignment.",
    settings:{seed,ratio,repeats,bootstrapDraws:BOOTSTRAP_DRAWS},
    groupCounts:{
      eligible:first.eligibleCount,quarantined:first.quarantined.length,
      draftAnnotationsExcluded:first.draftCount,orphanLinksExcluded:first.orphanCount,
      distinctHoldoutPartitions:seenHoldouts.size,
      distinctSourcesEverTested:coverage.size,
      testCoveragePercent:safeRound(100*coverage.size/first.eligibleCount,1)
    },
    summary:{
      meanLogLossGain:average(losses),
      middle80LogLossGain:interval(losses),
      meanAccuracyGain:average(accuracies),
      middle80AccuracyGain:interval(accuracies),
      lowerLogLossRunCount:improving,
      lowerLogLossRunShare:safeRound(improving/repeats),
      minTestGroups:Math.min(...runs.map(r=>r.testGroups)),
      maxTestGroups:Math.max(...runs.map(r=>r.testGroups))
    },
    runs,warnings
  };
}
export function exportReliabilityStudy(result,cohort){
  if(!["synthetic","personal"].includes(cohort)||result?.kind!=="ComedyAtlasReliabilityStudy")throw Error("Unknown cohort or missing reliability study.");
  // All run rows contain metrics, never source IDs, annotators or media.
  const allowed=[
    "iteration","seed","trainGroups","validationGroups","testGroups","alpha",
    "baselineLogLoss","learnedLogLoss","logLossGain","baselineAccuracy",
    "learnedAccuracy","accuracyGain","bootstrap"
  ];
  return {
    kind:"ComedyAtlasReliabilityStudyExport",schemaVersion:RELIABILITY_VERSION,
    generatedAt:new Date().toISOString(),cohort,
    task:result.task,settings:result.settings,
    groupCounts:result.groupCounts,summary:result.summary,
    runs:result.runs.map(row=>Object.fromEntries(allowed.map(key=>[key,row[key]]))),
    warnings:result.warnings,
    privacy:"Aggregate features and seeded split metrics only; no source keys, source URLs, timeline titles, pseudonyms, raw audio, or transcripts."
  };
}
