import {PHASES,normalizeRhythm} from "./rhythm-core.mjs";
import {originalPatternExamples} from "./pattern-core.mjs";
import {planResearchSplits} from "./research-core.mjs";

export const LEARNING_VERSION=1;
export const PHASE_IDS=PHASES.map(p=>p.id);
export const SMOOTHING_OPTIONS=Object.freeze([0.25,0.5,1,2,4]);
const N=PHASE_IDS.length;
const makeCounts=()=>Array.from({length:N},()=>0);
const phaseIndex=phase=>PHASE_IDS.indexOf(phase);
const safeRound=(x,d=3)=>Number(x.toFixed(d));

function validateSequence(sequence){
  if(!Array.isArray(sequence)||sequence.length<2||sequence.length>32||sequence.some(x=>!PHASE_IDS.includes(x)))
    throw Error("A phase sequence must contain 2–32 known phases.");
  return sequence;
}

export function syntheticLearningCohort(){
  // 36 authored, algorithmically varied examples. These are NOT observations of
  // 36 independent human performances. Reused template families are disclosed.
  const templates=originalPatternExamples();
  const rhythms=[],evidence=[];
  for(let i=0;i<36;i++){
    const basis=templates[i%templates.length];
    const rhythmId="rhythm-synthetic-"+String(i).padStart(5,"0");
    const sourceKey="synthetic-performance-"+String(i).padStart(3,"0");
    const templateShift=(i%5)-2;
    const segments=basis.segments.map((s,j)=>({
      ...s,id:"segment-synthetic-"+String(i).padStart(3,"0")+"-"+String(j).padStart(3,"0"),
      duration:Math.max(0.1,Math.round((s.duration+((j+i)%3-1)*0.2)*100)/100),
      energy:Math.max(0,Math.min(5,s.energy+(((j+i)%4===0)?Math.sign(templateShift):0)))
    }));
    // Insert a different occasional legal transition so demo isn't all clones.
    if(i%7===0&&segments.length<32)
      segments.splice(segments.length-1,0,{
        id:"segment-synthetic-extra-"+String(i).padStart(3,"0"),phase:"silence",
        duration:0.5,energy:0,note:""
      });
    const timeline=normalizeRhythm({...basis,id:rhythmId,title:"Original synthetic #"+(i+1),
      referenceLabel:"Generated demonstration, not a recorded performance",segments});
    rhythms.push(timeline);
    evidence.push({
      id:"evidence-synthetic-"+String(i).padStart(5,"0"),
      rhythmId,groupKey:sourceKey,sourceTitle:"Fictional exercise "+(i+1),sourceUrl:"",
      annotator:"synthetic-generator",confidence:"low",reviewStatus:"reviewed",
      rightsStatus:"reference-only",note:"Synthetic data; no human observation.",
      createdAt:"2026-01-01T00:00:00.000Z"
    });
  }
  return {rhythms,evidence,synthetic:true,templateFamilies:templates.length};
}

export function partitionExamples(plan){
  if(!plan||!plan.annotations)throw Error("Valid research partitions required.");
  const seen=new Set();
  const partitions={};
  for(const split of ["train","validation","test"]){
    const entries=plan.annotations[split];
    if(!Array.isArray(entries))throw Error("Missing "+split+" partition.");
    const perGroup=new Map();
    for(const row of entries){
      if(typeof row.groupKey!=="string"||!Array.isArray(row.pattern?.phaseSequence))throw Error("Invalid annotated feature row.");
      // Exactly one deterministic representative per source group. Extra
      // annotators do not become independent votes or amplify that source.
      const previous=perGroup.get(row.groupKey);
      if(!previous||String(row.id).localeCompare(String(previous.id))<0)perGroup.set(row.groupKey,row);
    }
    partitions[split]=[...perGroup.entries()].sort(([a],[b])=>a.localeCompare(b))
      .map(([groupKey,row])=>{
        if(seen.has(groupKey))throw Error("Source group leakage across partitions: "+groupKey);
        seen.add(groupKey);
        return {groupKey,phases:[...validateSequence(row.pattern.phaseSequence)]};
      });
  }
  return partitions;
}

