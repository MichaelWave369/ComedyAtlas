import {normalizeRhythm} from "./rhythm-core.mjs";
import {comparePatterns,extractPattern} from "./pattern-core.mjs";

export const EVIDENCE_KEY="comedyatlas.evidence.v1";
export const EVIDENCE_KIND="ComedyAtlasEvidenceNotebook";
export const EVIDENCE_VERSION=1;
export const MAX_EVIDENCE=250;
export const MAX_EVIDENCE_BYTES=1024*1024;
export const CONFIDENCE=["low","medium","high"];
export const REVIEW=["draft","reviewed"];
export const RIGHTS=["unknown","reference-only","permission-claimed"];

function field(value,label,limit,optional=false){
  if(typeof value!=="string")throw Error(label+" must be text.");
  const s=value.trim();
  if(s.length>limit||(!optional&&!s))throw Error(label+" must be "+(optional?"at most ":"1 to ")+limit+" characters.");
  return s;
}
function validIso(value){
  const t=field(value,"Timestamp",40);
  const d=new Date(t);
  if(!Number.isFinite(d.valueOf())||d.toISOString()!==t)throw Error("Invalid timestamp.");
  return t;
}
export function normalizeEvidence(raw,allowedRhythms,{allowOrphans=false}={}){
  if(!raw||typeof raw!=="object"||Array.isArray(raw))throw Error("Evidence record must be an object.");
  if(!(allowedRhythms instanceof Set))throw Error("A set of saved rhythm IDs is required.");
  const id=field(raw.id,"Record ID",70);
  if(!/^evidence-[a-zA-Z0-9-]{8,60}$/.test(id))throw Error("Invalid evidence ID.");
  const rhythmId=field(raw.rhythmId,"Rhythm ID",70);
  if(!allowedRhythms.has(rhythmId)&&!allowOrphans)throw Error("Linked rhythm is not in the saved notebook.");
  const groupKey=field(raw.groupKey,"Source group key",64).toLowerCase();
  if(!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(groupKey))throw Error("Use a slug such as show-episode-01 for the source group.");
  const sourceTitle=field(raw.sourceTitle,"Source title",160);
  const sourceUrl=field(raw.sourceUrl??"","Source URL",2048,true);
  if(sourceUrl){
    let url;
    try{url=new URL(sourceUrl);}catch{throw Error("Source URL is not valid.");}
    if(!["https:","http:"].includes(url.protocol)||url.username||url.password)
      throw Error("Only standard http(s) source URLs without credentials are allowed.");
  }
  const annotator=field(raw.annotator,"Annotator pseudonym",60);
  if(!/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,59}$/.test(annotator))
    throw Error("Use a short pseudonym without spaces or personal contact information.");
  if(!CONFIDENCE.includes(raw.confidence))throw Error("Unknown confidence label.");
  if(!REVIEW.includes(raw.reviewStatus))throw Error("Unknown review status.");
  if(!RIGHTS.includes(raw.rightsStatus))throw Error("Unknown rights status.");
  const note=field(raw.note??"","Method / caveat",600,true);
  return {
    id,rhythmId,groupKey,sourceTitle,sourceUrl,annotator,
    confidence:raw.confidence,reviewStatus:raw.reviewStatus,
    rightsStatus:raw.rightsStatus,note,
    createdAt:validIso(raw.createdAt)
  };
}
export function parseEvidence(text,allowedRhythms,{allowOrphans=true}={}){
  if(typeof text!=="string"||text.length>MAX_EVIDENCE_BYTES)throw Error("Evidence backup exceeds 1 MB.");
  let data;
  try{data=JSON.parse(text);}catch{throw Error("Invalid JSON.");}
  if(!data||data.kind!==EVIDENCE_KIND||data.schemaVersion!==EVIDENCE_VERSION||!Array.isArray(data.records))
    throw Error("Unsupported evidence notebook format (expected version 1).");
  if(data.records.length>MAX_EVIDENCE)throw Error("Too many evidence records.");
  const records=data.records.map(r=>normalizeEvidence(r,allowedRhythms,{allowOrphans}));
  if(new Set(records.map(r=>r.id)).size!==records.length)throw Error("Duplicate evidence IDs.");
  return records;
}
export function serializeEvidence(records){
  return JSON.stringify({
    kind:EVIDENCE_KIND,schemaVersion:EVIDENCE_VERSION,exportedAt:new Date().toISOString(),records
  },null,2)+"\n";
}
export function mergeEvidence(existing,incoming){
  const map=new Map(existing.map(record=>[record.id,record]));
  for(const record of incoming)if(!map.has(record.id))map.set(record.id,record);
  if(map.size>MAX_EVIDENCE)throw Error("Evidence notebook cannot exceed "+MAX_EVIDENCE+" records.");
  return [...map.values()].sort((a,b)=>b.createdAt.localeCompare(a.createdAt)||a.id.localeCompare(b.id));
}

