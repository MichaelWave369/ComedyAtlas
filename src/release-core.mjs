import {buildResearchCohort} from "./research-core.mjs";
import {trainTransitionModel,evaluatePhasePrediction,SMOOTHING_OPTIONS,syntheticLearningCohort} from "./learning-core.mjs";

export const RELEASE_REVIEW_KEY="comedyatlas.release-reviews.v1";
export const RELEASE_REVIEW_KIND="ComedyAtlasReleaseReviews";
export const RELEASE_REVIEW_VERSION=1;
export const MAX_RELEASE_REVIEWS=250;
export const MAX_RELEASE_IMPORT_BYTES=1024*1024;
export const REVIEW_STATES=Object.freeze(["approved","needs-review","excluded"]);
export const SOURCE_ORIGINS=Object.freeze(["original","permitted","synthetic","reference-only","unknown"]);

function limited(value,label,max,optional=false){
  if(typeof value!=="string")throw Error(label+" must be text.");
  const s=value.trim();
  if(s.length>max||(!optional&&!s))throw Error(label+" must be "+(optional?"up to ":"1 to ")+max+" characters.");
  return s;
}
function slug(value,label){
  const s=limited(value,label,64).toLowerCase();
  if(!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(s))throw Error(label+" must be a hyphenated lowercase slug.");
  return s;
}
export function normalizeReleaseReview(raw){
  if(!raw||typeof raw!=="object"||Array.isArray(raw))throw Error("Review decision must be an object.");
  const groupKey=slug(raw.groupKey,"Source group key");
  const familyKey=slug(raw.familyKey,"Underlying source family");
  const reviewer=limited(raw.reviewer,"Reviewer pseudonym",60);
  if(!/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(reviewer))
    throw Error("Reviewer pseudonym can contain only letters, digits, dots, underscores and hyphens.");
  if(!REVIEW_STATES.includes(raw.status))throw Error("Unknown review decision.");
  if(!SOURCE_ORIGINS.includes(raw.origin))throw Error("Unknown source origin.");
  const note=limited(raw.note??"","Review note",600,true);
  const updatedAt=limited(raw.updatedAt,"Review timestamp",40);
  const date=new Date(updatedAt);
  if(!Number.isFinite(date.getTime())||date.toISOString()!==updatedAt)throw Error("Review timestamp must be ISO UTC.");
  return {groupKey,familyKey,status:raw.status,origin:raw.origin,reviewer,note,updatedAt};
}
export function serializeReleaseReviews(reviews){
  return JSON.stringify({kind:RELEASE_REVIEW_KIND,schemaVersion:RELEASE_REVIEW_VERSION,
    exportedAt:new Date().toISOString(),reviews},null,2)+"\n";
}
export function parseReleaseReviews(json){
  if(typeof json!=="string"||json.length>MAX_RELEASE_IMPORT_BYTES)throw Error("Review backup exceeds 1 MB.");
  let pack;try{pack=JSON.parse(json);}catch{throw Error("Not valid JSON.");}
  if(!pack||pack.kind!==RELEASE_REVIEW_KIND||pack.schemaVersion!==RELEASE_REVIEW_VERSION||!Array.isArray(pack.reviews))
    throw Error("Unsupported review backup schema.");
  if(pack.reviews.length>MAX_RELEASE_REVIEWS)throw Error("Review backup exceeds "+MAX_RELEASE_REVIEWS+" records.");
  const reviews=pack.reviews.map(normalizeReleaseReview);
  if(new Set(reviews.map(r=>r.groupKey)).size!==reviews.length)throw Error("Duplicate source-group decisions.");
  return reviews;
}
export function mergeReleaseReviews(existing,incoming){
  const merged=new Map(existing.map(review=>[review.groupKey,review]));
  for(const review of incoming)if(!merged.has(review.groupKey))merged.set(review.groupKey,review);
  if(merged.size>MAX_RELEASE_REVIEWS)throw Error("Review notebook is full.");
  return [...merged.values()].sort((a,b)=>a.groupKey.localeCompare(b.groupKey));
}
export function syntheticReleaseReviews(){
  // Each of 36 generated sequences descends from one of just FOUR recurring
  // original demo patterns. Mark that lineage explicitly, never count 36
  // distinct experimental source IDs as 36 unrelated templates.
  const source=syntheticLearningCohort();
  return source.evidence.map((record,index)=>({
    groupKey:record.groupKey,familyKey:"fictional-template-"+(index%4+1),
    status:"approved",origin:"synthetic",reviewer:"synthetic-generator",
    note:"Auto-tagged original fictional exercise, not a human verified review.",
    updatedAt:"2026-01-01T00:00:00.000Z"
  }));
}
export function auditResearchRelease(evidence,rhythms,reviews,{cohort="personal"}={}){
  if(!["personal","synthetic"].includes(cohort))throw Error("Unknown release cohort.");
  if(!Array.isArray(reviews))throw Error("Review decisions must be an array.");
  const clean=reviews.map(normalizeReleaseReview);
  if(new Set(clean.map(r=>r.groupKey)).size!==clean.length)throw Error("Duplicate review decisions.");
  const reviewMap=new Map(clean.map(r=>[r.groupKey,r]));
  const raw=buildResearchCohort(evidence,rhythms);
  const excluded=new Map(raw.quarantined.map(entry=>[entry.key,entry.reasons]));
  const accepted=[],inventory=[];
  for(const group of raw.groups){
    const review=reviewMap.get(group.key);
    const reasons=[...(excluded.get(group.key)||[])];
    if(!review)reasons.push("Missing source-family review");
    else {
      if(review.status!=="approved")reasons.push("Decision: "+review.status);
      if(cohort==="personal"){
        if(!["original","permitted"].includes(review.origin))reasons.push("Origin not self-declared original or permitted");
        if(!group.claimedPermission)reasons.push("Existing evidence lacks self-reported permission for every selected annotation");
      }else if(review.origin!=="synthetic"){
        reasons.push("Synthetic examples require synthetic provenance");
      }
    }
    const item={
      groupKey:group.key,
      familyKey:review?.familyKey||null,
      sourceCount:group.rawCount,
      distinctAnnotators:group.annotators,
      reviewStatus:review?.status||"unreviewed",
      origin:review?.origin||"unknown",
      reasons
    };
    inventory.push(item);
    if(!reasons.length){
      // Only one validated annotation per source group is used, so one group
      // cannot gain extra influence merely by having extra annotators.
      const first=group.selected[0];
      const sequence=raw.sequenceMap.get(first.rhythmId);
      accepted.push({
        groupKey:group.key,familyKey:review.familyKey,
        phases:sequence.segments.map(s=>s.phase)
      });
    }
  }
  const families=[...new Set(accepted.map(s=>s.familyKey))].sort();
  const orphanDecisions=clean.filter(r=>!raw.groups.some(g=>g.key===r.groupKey)).map(r=>r.groupKey);
  return {
    cohort,accepted,inventory,
    acceptedSources:accepted.length,acceptedFamilies:families.length,
    families,
    rejectedSources:inventory.length-accepted.length,
    missingReviewCount:inventory.filter(i=>i.reviewStatus==="unreviewed").length,
    reviewCount:clean.length,orphanReviewCount:orphanDecisions.length,
    reviewedEvidenceGroups:raw.groups.length,
    duplicateSourceConflicts:raw.quarantined.length,
    draftsExcluded:raw.draftCount,orphanEvidenceExcluded:raw.orphanCount,
    // This condition is a software preflight, NOT independent legal review.
    familyBenchmarkPossible:families.length>=3&&accepted.length>=6,
    warnings:[
      "Every review, rights claim, annotator identity and source-family label is self-reported.",
      "Family-separated testing does not prove performances or creative ideas are independently sourced.",
      "Approved means locally screened for this experiment, not licensed, verified, or scientifically validated.",
      "Training on unlicensed copyrighted recordings is not authorized by this review ledger."
    ]
  };
}
const average=values=>values.reduce((s,v)=>s+v,0)/values.length;
const round=n=>Number(n.toFixed(4));