export function transitionExamples(grouped){
  if(!Array.isArray(grouped))throw Error("Group examples required.");
  return grouped.map(item=>{
    if(typeof item.groupKey!=="string"||!item.groupKey)throw Error("Missing source group.");
    const phases=validateSequence(item.phases);
    return {groupKey:item.groupKey,pairs:phases.slice(1).map((next,i)=>({
      previous:phases[i],next
    }))};
  });
}

export function trainTransitionModel(groups,alpha=1){
  if(!SMOOTHING_OPTIONS.includes(alpha))throw Error("Unsupported smoothing strength.");
  const converted=transitionExamples(groups);
  if(converted.length===0)throw Error("Need training source groups.");
  const matrix=Array.from({length:N},makeCounts);
  const global=makeCounts();
  let total=0;
  for(const group of converted)for(const pair of group.pairs){
    matrix[phaseIndex(pair.previous)][phaseIndex(pair.next)]++;
    global[phaseIndex(pair.next)]++;
    total++;
  }
  if(total===0)throw Error("Training needs at least one phase transition.");
  return {
    algorithm:"smoothed-first-order-phase-transition",
    alpha,trainGroups:converted.length,trainTransitions:total,
    matrix,global
  };
}
function normalizeCounts(row,alpha){
  const denominator=row.reduce((sum,n)=>sum+n,0)+alpha*N;
  return row.map(n=>(n+alpha)/denominator);
}
export function predictNextPhase(model,previous){
  const idx=phaseIndex(previous);
  if(idx<0)throw Error("Unknown previous comedy phase.");
  if(!model||!Array.isArray(model.matrix)||!Number.isFinite(model.alpha)||model.alpha<=0)
    throw Error("Trained model required.");
  const row=model.matrix[idx];
  const supported=row.reduce((sum,n)=>sum+n,0)>0;
  const fallback=model.global;
  const probabilities=normalizeCounts(supported?row:fallback,model.alpha);
  return Object.fromEntries(PHASE_IDS.map((phase,i)=>[phase,probabilities[i]]));
}
export function baselineDistribution(model){
  return Object.fromEntries(PHASE_IDS.map((phase,i)=>[
    phase,normalizeCounts(model.global,1)[i]
  ]));
}
function pickBest(distribution){
  return PHASE_IDS.reduce((best,phase)=>distribution[phase]>distribution[best]?phase:best,PHASE_IDS[0]);
}
export function evaluatePhasePrediction(model,groups,algorithm="markov"){
  if(!["markov","majority"].includes(algorithm))throw Error("Unknown comparison algorithm.");
  const converted=transitionExamples(groups);
  if(!converted.length)return null;
  const confusion=Object.fromEntries(PHASE_IDS.map(target=>[
    target,Object.fromEntries(PHASE_IDS.map(pred=>[pred,0]))
  ]));
  const byGroup=[];
  let hits=0,n=0,weightedLoss=0;
  for(const group of converted){
    let groupCorrect=0,groupLoss=0;
    for(const {previous,next} of group.pairs){
      const probabilities=algorithm==="markov"?predictNextPhase(model,previous):baselineDistribution(model);
      const predicted=pickBest(probabilities);
      const hit=Number(predicted===next);
      groupCorrect+=hit;
      groupLoss+=-Math.log(Math.max(1e-12,probabilities[next]));
      confusion[next][predicted]++;
    }
    hits+=groupCorrect;n+=group.pairs.length;weightedLoss+=groupLoss;
    byGroup.push({groupKey:group.groupKey,
      accuracy:groupCorrect/group.pairs.length,
      logLoss:groupLoss/group.pairs.length,transitionCount:group.pairs.length});
  }
  const groupMean=(key)=>byGroup.reduce((sum,item)=>sum+item[key],0)/byGroup.length;
  return {
    algorithm,groups:byGroup.length,transitions:n,
    accuracy:safeRound(hits/n),logLoss:safeRound(weightedLoss/n),
    groupBalancedAccuracy:safeRound(groupMean("accuracy")),
    groupBalancedLogLoss:safeRound(groupMean("logLoss")),
    confusion
  };
}