// We keep orphaned evidence on disk if a rhythm is removed, but cannot use it in
// statistics or a dataset until its referenced rhythm has been restored.
export function evidenceSummary(records,rhythms){
  const sequenceMap=new Map(rhythms.map(r=>[r.id,normalizeRhythm(r)]));
  const linked=records.filter(r=>sequenceMap.has(r.rhythmId));
  const orphans=records.filter(r=>!sequenceMap.has(r.rhythmId));
  const reviewed=linked.filter(r=>r.reviewStatus==="reviewed");
  const bySource=new Map();
  for(const r of reviewed){
    if(!bySource.has(r.groupKey))bySource.set(r.groupKey,[]);
    bySource.get(r.groupKey).push(r);
  }
  const doubleCoded=[];
  let agreements=[];
  for(const [key,groupRecords] of bySource){
    // One latest annotation per pseudonym per source; prevents a contributor
    // from multiplying apparent independent reviewers by repeated submissions.
    const byAnnotator=new Map();
    const sorted=[...groupRecords].sort((a,b)=>b.createdAt.localeCompare(a.createdAt)||a.id.localeCompare(b.id));
    for(const r of sorted)if(!byAnnotator.has(r.annotator))byAnnotator.set(r.annotator,r);
    const independentPeople=[...byAnnotator.values()];
    if(independentPeople.length>=2){
      doubleCoded.push(key);
      for(let i=0;i<independentPeople.length;i++)
        for(let j=i+1;j<independentPeople.length;j++)
          agreements.push({
            groupKey:key,
            first:independentPeople[i].annotator,
            second:independentPeople[j].annotator,
            score:comparePatterns(sequenceMap.get(independentPeople[i].rhythmId),sequenceMap.get(independentPeople[j].rhythmId)).score
          });
    }
  }
  const groups=[...bySource.keys()].sort();
  const people=[...new Set(reviewed.map(r=>r.annotator))].sort();
  const rightsClaimedGroups=[...new Set(reviewed.filter(r=>r.rightsStatus==="permission-claimed").map(r=>r.groupKey))].sort();
  const checks={
    threeReviewedSources:groups.length>=3,
    twoAnnotators:people.length>=2,
    twoDoubleCodedSources:doubleCoded.length>=2,
    threeRightsClaims:rightsClaimedGroups.length>=3,
    noOrphans:orphans.length===0
  };
  return {
    totalRecords:records.length,linkedRecords:linked.length,orphanRecords:orphans.length,
    draftRecords:linked.filter(r=>r.reviewStatus==="draft").length,
    reviewedRecords:reviewed.length,sourceGroups:groups.length,groupKeys:groups,
    distinctAnnotators:people.length,doubleCodedSources:doubleCoded.length,
    agreementPairs:agreements.length,
    averageStructuralAgreement:agreements.length
      ?Math.round(agreements.reduce((s,p)=>s+p.score,0)/agreements.length):null,
    rightsClaimedGroups:rightsClaimedGroups.length,checks,
    // This means only that minimal self-reported screening fields are present.
    // No source veracity, rights, annotator identity or data quality is verified.
    pilotReviewChecklistComplete:Object.values(checks).every(Boolean),
    agreementDetails:agreements
  };
}

// Independent group support: one source group contributes at most one vote per
// motif, regardless of how many annotators or mirrored clips were recorded.
export function sourceAwareMotifs(records,rhythms,{length=2,minSources=2}={}){
  if(![2,3].includes(length))throw Error("Motif length must be 2 or 3.");
  if(!Number.isInteger(minSources)||minSources<2||minSources>60)throw Error("Minimum source support must be 2–60.");
  const map=new Map(rhythms.map(r=>[r.id,normalizeRhythm(r)]));
  const byGroup=new Map();
  for(const r of records){
    if(r.reviewStatus!=="reviewed"||!map.has(r.rhythmId))continue;
    const phases=map.get(r.rhythmId).segments.map(s=>s.phase);
    const local=byGroup.get(r.groupKey)||new Set();
    for(let i=0;i<=phases.length-length;i++)local.add(phases.slice(i,i+length).join("|"));
    byGroup.set(r.groupKey,local);
  }
  const support=new Map();
  for(const [group,motifs] of byGroup)for(const motif of motifs){
    if(!support.has(motif))support.set(motif,[]);
    support.get(motif).push(group);
  }
  return [...support.entries()].filter(([,groups])=>groups.length>=minSources)
    .map(([key,groups])=>({key,phases:key.split("|"),sourceSupport:groups.length,groupKeys:groups.sort()}))
    .sort((a,b)=>b.sourceSupport-a.sourceSupport||a.key.localeCompare(b.key));
}

export function evidenceManifest(records,rhythms){
  const map=new Map(rhythms.map(r=>[r.id,normalizeRhythm(r)]));
  const valid=records.filter(r=>map.has(r.rhythmId));
  // Intentionally requires explicit user click. Includes pseudonyms, URLs and
  // titles, but no media, transcripts or freeform notes.
  return {
    kind:"ComedyAtlasEvidenceManifest",schemaVersion:1,generatedAt:new Date().toISOString(),
    caveat:"Self-reported labels and rights claims are not verified. Structural comparison is not humor quality.",
    summary:evidenceSummary(records,rhythms),
    records:valid.map(r=>({
      id:r.id,rhythmId:r.rhythmId,groupKey:r.groupKey,sourceTitle:r.sourceTitle,sourceUrl:r.sourceUrl,
      annotator:r.annotator,confidence:r.confidence,reviewStatus:r.reviewStatus,rightsStatus:r.rightsStatus,
      pattern:extractPattern(map.get(r.rhythmId))
    }))
  };
}
