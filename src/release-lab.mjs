import {escapeHtml} from "./core.mjs";
import {parseRhythms,RHYTHM_KEY} from "./rhythm-core.mjs";
import {parseEvidence,EVIDENCE_KEY} from "./evidence-core.mjs";
import {syntheticLearningCohort} from "./learning-core.mjs";
import {
  RELEASE_REVIEW_KEY,MAX_RELEASE_IMPORT_BYTES,
  normalizeReleaseReview,serializeReleaseReviews,parseReleaseReviews,mergeReleaseReviews,
  syntheticReleaseReviews,auditResearchRelease,runFamilyHoldoutBenchmark,exportFamilyBenchmark
} from "./release-core.mjs";

const $=id=>document.getElementById(id);
const h=value=>escapeHtml(value??"");
const synthetic=syntheticLearningCohort();
const syntheticReviews=syntheticReleaseReviews();
function download(name,contents){
  const link=document.createElement("a");
  const url=URL.createObjectURL(new Blob([contents],{type:"application/json"}));
  link.href=url;link.download=name;document.body.appendChild(link);link.click();link.remove();
  setTimeout(()=>URL.revokeObjectURL(url),4000);
}
export function mountReleaseWorkbench(){
  let reviews=[],records=[],rhythms=[],audit=null,benchmark=null;
  let storageLocked=false,storageCorrupt=null,dataReadable=true;
  const status=$("release-status");
  const selection=$("release-source");
  const cohortInput=$("release-cohort");
  const form=$("release-form");
  const announce=(message,error=false)=>{status.textContent=message;status.dataset.error=String(error);};
  const activeReviews=()=>cohortInput.value==="synthetic"?syntheticReviews:reviews;
  function loadReviewData(){
    try{
      const raw=localStorage.getItem(RELEASE_REVIEW_KEY);
      reviews=raw===null?[]:parseReleaseReviews(raw);
      storageLocked=false;storageCorrupt=null;
    }catch(err){
      storageLocked=true;
      try{storageCorrupt=localStorage.getItem(RELEASE_REVIEW_KEY);}catch{}
      announce("Stored review ledger is unreadable and protected from overwrite: "+err.message,true);
    }
  }
  function loadSourceData(){
    benchmark=null;
    if(cohortInput.value==="synthetic"){
      records=synthetic.evidence;rhythms=synthetic.rhythms;dataReadable=true;
      return;
    }
    try{
      const savedRhythms=localStorage.getItem(RHYTHM_KEY);
      const nextRhythms=savedRhythms===null?[]:parseRhythms(savedRhythms);
      const savedEvidence=localStorage.getItem(EVIDENCE_KEY);
      const nextEvidence=savedEvidence===null?[]:parseEvidence(savedEvidence,new Set(nextRhythms.map(r=>r.id)),{allowOrphans:true});
      rhythms=nextRhythms;records=nextEvidence;dataReadable=true;
    }catch(error){
      dataReadable=false;rhythms=[];records=[];
      announce("Cannot validate saved Evidence/Rhythm notebooks: "+error.message+". No data was overwritten.",true);
    }
  }
  function currentReview(){
    return activeReviews().find(r=>r.groupKey===selection.value);
  }
  function renderReviewEditor(){
    const personal=cohortInput.value==="personal";
    const selected=selection.value;
    const current=currentReview();
    $("release-family").value=current?.familyKey||"";
    $("release-state").value=current?.status||"needs-review";
    $("release-origin").value=current?.origin||"unknown";
    $("release-reviewer").value=current?.reviewer||$("release-reviewer").value||"";
    $("release-note").value=current?.note||"";
    $("release-add").disabled=!personal||storageLocked||!dataReadable||!selected;
    $("release-delete").disabled=!personal||storageLocked||!current;
    $("release-form-info").textContent=personal
      ?"Decision for source group: "+(selected||"none")+"; notes are saved locally, not verified by an independent reviewer."
      :"Synthetic examples are read-only and auto-grouped into four original pattern families.";
    for(const control of form.querySelectorAll("input,textarea,select"))control.disabled=!personal||storageLocked||!dataReadable||!selected;
    $("release-add").disabled=!personal||storageLocked||!dataReadable||!selected;
    $("release-delete").disabled=!personal||storageLocked||!current;
    $("release-source").disabled=!dataReadable||!audit?.inventory.length;
  }
  function renderSelections(){
    const old=selection.value;
    selection.replaceChildren();
    const candidates=audit?.inventory||[];
    for(const item of candidates){
      const option=document.createElement("option");
      option.value=item.groupKey;
      option.textContent=item.groupKey+" · "+item.reviewStatus;
      selection.appendChild(option);
    }
    if(candidates.some(i=>i.groupKey===old))selection.value=old;
    renderReviewEditor();
  }
  function renderMetrics(){
    const items=[
      ["Review decisions",audit.reviewCount],
      ["Accepted sources",audit.acceptedSources],
      ["Source families",audit.acceptedFamilies],
      ["Blocked sources",audit.rejectedSources],
      ["Missing decisions",audit.missingReviewCount],
      ["Duplicate-source conflicts",audit.duplicateSourceConflicts]
    ];
    $("release-metrics").innerHTML=items.map(([label,value])=>
      '<div><strong>'+h(String(value))+'</strong><span>'+h(label)+'</span></div>').join("");
    const checklist=$("release-checklist");
    checklist.replaceChildren();
    const checks=[
      [audit.acceptedSources>=6,"At least six manually screened source groups"],
      [audit.acceptedFamilies>=3,"At least three labeled source families"],
      [audit.duplicateSourceConflicts===0,"No cross-key source collisions detected"],
      [audit.orphanEvidenceExcluded===0,"No orphaned Evidence/Rhythm references"],
      [audit.draftsExcluded===0,"No unreviewed Evidence annotations excluded"]
    ];
    for(const [passed,label] of checks){
      const li=document.createElement("li");
      li.textContent=(passed?"✓ ":"○ ")+label;checklist.append(li);
    }
    $("release-readiness").textContent=audit.familyBenchmarkPossible
      ?"Local family-heldout experiment is possible. This does not verify source rights, identity or scientific benchmark quality."
      :"Family-heldout preview requires at least six approved eligible sources across three different source families.";
    $("release-exclusions").innerHTML=audit.inventory.filter(item=>item.reasons.length)
      .slice(0,25).map(item=>
        '<li><strong>'+h(item.groupKey)+'</strong> · '+h(item.reasons.join("; "))+'</li>').join("")
      ||'<li>No blocked sources under the current self-reported screening rules.</li>';
    $("release-count").textContent=audit.reviewCount+" saved decisions; "+audit.orphanReviewCount+" disconnected review(s).";
    $("release-benchmark-run").disabled=!dataReadable||!audit.familyBenchmarkPossible;
    $("release-export-results").disabled=!benchmark;
  }
  function renderBenchmark(){
    const container=$("release-results");
    container.hidden=!benchmark;
    if(!benchmark)return;
    $("release-gain").textContent=benchmark.meanLogLossGain.toFixed(3);
    $("release-win-count").textContent=benchmark.learnedBetterLossFolds+" of "+benchmark.totalFolds+" families";
    $("release-gain-note").textContent="Positive average gain means lower log-loss for the learned phase predictor; each family contributes equally.";
    const target=$("release-folds");
    target.replaceChildren();
    for(const fold of benchmark.folds){
      const row=document.createElement("tr");
      const cells=[
        fold.familyKey,
        String(fold.trainFamilies),String(fold.testSources),String(fold.selectedAlpha),
        fold.baselineLogLoss.toFixed(3),fold.learnedLogLoss.toFixed(3),
        (fold.logLossGain>0?"+":"")+fold.logLossGain.toFixed(3)
      ];
      for(const content of cells){
        const cell=document.createElement("td");cell.textContent=content;row.append(cell);
      }
      target.append(row);
    }
  }
  function render(){
    benchmark=null;
    if(!dataReadable){
      audit=null;
      $("release-benchmark-run").disabled=true;
      $("release-export-results").disabled=true;
      $("release-results").hidden=true;
      return;
    }
    try{
      audit=auditResearchRelease(records,rhythms,activeReviews(),{cohort:cohortInput.value});
      renderSelections();
      renderMetrics();
      renderBenchmark();
    }catch(error){
      audit=null;dataReadable=false;
      $("release-benchmark-run").disabled=true;
      announce("Review audit failed: "+error.message,true);
    }
    $("release-recovery").hidden=!storageLocked;
    $("release-import").disabled=storageLocked;
    $("release-export-ledger").disabled=storageLocked;
  }
  function persist(next,message){
    if(storageLocked)return announce("Stored ledger locked; recover first.",true);
    try{
      localStorage.setItem(RELEASE_REVIEW_KEY,serializeReleaseReviews(next));
      reviews=next;
      render();
      announce(message);
    }catch(error){announce("Could not persist review decision: "+error.message+". Existing notebook was not replaced.",true);}
  }
  cohortInput.addEventListener("change",()=>{
    loadSourceData();
    render();
    if(dataReadable)announce(cohortInput.value==="synthetic"
      ?"Showing four fictional pattern families. No synthetic reviews were saved to your personal ledger."
      :"Showing locally saved annotations, subject to your own review decisions.");
  });
  selection.addEventListener("change",()=>{
    $("release-family").value="";
    $("release-reviewer").value="";
    renderReviewEditor();
  });
  form.addEventListener("submit",event=>{
    event.preventDefault();
    if(cohortInput.value!=="personal"||storageLocked||!selection.value)return;
    try{
      const review=normalizeReleaseReview({
        groupKey:selection.value,familyKey:$("release-family").value,
        reviewer:$("release-reviewer").value,status:$("release-state").value,
        origin:$("release-origin").value,note:$("release-note").value,
        updatedAt:new Date().toISOString()
      });
      // Editing a decision is explicit; never infer independent authorization.
      persist(mergeReleaseReviews(reviews.filter(r=>r.groupKey!==review.groupKey),[review]),
        "Review decision saved locally. This is not independent rights verification.");
    }catch(error){announce(error.message,true);}
  });
  $("release-delete").addEventListener("click",()=>{
    if(!currentReview()||cohortInput.value!=="personal")return;
    if(!window.confirm("Remove this locally saved source-family review? The Evidence/Rhythm notebook will remain unchanged."))return;
    persist(reviews.filter(r=>r.groupKey!==selection.value),"Removed local review decision.");
  });
  $("release-refresh").addEventListener("click",()=>{
    loadSourceData();render();
    if(dataReadable)announce("Review inventory refreshed from local notebooks.");
  });
  $("release-benchmark-run").addEventListener("click",()=>{
    try{
      benchmark=runFamilyHoldoutBenchmark(audit);
      renderBenchmark();
      $("release-export-results").disabled=false;
      announce("Completed nested leave-one-family-out evaluation. No audio or other notebook data was uploaded.");
    }catch(error){announce("Benchmark unavailable: "+error.message,true);}
  });
  $("release-export-results").addEventListener("click",()=>{
    if(!benchmark)return;
    if(!window.confirm("Export numerical family-level results? These are NOT rights-verified scientific benchmark results."))return;
    download("comedyatlas-family-benchmark.json",JSON.stringify(exportFamilyBenchmark(benchmark),null,2)+"\n");
    announce("Aggregate report downloaded without source or family names.");
  });
  $("release-export-ledger").addEventListener("click",()=>{
    if(storageLocked)return;
    download("comedyatlas-source-family-reviews.json",serializeReleaseReviews(reviews));
    announce("Full review ledger exported, including reviewer aliases and free-text notes. Inspect before sharing.");
  });
  $("release-import").addEventListener("change",async event=>{
    const input=event.currentTarget,file=input.files?.[0];
    if(!file||storageLocked)return;
    try{
      if(file.size>MAX_RELEASE_IMPORT_BYTES)throw Error("File exceeds 1 MB.");
      const imported=parseReleaseReviews(await file.text());
      const before=reviews.length;
      const merged=mergeReleaseReviews(reviews,imported);
      persist(merged,(merged.length-before)+" new review decisions imported. Existing decisions preserved.");
    }catch(error){announce("Import rejected without changing your saved reviews: "+error.message,true);}
    finally{input.value="";}
  });
  $("release-recovery").addEventListener("click",()=>{
    if(!storageLocked)return;
    if(storageCorrupt!==null)download("comedyatlas-corrupt-review-backup.json",storageCorrupt);
    if(!window.confirm("A raw backup was prepared. Reset the unreadable local review ledger?"))return;
    try{
      localStorage.removeItem(RELEASE_REVIEW_KEY);
      reviews=[];storageLocked=false;storageCorrupt=null;
      render();announce("Corrupt ledger reset after raw backup was prepared.");
    }catch(err){announce("Storage reset failed: "+err.message,true);}
  });
  const invalidate=()=>{
    if(cohortInput.value!=="personal")return;
    loadSourceData();render();
  };
  document.addEventListener("comedyatlas:evidence-updated",invalidate);
  document.addEventListener("comedyatlas:rhythms-updated",invalidate);
  window.addEventListener("storage",event=>{
    if(event.key===RHYTHM_KEY||event.key===EVIDENCE_KEY)invalidate();
    if(event.key===RELEASE_REVIEW_KEY){
      loadReviewData();render();
    }
  });
  loadReviewData();
  loadSourceData();
  render();
  if(!storageLocked&&dataReadable)announce("Review desk ready. Source-family labels and permission claims are self-reported.");
}
