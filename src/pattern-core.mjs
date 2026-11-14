import {normalizeRhythm, buildTimingRows, PHASES, originalDemo} from "./rhythm-core.mjs";

export const PATTERN_VERSION = 1;
export const ENERGY_BINS = 12;
export const PHASE_IDS = PHASES.map(phase => phase.id);
export const COMPONENT_WEIGHTS = Object.freeze({
  phases: 0.30, transitions: 0.25, energy: 0.20, pauses: 0.15, payoff: 0.10
});
const PHASE_INDEX = new Map(PHASE_IDS.map((id,index)=>[id,index]));

const clamp01 = n => Math.max(0,Math.min(1,n));
const round4 = n => Math.round(n*10000)/10000;

function segmentOverlap(a,b){return Math.max(0,Math.min(a.end,b.end)-Math.max(a.start,b.start));}
function normalizeBuckets(buckets,total){
  return total > 0 ? buckets.map(x=>x/total) : buckets.map(()=>0);
}
function featureCurve(rows,total,predicate,extractor){
  const bins=new Array(ENERGY_BINS).fill(0);
  if(total<=0)return bins;
  for(let index=0;index<ENERGY_BINS;index++){
    const start=total*index/ENERGY_BINS;
    const end=total*(index+1)/ENERGY_BINS;
    for(const row of rows){
      if(!predicate(row))continue;
      bins[index]+=segmentOverlap({start,end},row)*extractor(row)/(end-start);
    }
  }
  return bins.map(round4);
}

export function extractPattern(sequence){
  const valid=normalizeRhythm(sequence);
  // Avoid the rounded start/end provided for display by buildTimingRows:
  // all internal calculations use the original decimal durations.
  let offset=0;
  const rows=valid.segments.map(segment=>{
    const start=offset;offset+=segment.duration;
    return {...segment,start,end:offset};
  });
  const total=offset;
  const durations=PHASE_IDS.map(phase=>rows.filter(s=>s.phase===phase).reduce((sum,s)=>sum+s.duration,0));
  const phaseShares=normalizeBuckets(durations,total).map(round4);
  const energyCurve=featureCurve(rows,total,()=>true,r=>r.energy/5);
  const silenceCurve=featureCurve(rows,total,r=>r.phase==="silence",()=>1);
  const payoffCurve=featureCurve(rows,total,r=>r.phase==="payoff",()=>1);
  const payoffPositions=rows.filter(r=>r.phase==="payoff").map(r=>round4(r.start/total));
  const phaseSequence=valid.segments.map(s=>s.phase);
  const transitions=[];
  for(let i=0;i<phaseSequence.length-1;i++)transitions.push(phaseSequence[i]+" → "+phaseSequence[i+1]);
  const meanEnergy=rows.reduce((sum,s)=>sum+s.duration*s.energy,0)/(5*total);
  return {
    id: valid.id, title:valid.title, referenceLabel:valid.referenceLabel,
    totalSeconds:round4(total), segmentCount:rows.length,
    phaseSequence, phaseShares, energyCurve, silenceCurve, payoffCurve, payoffPositions,
    meanEnergy:round4(meanEnergy), transitions
  };
}

