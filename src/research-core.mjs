import {normalizeRhythm} from "./rhythm-core.mjs";
import {normalizeEvidence} from "./evidence-core.mjs";
import {comparePatterns,extractPattern} from "./pattern-core.mjs";

export const RESEARCH_VERSION=1;
export const RESEARCH_SPLITS=Object.freeze({
  balanced:{train:0.6,validation:0.2,test:0.2},
  default:{train:0.7,validation:0.15,test:0.15},
  trainingHeavy:{train:0.8,validation:0.1,test:0.1}
});
const SPLIT_NAMES=["train","validation","test"];

function compareRecords(a,b){
  return b.createdAt.localeCompare(a.createdAt)||a.id.localeCompare(b.id);
}
function canonicalLink(urlString){
  if(!urlString)return "";
  const url=new URL(urlString);
  // Fragments often encode a start time in the same original performance.
  url.hash="";
  // Do not discard query parameters: YouTube video IDs and some public
  // archives encode the exact underlying work there.
  if(url.pathname.length>1&&url.pathname.endsWith("/"))url.pathname=url.pathname.slice(0,-1);
  return url.href;
}
function hashGroup(key,seed){
  let hash=2166136261;
  for(const char of seed+":"+key){
    hash=Math.imul(hash^char.charCodeAt(0),16777619);
  }
  return hash>>>0; // non-cryptographic deterministic ordering, NOT anonymization
}
export function normalizePlanOptions(raw={}){
  const seed=raw.seed??369;
  const ratio=raw.ratio??"default";
  if(!Number.isInteger(seed)||seed<0||seed>999999)throw Error("Seed must be an integer from 0 to 999999.");
  if(!Object.hasOwn(RESEARCH_SPLITS,ratio))throw Error("Unknown training/validation/test ratio.");
  return {seed,ratio};
}

export function buildResearchCohort(records,rhythms){
  if(!Array.isArray(records)||!Array.isArray(rhythms))throw Error("Evidence and rhythm arrays are required.");
  const sequenceMap=new Map();
  for(const raw of rhythms){
    const sequence=normalizeRhythm(raw);
    if(sequenceMap.has(sequence.id))throw Error("Duplicate saved rhythm ID.");
    sequenceMap.set(sequence.id,sequence);
  }
  const allowed=new Set(sequenceMap.keys());
  const cleanRecords=records.map(raw=>normalizeEvidence(raw,allowed,{allowOrphans:true}));
  if(new Set(cleanRecords.map(r=>r.id)).size!==cleanRecords.length)throw Error("Duplicate evidence record ID.");
  const orphaned=cleanRecords.filter(r=>!sequenceMap.has(r.rhythmId));
  const drafts=cleanRecords.filter(r=>r.reviewStatus!=="reviewed"&&sequenceMap.has(r.rhythmId));
  const reviewed=cleanRecords.filter(r=>r.reviewStatus==="reviewed"&&sequenceMap.has(r.rhythmId));
  const bySource=new Map();
  for(const record of reviewed){
    if(!bySource.has(record.groupKey))bySource.set(record.groupKey,[]);
    bySource.get(record.groupKey).push(record);
  }
  const groups=[...bySource.entries()].map(([key,source])=>{
    const byAnnotator=new Map();
    for(const record of [...source].sort(compareRecords))
      if(!byAnnotator.has(record.annotator))byAnnotator.set(record.annotator,record);
    const selected=[...byAnnotator.values()].sort((a,b)=>a.annotator.localeCompare(b.annotator));
    return {
      key,rawCount:source.length,selected,
      annotators:selected.length,
      claimedPermission:selected.length>0&&selected.every(r=>r.rightsStatus==="permission-claimed"),
      confidences:Object.fromEntries(["low","medium","high"].map(c=>[c,selected.filter(r=>r.confidence===c).length]))
    };
  }).sort((a,b)=>a.key.localeCompare(b.key));
  // A rhythm or canonical URL assigned to different group keys is a possible
  // leakage path. Quarantine BOTH groups, not just whichever is seen second.
  const crossLinks=new Map();
  for(const group of groups){
    for(const record of group.selected){
      for(const identifier of [
        "rhythm:"+record.rhythmId,
        ...(record.sourceUrl?["url:"+canonicalLink(record.sourceUrl)]:[])
      ]){
        if(!crossLinks.has(identifier))crossLinks.set(identifier,new Set());
        crossLinks.get(identifier).add(group.key);
      }
    }
  }
  const conflicts=new Map();
  for(const [identifier,keys] of crossLinks){
    if(keys.size<2)continue;
    for(const key of keys){
      if(!conflicts.has(key))conflicts.set(key,[]);
      conflicts.get(key).push(identifier.startsWith("url:")?"shared reference URL":"shared rhythm timeline");
    }
  }
  const quarantined=groups.filter(group=>conflicts.has(group.key)).map(group=>({
    key:group.key,reasons:[...new Set(conflicts.get(group.key))].sort()
  }));
  const eligible=groups.filter(group=>!conflicts.has(group.key));
  return {
    groups,eligible,quarantined,
    orphanCount:orphaned.length,draftCount:drafts.length,reviewedCount:reviewed.length,
    totalRecords:cleanRecords.length,
    sequenceMap
  };
}

function targetCounts(n,ratios){
  if(n<3)return {train:0,validation:0,test:0,unsplit:n};
  const validation=Math.max(1,Math.round(n*ratios.validation));
  const test=Math.max(1,Math.round(n*ratios.test));
  const train=n-validation-test;
  // The supported ratios guarantee at least one train group for n>=3,
  // but remain defensive against future ratio configurations.
  if(train<1)throw Error("Not enough groups to fill the requested partitions.");
  return {train,validation,test,unsplit:0};
}