export function runLearningExperiment(records,rhythms,{seed=369,ratio="default"}={}){
  const plan=planResearchSplits(records,rhythms,{seed,ratio});
  if(plan.eligibleCount<6||plan.counts.train<2||plan.counts.validation<1||plan.counts.test<1)
    throw Error("At least six eligible, non-conflicting reviewed source groups are required for this small experimental evaluation.");
  const partitions=partitionExamples(plan);
  const train=partitions.train,validation=partitions.validation,testGroups=partitions.test;
  const options=SMOOTHING_OPTIONS.map(alpha=>{
    const model=trainTransitionModel(train,alpha);
    const validationResult=evaluatePhasePrediction(model,validation);
    return {alpha,validationGroupLogLoss:validationResult.groupBalancedLogLoss};
  });
  // Model-selection metric is exclusively on validation groups. Test is never
  // used to choose alpha, epoch count, thresholds, or algorithm type.
  const best=[...options].sort((a,b)=>a.validationGroupLogLoss-b.validationGroupLogLoss||a.alpha-b.alpha)[0];
  const model=trainTransitionModel(train,best.alpha);
  return {
    schemaVersion:LEARNING_VERSION,
    task:"Predict the next HUMAN-ANNOTATED phase from the preceding phase.",
    seed,ratio,
    sourceGroups:{
      train:train.length,validation:validation.length,test:testGroups.length,
      quarantined:plan.quarantined.length,draftsExcluded:plan.draftCount,
      orphansExcluded:plan.orphanCount
    },
    smoothingOptions:options,selectedAlpha:best.alpha,
    validation:{
      baseline:evaluatePhasePrediction(model,validation,"majority"),
      learned:evaluatePhasePrediction(model,validation,"markov")
    },
    heldOutTest:{
      baseline:evaluatePhasePrediction(model,testGroups,"majority"),
      learned:evaluatePhasePrediction(model,testGroups,"markov")
    },
    model,
    warnings:[
      "This predicts annotated phase labels, NOT laughter, comedic quality or a joke's effectiveness.",
      "Human-specified source groups, rights claims and annotator identities are unverified.",
      "A fixed baseline and validation-selected Markov model are both reported on the same held-out test groups.",
      "Use strictly original/authorized data before any further training; generated examples are not independent human performances."
    ]
  };
}
export function exportLearningReport(result,cohort){
  if(!["synthetic","personal"].includes(cohort))throw Error("Unknown experiment cohort.");
  const minimal=evaluation=>evaluation&&({
    algorithm:evaluation.algorithm,
    groups:evaluation.groups,transitions:evaluation.transitions,
    accuracy:evaluation.accuracy,logLoss:evaluation.logLoss,
    groupBalancedAccuracy:evaluation.groupBalancedAccuracy,
    groupBalancedLogLoss:evaluation.groupBalancedLogLoss,
    confusion:evaluation.confusion
  });
  return {
    kind:"ComedyAtlasLocalLearningExperiment",schemaVersion:LEARNING_VERSION,
    createdAt:new Date().toISOString(),cohort,
    warning:"Local statistical experiment only; not evidence that a system understands or predicts humor. No media/rights verification.",
    task:result.task,seed:result.seed,ratio:result.ratio,
    sourceGroups:result.sourceGroups,smoothingOptions:result.smoothingOptions,
    selectedAlpha:result.selectedAlpha,
    validation:{baseline:minimal(result.validation.baseline),learned:minimal(result.validation.learned)},
    heldOutTest:{baseline:minimal(result.heldOutTest.baseline),learned:minimal(result.heldOutTest.learned)},
    model:{
      algorithm:result.model.algorithm,
      phases:PHASE_IDS,alpha:result.model.alpha,transitionCounts:result.model.matrix,
      globalCounts:result.model.global
    },
    warnings:result.warnings
  };
}