function distributionSimilarity(a,b){
  if(a.length!==b.length)throw Error("Feature dimensions do not match.");
  return clamp01(1-a.reduce((sum,value,index)=>sum+Math.abs(value-b[index]),0)/2);
}
function curveSimilarity(a,b){
  if(a.length!==b.length)throw Error("Feature dimensions do not match.");
  return clamp01(1-a.reduce((sum,value,index)=>sum+Math.abs(value-b[index]),0)/a.length);
}
function transitionSimilarity(a,b){
  if(!a.length && !b.length)return 1;
  const aa=new Map(), bb=new Map();
  for(const value of a)aa.set(value,(aa.get(value)||0)+1);
  for(const value of b)bb.set(value,(bb.get(value)||0)+1);
  const keys=new Set([...aa.keys(),...bb.keys()]);
  let intersection=0,union=0;
  for(const key of keys){
    intersection+=Math.min(aa.get(key)||0,bb.get(key)||0);
    union+=Math.max(aa.get(key)||0,bb.get(key)||0);
  }
  return union===0?1:intersection/union;
}
function payoffSimilarity(a,b){
  if(!a.length && !b.length)return 1;
  if(!a.length || !b.length)return 0;
  // Position comparison is symmetric and intentionally independent of
  // absolute recording length. Penalize missing/mismatched payoff counts.
  const positions=(source,target)=>source.reduce((sum,pos)=>
    sum+Math.min(...target.map(other=>Math.abs(pos-other))),0)/source.length;
  const distance=(positions(a,b)+positions(b,a))/2;
  const countPenalty=Math.min(a.length,b.length)/Math.max(a.length,b.length);
  return clamp01((1-distance)*countPenalty);
}
export function comparePatterns(a,b){
  const left=extractPattern(a),right=extractPattern(b);
  const components={
    phases:distributionSimilarity(left.phaseShares,right.phaseShares),
    transitions:transitionSimilarity(left.transitions,right.transitions),
    energy:curveSimilarity(left.energyCurve,right.energyCurve),
    pauses:curveSimilarity(left.silenceCurve,right.silenceCurve),
    payoff:payoffSimilarity(left.payoffPositions,right.payoffPositions)
  };
  const weighted=Object.keys(COMPONENT_WEIGHTS).reduce(
    (sum,key)=>sum+components[key]*COMPONENT_WEIGHTS[key],0
  );
  return {
    score:Math.round(clamp01(weighted)*100),
    components:Object.fromEntries(Object.entries(components).map(([key,val])=>[key,Math.round(val*100)])),
    left,right,
    durationRatio:round4(Math.min(left.totalSeconds,right.totalSeconds)/Math.max(left.totalSeconds,right.totalSeconds)),
    methodology:"Deterministic normalized phase, transition, energy, silence-position and payoff-position comparison; not humor quality."
  };
}
export function nearestPatterns(target,sequences,limit=5){
  if(!Number.isInteger(limit)||limit<0||limit>60)throw Error("Invalid result limit.");
  return sequences.filter(s=>s.id!==target.id).map(sequence=>{
    const comparison=comparePatterns(target,sequence);
    return {id:sequence.id,title:sequence.title,score:comparison.score,components:comparison.components};
  }).sort((a,b)=>b.score-a.score||a.title.localeCompare(b.title)||a.id.localeCompare(b.id))
    .slice(0,limit);
}
export function mineMotifs(sequences,{length=2,minSupport=2}={}){
  if(![2,3].includes(length))throw Error("Motifs must have 2 or 3 phases.");
  if(!Number.isInteger(minSupport)||minSupport<2||minSupport>60)throw Error("Motif support must be 2–60 distinct sequences.");
  const occurrences=new Map();
  for(const raw of sequences){
    const sequence=normalizeRhythm(raw);
    const phases=sequence.segments.map(s=>s.phase);
    const local=new Set();
    for(let i=0;i<=phases.length-length;i++){
      const parts=phases.slice(i,i+length);
      const key=parts.join("|");
      local.add(key);
    }
    for(const key of local){
      if(!occurrences.has(key))occurrences.set(key,[]);
      occurrences.get(key).push({id:sequence.id,title:sequence.title});
    }
  }
  return [...occurrences.entries()].filter(([_,sources])=>sources.length>=minSupport)
    .map(([key,sources])=>({
      key,phases:key.split("|"),support:sources.length,
      sourceIds:sources.map(s=>s.id),sourceTitles:sources.map(s=>s.title)
    }))
    .sort((a,b)=>b.support-a.support||a.key.localeCompare(b.key));
}
export function extractCohortReport(sequences,cohort="personal"){
  if(!["personal","example"].includes(cohort))throw Error("Unsupported cohort.");
  const ids=new Set();
  const patterns=sequences.map(sequence=>{
    const entry=extractPattern(sequence);
    if(ids.has(entry.id))throw Error("Duplicate sequence identifiers.");
    ids.add(entry.id);
    return entry;
  });
  return {
    kind:"ComedyAtlasPatternFeatures",schemaVersion:PATTERN_VERSION,
    cohort,generatedAt:new Date().toISOString(),
    methodology:{weights:COMPONENT_WEIGHTS,energyBins:ENERGY_BINS,phases:PHASE_IDS},
    privacy:"Derived human annotations only; no source audio, transcript, or free-text segment notes included. Sequence titles and reference labels are included.",
    patterns
  };
}

function demoSequence(id,title,steps){
  const example=originalDemo();
  return normalizeRhythm({
    ...example,id,title,referenceId:"",referenceLabel:"Original fictional demonstration",
    segments:steps.map(([phase,duration,energy],i)=>({
      id:"segment-pattern"+id.slice(-2)+"-"+String(i).padStart(4,"0"),phase,duration,energy,note:""
    }))
  });
}
// These original synthetic examples are intentionally separate from personal
// notes and must NEVER be silently saved into the user's Rhythm notebook.
export function originalPatternExamples(){
  return [
    demoSequence("rhythm-pattern-demo01","The Last-Second Pause",[
      ["setup",4,2],["tension",3,3],["silence",2.5,0],["escalation",3,4],["payoff",1,5],["release",2.5,1]
    ]),
    demoSequence("rhythm-pattern-demo02","The Longer Wait",[
      ["setup",3,2],["tension",4,3],["silence",3,0],["escalation",2,4],["payoff",1,5],["release",3,1]
    ]),
    demoSequence("rhythm-pattern-demo03","The Escalation Stack",[
      ["setup",2,2],["escalation",1,3],["escalation",2,4],["tension",2,4],["escalation",3,5],["payoff",1,5],["release",2,1]
    ]),
    demoSequence("rhythm-pattern-demo04","The Callback Ladder",[
      ["setup",2,2],["payoff",1,4],["setup",2,2],["tension",2,3],["payoff",1,5],["release",2,1]
    ])
  ];
}
