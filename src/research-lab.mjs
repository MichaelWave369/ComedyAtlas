import {escapeHtml} from "./core.mjs";
import {parseRhythms,RHYTHM_KEY} from "./rhythm-core.mjs";
import {parseEvidence,EVIDENCE_KEY} from "./evidence-core.mjs";
import {
  planResearchSplits,listReviewDisagreements,exportResearchPreview,RESEARCH_SPLITS
} from "./research-core.mjs";

const $=id=>document.getElementById(id);
const h=value=>escapeHtml(value??"");
const parts=["train","validation","test"];
const COMPONENTS=[
  ["phases","Phase mix"],["transitions","Phase order"],
  ["energy","Energy contour"],["pauses","Hold placement"],["payoff","Punchline placement"]
];
function downloadJson(name,data){
  const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)+"\n"],{type:"application/json"}));
  const anchor=document.createElement("a");anchor.href=url;anchor.download=name;
  document.body.appendChild(anchor);anchor.click();anchor.remove();
  setTimeout(()=>URL.revokeObjectURL(url),4000);
}
export function mountResearchPipeline(){
  let rhythms=[],evidence=[],plan=null,disagreements=[];
  let inputValid=true;
  const status=$("research-status");
  const announce=(text,error=false)=>{
    status.textContent=text;
    status.dataset.error=String(error);
  };
  function renderCounts(){
    const row=$("research-counts");
    const entries=[
      ["Evidence links",plan.totalEvidence],
      ["Reviewed source groups",plan.groupCount],
      ["Eligible groups",plan.eligibleCount],
      ["Quarantined groups",plan.quarantined.length],
      ["Draft annotations excluded",plan.draftCount],
      ["Orphan links excluded",plan.orphanCount]
    ];
    row.replaceChildren();
    for(const [label,value] of entries){
      const card=document.createElement("div");
      const count=document.createElement("strong");
      count.textContent=String(value);
      const caption=document.createElement("span");
      caption.textContent=label;
      card.append(count,caption);row.appendChild(card);
    }
  }
  function renderSplits(){
    const container=$("research-partitions");
    container.replaceChildren();
    for(const partition of parts){
      const card=document.createElement("article");
      card.className="research-partition";
      const heading=document.createElement("h4");
      heading.textContent=partition[0].toUpperCase()+partition.slice(1);
      const number=document.createElement("strong");
      number.textContent=String(plan.counts[partition]);
      const intro=document.createElement("p");
      intro.className="fine-print";
      intro.textContent=plan.counts.unsplit?"Split withheld: three eligible source groups required.":plan.counts[partition]+" original source group(s)";
      const list=document.createElement("ul");
      list.className="research-group-list";
      for(const key of plan.buckets[partition]){
        const item=document.createElement("li");
        item.textContent=key;
        list.appendChild(item);
      }
      card.append(heading,number,intro,list);
      container.appendChild(card);
    }
    $("research-plan-state").textContent=plan.counts.unsplit
      ?"Dataset partitioning unavailable: fewer than three non-conflicting reviewed original sources."
      :"Deterministic source-group disjoint preview. Changing the seed changes group assignments, not the underlying evidence.";
  }
  function renderWarnings(){
    const warnings=$("research-warnings");
    warnings.replaceChildren();
    for(const warning of plan.warnings){
      const li=document.createElement("li");
      li.textContent=warning;
      warnings.appendChild(li);
    }
    const quarantined=$("research-quarantine");
    quarantined.replaceChildren();
    if(!plan.quarantined.length){
      quarantined.textContent="No detected conflicts between distinct source keys. This does not prove that all sources are independent.";
    }else for(const entry of plan.quarantined){
      const item=document.createElement("p");
      item.textContent=entry.key+": "+entry.reasons.join(", ");
      quarantined.appendChild(item);
    }
    const checks=$("research-checks");
    checks.replaceChildren();
    const labels={
      enoughGroupsToSplit:"At least three non-conflicting reviewed source groups",
      noDuplicateSourceConflicts:"No shared timeline or URL across different source keys",
      noOrphanReferences:"No orphaned timeline links",
      noDrafts:"No excluded draft annotations",
      sourceRightsClaimsComplete:"All selected sources have self-reported permission claims",
      doubleAnnotatedSources:"Two or more source groups have multiple reviewer pseudonyms"
    };
    for(const [key,met] of Object.entries(plan.checks)){
      const li=document.createElement("li");
      li.textContent=(met?"✓ ":"○ ")+(labels[key]||key);
      checks.appendChild(li);
    }
    $("research-checklist-state").textContent=plan.previewChecklistComplete
      ?"Local metadata checklist complete, NOT independently audited or authorized for model training."
      :"Local research checklist incomplete; export is for planning only, never training permission.";
  }
  function renderDisagreements(){
    const container=$("research-disagreements");
    container.replaceChildren();
    if(!disagreements.length){
      const p=document.createElement("p");
      p.className="fine-print";
      p.textContent="No reviewed source group currently has two distinct annotator pseudonyms. Add a separately annotated timeline to an existing source group in Evidence.";
      container.appendChild(p);
      return;
    }
    for(const row of disagreements.slice(0,16)){
      const panel=document.createElement("article");
      panel.className="research-disagreement";
      const head=document.createElement("div");head.className="research-disagreement-head";
      const name=document.createElement("strong");name.textContent=row.groupKey;
      const score=document.createElement("span");score.textContent=row.meanSimilarity+"% mean structural resemblance";
      head.append(name,score);
      const stats=document.createElement("p");
      stats.className="fine-print";
      stats.textContent=row.annotatorCount+" pseudonyms · "+row.pairCount+" unique reviewer pair(s). Different structural scores are not proof anyone is wrong.";
      panel.append(head,stats);
      for(const pair of row.pairs.slice(0,8)){
        const details=document.createElement("details");
        const summary=document.createElement("summary");
        summary.textContent=pair.first+" ↔ "+pair.second+" · "+pair.score+"% structural resemblance";
        const list=document.createElement("ul");
        for(const [key,label] of COMPONENTS){
          const item=document.createElement("li");
          item.textContent=label+": "+pair.components[key]+"% resemblance";
          list.appendChild(item);
        }
        details.append(summary,list);panel.appendChild(details);
      }
      container.appendChild(panel);
    }
  }
  function render(){
    if(!inputValid||!plan)return;
    renderCounts();renderSplits();renderWarnings();renderDisagreements();
    $("research-export").disabled=plan.eligibleCount===0;
    $("research-seed-label").textContent="Seed "+plan.options.seed+" · "+
      plan.options.ratio+" partition";
  }
  function calculate(){
    const options={
      seed:Number($("research-seed").value),
      ratio:$("research-ratio").value
    };
    plan=planResearchSplits(evidence,rhythms,options);
    disagreements=listReviewDisagreements(evidence,rhythms);
    render();
  }
  function refresh(showSuccess=false){
    try{
      const rawRhythms=localStorage.getItem(RHYTHM_KEY);
      const nextRhythms=rawRhythms===null?[]:parseRhythms(rawRhythms);
      const rawEvidence=localStorage.getItem(EVIDENCE_KEY);
      const nextEvidence=rawEvidence===null?[]:parseEvidence(rawEvidence,new Set(nextRhythms.map(s=>s.id)),{allowOrphans:true});
      rhythms=nextRhythms;
      evidence=nextEvidence;
      inputValid=true;
      calculate();
      if(showSuccess)announce("Research preview refreshed from your local Rhythm and Evidence notebooks.");
    }catch(error){
      inputValid=false;
      plan=null;
      $("research-export").disabled=true;
      announce("Could not validate local research data: "+error.message+". Nothing was overwritten. Correct or restore the notebook before exporting.",true);
    }
  }
  $("research-seed").addEventListener("change",()=>{
    try{calculate();announce("Recomputed group-disjoint partitions using the updated seed.");}
    catch(error){announce(error.message,true);}
  });
  $("research-ratio").addEventListener("change",()=>{
    try{calculate();announce("Recomputed source-group split ratios.");}
    catch(error){announce(error.message,true);}
  });
  $("research-refresh").addEventListener("click",()=>refresh(true));
  $("research-export").addEventListener("click",()=>{
    if(!inputValid||!plan||plan.eligibleCount===0)return;
    if(!window.confirm("Export a feature-only RESEARCH PLANNING preview? This is not a verified, licensed training dataset and contains group keys, rhythm IDs, and derived features."))return;
    downloadJson("comedyatlas-research-split-preview.json",exportResearchPreview(plan,disagreements));
    announce("Research preview exported. It does not grant rights or authorization for training.");
  });
  document.addEventListener("comedyatlas:rhythms-updated",()=>refresh(false));
  document.addEventListener("comedyatlas:evidence-updated",()=>refresh(false));
  window.addEventListener("storage",event=>{
    if(event.key===RHYTHM_KEY||event.key===EVIDENCE_KEY)refresh(false);
  });
  refresh(false);
  if(inputValid)announce("Research planning preview ready. All source labels, permissions and annotators are self-reported.");
}