export function runFamilyHoldoutBenchmark(audit){
  if(!audit?.familyBenchmarkPossible)throw Error("Need six accepted source groups spanning at least three reviewed source families.");
  const families=[...audit.families].sort();
  const folds=[];
  for(const holdout of families){
    const test=audit.accepted.filter(r=>r.familyKey===holdout);
    const training=audit.accepted.filter(r=>r.familyKey!==holdout);
    const innerFamilies=[...new Set(training.map(r=>r.familyKey))].sort();
    if(innerFamilies.length<2)throw Error("Nested validation requires at least two non-held-out families.");
    const candidates=SMOOTHING_OPTIONS.map(alpha=>{
      const validationLoss=innerFamilies.map(inner=>{
        const innerTrain=training.filter(r=>r.familyKey!==inner);
        const innerValidation=training.filter(r=>r.familyKey===inner);
        const model=trainTransitionModel(innerTrain,alpha);
        return evaluatePhasePrediction(model,innerValidation).groupBalancedLogLoss;
      });
      return {alpha,innerMeanLogLoss:round(average(validationLoss))};
    }).sort((a,b)=>a.innerMeanLogLoss-b.innerMeanLogLoss||a.alpha-b.alpha);
    // Test-family examples are never used for fitting or selecting alpha.
    const selectedAlpha=candidates[0].alpha;
    const model=trainTransitionModel(training,selectedAlpha);
    const learned=evaluatePhasePrediction(model,test,"markov");
    const baseline=evaluatePhasePrediction(model,test,"majority");
    folds.push({
      familyKey:holdout,
      trainFamilies:innerFamilies.length,
      trainSources:training.length,testSources:test.length,
      selectedAlpha,
      validationMeanLogLoss:candidates[0].innerMeanLogLoss,
      learnedLogLoss:learned.groupBalancedLogLoss,
      baselineLogLoss:baseline.groupBalancedLogLoss,
      logLossGain:round(baseline.groupBalancedLogLoss-learned.groupBalancedLogLoss),
      learnedAccuracy:learned.groupBalancedAccuracy,
      baselineAccuracy:baseline.groupBalancedAccuracy,
      accuracyGain:round(learned.groupBalancedAccuracy-baseline.groupBalancedAccuracy)
    });
  }
  return {
    kind:"ComedyAtlasFamilyHoldoutBenchmark",schemaVersion:1,
    cohort:audit.cohort,
    acceptedFamilies:families.length,acceptedSources:audit.acceptedSources,
    totalFolds:folds.length,
    meanLogLossGain:round(average(folds.map(r=>r.logLossGain))),
    meanAccuracyGain:round(average(folds.map(r=>r.accuracyGain))),
    learnedBetterLossFolds:folds.filter(f=>f.logLossGain>0).length,
    folds,
    warnings:[
      "Every source family is withheld entirely in its fold; smoothing is selected using nested leave-one-training-family-out validation.",
      "Means give each family equal weight, not each annotated transition.",
      "This is a small local source-family diagnostic, not an independently audited benchmark or a new model release.",
      "Template families, permissions and independent reviewer identities are self-reported or synthetic; no external rights audit was performed."
    ]
  };
}
export function exportFamilyBenchmark(report){
  if(report?.kind!=="ComedyAtlasFamilyHoldoutBenchmark")throw Error("A completed benchmark is required.");
  return {
    kind:"ComedyAtlasFamilyBenchmarkExport",schemaVersion:1,generatedAt:new Date().toISOString(),
    cohort:report.cohort,
    acceptedFamilies:report.acceptedFamilies,acceptedSources:report.acceptedSources,
    meanLogLossGain:report.meanLogLossGain,meanAccuracyGain:report.meanAccuracyGain,
    learnedBetterLossFolds:report.learnedBetterLossFolds,
    // Source/family keys and human review notes stay inside the user's browser.
    folds:report.folds.map((f,i)=>({
      fold:i+1,trainFamilies:f.trainFamilies,trainSources:f.trainSources,
      testSources:f.testSources,alpha:f.selectedAlpha,
      validationMeanLogLoss:f.validationMeanLogLoss,
      learnedLogLoss:f.learnedLogLoss,baselineLogLoss:f.baselineLogLoss,
      logLossGain:f.logLossGain,learnedAccuracy:f.learnedAccuracy,
      baselineAccuracy:f.baselineAccuracy,accuracyGain:f.accuracyGain
    })),
    warnings:report.warnings
  };
}