export function planResearchSplits(records,rhythms,rawOptions={}){
  const options=normalizePlanOptions(rawOptions);
  const cohort=buildResearchCohort(records,rhythms);
  const groupOrder=[...cohort.eligible].sort((a,b)=>
    hashGroup(a.key,String(options.seed))-hashGroup(b.key,String(options.seed))||a.key.localeCompare(b.key));
  const counts=targetCounts(groupOrder.length,RESEARCH_SPLITS[options.ratio]);
  const buckets={train:[],validation:[],test:[]};
  const assignments={};
  let cursor=0;
  for(const label of SPLIT_NAMES){
    for(const group of groupOrder.slice(cursor,cursor+counts[label])){
      buckets[label].push(group.key);
      assignments[group.key]=label;
    }
    cursor+=counts[label];
  }
  const byGroup=new Map(cohort.groups.map(group=>[group.key,group]));
  const annotations=Object.fromEntries(SPLIT_NAMES.map(label=>[
    label,
    buckets[label].flatMap(key=>byGroup.get(key).selected.map(record=>({
      id:record.id,groupKey:key,rhythmId:record.rhythmId,
      confidence:record.confidence,rightsStatus:record.rightsStatus,
      pattern:extractPattern(cohort.sequenceMap.get(record.rhythmId))
    })))
  ]));
  const splitReady=groupOrder.length>=3;
  const allRightsClaimed=cohort.eligible.length>0&&cohort.eligible.every(group=>group.claimedPermission);
  const checks={
    enoughGroupsToSplit:splitReady,
    noDuplicateSourceConflicts:cohort.quarantined.length===0,
    noOrphanReferences:cohort.orphanCount===0,
    noDrafts:cohort.draftCount===0,
    sourceRightsClaimsComplete:allRightsClaimed,
    doubleAnnotatedSources:cohort.eligible.filter(g=>g.annotators>=2).length>=2
  };
  const warnings=[];
  if(!splitReady)warnings.push("At least three non-conflicting reviewed source groups are required to create train/validation/test partitions.");
  if(cohort.quarantined.length)warnings.push("Shared rhythm IDs or canonical source URLs span multiple group keys. Conflicting groups are quarantined from every split.");
  if(cohort.orphanCount)warnings.push(cohort.orphanCount+" missing rhythm link(s) were excluded.");
  if(cohort.draftCount)warnings.push(cohort.draftCount+" unreviewed annotation(s) were excluded.");
  if(!allRightsClaimed)warnings.push("Not all candidate source groups even have self-reported permission claims. Those labels are NOT proof of rights.");
  if(!checks.doubleAnnotatedSources)warnings.push("Fewer than two source groups have more than one reviewer pseudonym.");
  warnings.push("This is a feature-only research planning preview, NOT authorization to train or proof of copyright clearance, identity, or source independence.");
  return {
    options,groupCount:cohort.groups.length,eligibleCount:cohort.eligible.length,
    totalEvidence:cohort.totalRecords,orphanCount:cohort.orphanCount,draftCount:cohort.draftCount,
    quarantined:cohort.quarantined,counts,buckets,annotations,
    checks,warnings,previewChecklistComplete:Object.values(checks).every(Boolean),
    auditPermissionVerified:false,
    // Explicitly not a trainable dataset or a trained model.
    methodology:"Reviewed records only; latest per annotator and source; all records for a source group in one partition; fixed seeded non-cryptographic ordering."
  };
}

export function listReviewDisagreements(records,rhythms){
  const cohort=buildResearchCohort(records,rhythms);
  const output=[];
  for(const group of cohort.groups){
    if(group.selected.length<2)continue;
    const pairs=[];
    for(let i=0;i<group.selected.length;i++){
      for(let j=i+1;j<group.selected.length;j++){
        const a=group.selected[i],b=group.selected[j];
        const comparison=comparePatterns(cohort.sequenceMap.get(a.rhythmId),cohort.sequenceMap.get(b.rhythmId));
        pairs.push({
          first:a.annotator,second:b.annotator,score:comparison.score,
          components:comparison.components
        });
      }
    }
    const meanSimilarity=Math.round(pairs.reduce((sum,item)=>sum+item.score,0)/pairs.length);
    output.push({
      groupKey:group.key,annotatorCount:group.selected.length,pairCount:pairs.length,
      meanSimilarity,pairs
    });
  }
  return output.sort((a,b)=>a.meanSimilarity-b.meanSimilarity||a.groupKey.localeCompare(b.groupKey));
}

export function exportResearchPreview(plan,disagreements){
  return {
    kind:"ComedyAtlasResearchSplitPreview",schemaVersion:RESEARCH_VERSION,
    generatedAt:new Date().toISOString(),
    permittedUse:"Research planning only. No rights have been verified. Do not treat this manifest as training authorization.",
    options:plan.options,counts:plan.counts,buckets:plan.buckets,
    quarantined:plan.quarantined,checks:plan.checks,warnings:plan.warnings,
    featuresByPartition:plan.annotations,
    disagreements:disagreements.map(item=>({
      groupKey:item.groupKey,meanSimilarity:item.meanSimilarity,
      pairCount:item.pairCount,
      // Do not export pseudonyms even though the UI can show them locally.
      componentSummaries:item.pairs.map(p=>p.components)
    }))
  };
}
