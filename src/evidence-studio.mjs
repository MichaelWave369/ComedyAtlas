import {escapeHtml} from "./core.mjs";
import {parseRhythms,RHYTHM_KEY,PHASES} from "./rhythm-core.mjs";
import {
  EVIDENCE_KEY,MAX_EVIDENCE,MAX_EVIDENCE_BYTES,normalizeEvidence,
  parseEvidence,serializeEvidence,mergeEvidence,evidenceSummary,
  sourceAwareMotifs,evidenceManifest
} from "./evidence-core.mjs";

const $=id=>document.getElementById(id);
const h=value=>escapeHtml(value??"");
const PHASE_NAMES=Object.fromEntries(PHASES.map(phase=>[phase.id,phase.name]));
const CHECKS=[
  ["threeReviewedSources","At least 3 distinct source groups with reviewed annotations"],
  ["twoAnnotators","At least 2 distinct annotator pseudonyms"],
  ["twoDoubleCodedSources","At least 2 source groups annotated by different people"],
  ["threeRightsClaims","At least 3 source groups with self-reported permission claims"],
  ["noOrphans","All linked rhythms are still available"]
];
function localId(){
  if(globalThis.crypto?.randomUUID)return "evidence-"+crypto.randomUUID();
  return "evidence-"+Date.now().toString(36)+"-"+Math.random().toString(36).slice(2,12);
}
function download(name,contents,type="application/json"){
  const url=URL.createObjectURL(new Blob([contents],{type}));
  const a=document.createElement("a");a.href=url;a.download=name;
  document.body.appendChild(a);a.click();a.remove();
  setTimeout(()=>URL.revokeObjectURL(url),3000);
}
export function mountEvidenceWorkbench(){
  let records=[];
  let rhythms=[];
  let storageLocked=false;
  let rhythmsReadable=true;
  let lastBrokenText=null;
  const status=$("evidence-status");
  const form=$("evidence-form");
  const select=$("evidence-rhythm");
  const announce=(message,error=false)=>{status.textContent=message;status.dataset.error=String(error);};
  const rhythmMap=()=>new Map(rhythms.map(x=>[x.id,x]));
  const known=()=>new Set(rhythms.map(x=>x.id));
  function renderRhythmSelect(){
    const old=select.value;
    select.replaceChildren();
    for(const rhythm of rhythms){
      const option=document.createElement("option");
      option.value=rhythm.id;
      option.textContent=rhythm.title;
      select.appendChild(option);
    }
    select.disabled=!rhythms.length;
    if(rhythms.some(r=>r.id===old))select.value=old;
    $("evidence-add").disabled=storageLocked||!rhythmsReadable||!rhythms.length||records.length>=MAX_EVIDENCE;
    $("evidence-unlock").hidden=!storageLocked;
  }
  function renderRecords(){
    $("evidence-count").textContent=records.length+" / "+MAX_EVIDENCE+" recorded links";
    const map=rhythmMap();
    $("evidence-cards").innerHTML=records.length?records.map(r=>{
      const rhythm=map.get(r.rhythmId);
      return '<article class="evidence-record"><div><span class="micro-label">'+h(r.reviewStatus)+' · '+h(r.confidence)+' confidence · '+h(r.rightsStatus)+'</span>'
        +'<h4>'+h(r.sourceTitle)+'</h4>'
        +'<p><strong>Source group:</strong> '+h(r.groupKey)+' · <strong>Annotator:</strong> '+h(r.annotator)+'</p>'
        +'<p><strong>Timeline:</strong> '+h(rhythm?.title||"Missing saved timeline (orphaned)")+'</p>'
        +(r.sourceUrl?'<p><a href="'+h(r.sourceUrl)+'" rel="noopener noreferrer" target="_blank">Source reference ↗</a></p>':"")
        +(r.note?'<p>'+h(r.note)+'</p>':"")
        +'</div><button type="button" class="danger-button" data-evidence-id="'+h(r.id)+'" aria-label="Delete link for '+h(r.sourceTitle)+'">Delete</button></article>';
    }).join(""):'<p class="empty">No evidence records yet. Save a Rhythm Engine timeline and link it to a documented source here.</p>';
  }
  function renderStats(){
    const result=evidenceSummary(records,rhythms);
    const stats=[
      [result.totalRecords,"Total evidence links"],
      [result.sourceGroups,"Reviewed source groups"],
      [result.distinctAnnotators,"Annotator pseudonyms"],
      [result.doubleCodedSources,"Double-coded groups"],
      [result.averageStructuralAgreement===null?"—":result.averageStructuralAgreement+"%","Mean structural annotation agreement"]
    ];
    $("evidence-stats").innerHTML=stats.map(([value,label])=>
      '<div><strong>'+h(value)+'</strong><span>'+h(label)+'</span></div>').join("");
    $("evidence-checks").innerHTML=CHECKS.map(([key,label])=>
      '<li><span aria-hidden="true">'+(result.checks[key]?"✓":"○")+'</span> '+h(label)+'</li>').join("");
    $("evidence-conclusion").textContent=result.pilotReviewChecklistComplete
      ?"Basic self-reported pilot-review checklist complete. This does NOT verify sources, copyright permission, independence, annotator identity, or eligibility for training. Independent human audit is still required."
      :"Not enough reviewed and independently labeled records for even a preliminary dataset audit. No claim of learning readiness is made.";
    const items=sourceAwareMotifs(records,rhythms,{
      length:Number($("evidence-motif-length").value),
      minSources:Number($("evidence-min-sources").value)
    });
    $("evidence-motifs").innerHTML=items.length?items.slice(0,10).map(m=>
      '<article class="pattern-motif"><strong>'+h(m.phases.map(id=>PHASE_NAMES[id]).join(" → "))+'</strong>'
      +'<span class="pattern-support">'+m.sourceSupport+' distinct reviewed source groups</span>'
      +'<p>'+h(m.groupKeys.join(" · "))+'</p></article>'
    ).join(""):'<p class="fine-print">No motifs meet the selected independent-source support threshold.</p>';
    $("evidence-summary-note").textContent=
      result.orphanRecords+" orphaned links excluded; "+result.reviewedRecords+
      " reviewed links, "+result.draftRecords+" drafts. "+
      result.agreementPairs+" cross-annotator pair(s). Similarity here is measured timing-annotation resemblance, not reviewer accuracy or audience enjoyment.";
  }
  function render(){
    renderRhythmSelect();
    renderRecords();
    renderStats();
  }
  function commit(next,message){
    if(storageLocked){announce("Evidence storage is locked due to invalid saved data. Recover the old data before saving.",true);return;}
    records=next;
    try{
      localStorage.setItem(EVIDENCE_KEY,serializeEvidence(records));
      announce(message);
    }catch(error){
      announce("Browser storage failed; data only exists in this tab. Export a backup before leaving. "+error.message,true);
    }
    render();
  }
  function readRhythms(notify=false){
    try{
      const raw=localStorage.getItem(RHYTHM_KEY);
      rhythms=raw===null?[]:parseRhythms(raw);
      rhythmsReadable=true;
      if(notify)announce("Loaded "+rhythms.length+" saved rhythm timeline(s).");
    }catch(error){
      rhythmsReadable=false;
      rhythms=[];
      announce("Could not read saved Rhythm Engine timelines: "+error.message+". Existing evidence was not modified.",true);
    }
    render();
  }
  // A corrupt stored notebook is NOT silently overwritten by the next form submit.
  try{
    const raw=localStorage.getItem(EVIDENCE_KEY);
    records=raw===null?[]:parseEvidence(raw,new Set(),{allowOrphans:true});
    announce("Evidence links are local to this browser. Source independence and rights status are self-reported.");
  }catch(error){
    storageLocked=true;
    try{lastBrokenText=localStorage.getItem(EVIDENCE_KEY);}catch{}
    announce("Stored evidence could not be parsed and is protected from overwrite: "+error.message+". Use the recovery control.",true);
  }
  readRhythms(false);
  form.addEventListener("submit",event=>{
    event.preventDefault();
    if(storageLocked||!rhythmsReadable)return;
    try{
      const raw={
        id:localId(),rhythmId:select.value,
        groupKey:$("evidence-group").value,sourceTitle:$("evidence-title").value,
        sourceUrl:$("evidence-url").value,annotator:$("evidence-annotator").value,
        confidence:$("evidence-confidence").value,
        reviewStatus:$("evidence-review").value,rightsStatus:$("evidence-rights").value,
        note:$("evidence-note").value,createdAt:new Date().toISOString()
      };
      const record=normalizeEvidence(raw,known());
      commit(mergeEvidence(records,[record]),"Evidence link added locally. Claims have not been externally verified.");
      const alias=$("evidence-annotator").value;
      form.reset();
      $("evidence-annotator").value=alias;
    }catch(error){announce(error.message,true);}
  });
  $("evidence-cards").addEventListener("click",event=>{
    const button=event.target.closest("button[data-evidence-id]");
    if(!button||storageLocked)return;
    if(!window.confirm("Remove this evidence link from your local notebook? Export first if you need a backup."))return;
    commit(records.filter(r=>r.id!==button.dataset.evidenceId),"Local link deleted.");
  });
  for(const id of ["evidence-motif-length","evidence-min-sources"])
    $(id).addEventListener("change",renderStats);
  $("evidence-refresh").addEventListener("click",()=>readRhythms(true));
  $("evidence-export").addEventListener("click",()=>{
    if(storageLocked){announce("Use recovery to export the unreadable raw backup; normal export is unavailable.",true);return;}
    download("comedyatlas-evidence-notebook.json",serializeEvidence(records));
    announce("Full evidence notebook exported. Review URLs, pseudonyms and notes before sharing.");
  });
  $("evidence-manifest").addEventListener("click",()=>{
    if(storageLocked||!rhythmsReadable)return;
    try{
      download("comedyatlas-evidence-features.json",JSON.stringify(evidenceManifest(records,rhythms),null,2)+"\n");
      announce("Derived feature manifest exported. It includes source URLs, titles and pseudonyms, but no recordings or transcriptions.");
    }catch(error){announce(error.message,true);}
  });
  $("evidence-import").addEventListener("change",async event=>{
    const input=event.currentTarget;
    const file=input.files?.[0];
    if(!file||storageLocked)return;
    try{
      if(file.size>MAX_EVIDENCE_BYTES)throw Error("Backup is larger than 1 MB.");
      const incoming=parseEvidence(await file.text(),known(),{allowOrphans:true});
      const next=mergeEvidence(records,incoming);
      commit(next,(next.length-records.length)+" evidence link(s) added. Orphaned links are retained until their rhythms are imported.");
    }catch(error){
      announce("Import rejected; existing evidence was not changed: "+error.message,true);
    }finally{input.value="";}
  });
  $("evidence-unlock").addEventListener("click",()=>{
    if(!storageLocked)return;
    if(lastBrokenText!==null)download("comedyatlas-corrupt-evidence-backup.txt",lastBrokenText,"text/plain");
    if(!window.confirm("A raw backup download was prepared. Remove the unreadable stored data to start a fresh evidence notebook?"))return;
    try{
      localStorage.removeItem(EVIDENCE_KEY);
      records=[];storageLocked=false;lastBrokenText=null;
      render();announce("Storage reset after preparing raw backup.");
    }catch(error){announce("Could not reset local storage: "+error.message,true);}
  });
  document.addEventListener("comedyatlas:rhythms-updated",()=>readRhythms(false));
  window.addEventListener("storage",event=>{
    if(event.key===RHYTHM_KEY)readRhythms(false);
  });
  return {refresh:()=>readRhythms(false)};
}
