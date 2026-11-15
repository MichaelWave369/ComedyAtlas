import {RHYTHM_KEY,parseRhythms} from "./rhythm-core.mjs";
import {EVIDENCE_KEY,parseEvidence} from "./evidence-core.mjs";
import {syntheticLearningCohort} from "./learning-core.mjs";
import {runReliabilityStudy,exportReliabilityStudy} from "./reliability-core.mjs";

const $=id=>document.getElementById(id);
const pct=n=>(n*100).toFixed(1)+"%";
const num=n=>Number(n).toFixed(3);
function downloadReport(report){
  const url=URL.createObjectURL(new Blob([JSON.stringify(report,null,2)+"\n"],{type:"application/json"}));
  const link=document.createElement("a");
  link.href=url;link.download="comedyatlas-reliability-study.json";
  document.body.appendChild(link);link.click();link.remove();
  setTimeout(()=>URL.revokeObjectURL(url),4000);
}
export function mountReliabilityLab(){
  const synthetic=syntheticLearningCohort();
  let result=null,cohort="";
  const status=$("reliability-status"),runButton=$("reliability-run"),exportButton=$("reliability-export");
  const resultsPanel=$("reliability-results");
  const announce=(message,error=false)=>{status.textContent=message;status.dataset.error=String(error);};
  function clear(message){
    result=null;cohort="";
    resultsPanel.hidden=true;
    exportButton.disabled=true;
    announce(message);
  }
  function loadPersonal(){
    const storedRhythms=localStorage.getItem(RHYTHM_KEY);
    const rhythms=storedRhythms===null?[]:parseRhythms(storedRhythms);
    const storedEvidence=localStorage.getItem(EVIDENCE_KEY);
    const evidence=storedEvidence===null?[]:parseEvidence(storedEvidence,new Set(rhythms.map(r=>r.id)),{allowOrphans:true});
    return {rhythms,evidence};
  }
  function statCard(label,value,description){
    const div=document.createElement("div");
    const labelEl=document.createElement("span");labelEl.textContent=label;
    const strong=document.createElement("strong");strong.textContent=value;
    const desc=document.createElement("small");desc.textContent=description;
    div.append(labelEl,strong,desc);
    return div;
  }
  function renderSummary(){
    const s=result.summary,g=result.groupCounts;
    $("reliability-counts").replaceChildren(
      statCard("Eligible source groups",String(g.eligible),"Conflicts quarantined: "+g.quarantined),
      statCard("Distinct holdout partitions",String(g.distinctHoldoutPartitions),result.settings.repeats+" seeded runs"),
      statCard("Sources tested at least once",String(g.distinctSourcesEverTested),g.testCoveragePercent+"% of eligible sources"),
      statCard("Lower-loss runs",s.lowerLogLossRunCount+" / "+result.settings.repeats,
        pct(s.lowerLogLossRunShare)+" of the observed splits")
    );
    $("reliability-effect").textContent=num(s.meanLogLossGain);
    $("reliability-band").textContent=num(s.middle80LogLossGain[0])+" to "+num(s.middle80LogLossGain[1]);
    $("reliability-accuracy").textContent=pct(s.meanAccuracyGain);
    $("reliability-accuracy-band").textContent=pct(s.middle80AccuracyGain[0])+" to "+pct(s.middle80AccuracyGain[1]);
    $("reliability-interpretation").textContent=
      s.meanLogLossGain>0
        ?"The model had lower average test log-loss than the baseline across these sampled splits. This is exploratory, not proof that the benefit generalizes to real comedy."
        :"The model did not outperform the baseline on average test log-loss across these splits. Increasing complexity is not a win by itself.";
  }
  function renderRuns(){
    const tbody=$("reliability-run-rows");
    tbody.replaceChildren();
    for(const run of result.runs){
      const tr=document.createElement("tr");
      const cells=[
        String(run.iteration),String(run.seed),String(run.testGroups),
        String(run.alpha),num(run.baselineLogLoss),num(run.learnedLogLoss),
        (run.logLossGain>=0?"+":"")+num(run.logLossGain),
        run.bootstrap.available
          ?num(run.bootstrap.lower)+" to "+num(run.bootstrap.upper)
          :"Insufficient held-out sources"
      ];
      cells.forEach((label,i)=>{
        const td=document.createElement("td");td.textContent=label;
        if(i===6)td.className=run.logLossGain>0?"reliability-positive":"reliability-negative";
        tr.append(td);
      });
      tbody.append(tr);
    }
  }
  function renderWarnings(){
    const target=$("reliability-warnings");
    target.replaceChildren();
    for(const warning of result.warnings){
      const li=document.createElement("li");li.textContent=warning;target.append(li);
    }
    $("reliability-demo-note").textContent=cohort==="synthetic"
      ?"Synthetic examples come from only four reused template families. These seeded source IDs are not independent human jokes, and the study cannot establish generalization to real material."
      :"Your source IDs, permission claims and reviewer pseudonyms are self-reported. A repeated split diagnostic cannot verify independent sources or authorize training.";
  }
  function render(){
    if(!result)return;
    resultsPanel.hidden=false;
    exportButton.disabled=false;
    renderSummary();renderRuns();renderWarnings();
    announce("Completed "+result.settings.repeats+" local seeded comparisons. No audio or notebook data was uploaded.");
  }
  runButton.addEventListener("click",()=>{
    clear("Computing repeated splits locally…");
    runButton.disabled=true;
    try{
      cohort=$("reliability-cohort").value;
      const data=cohort==="synthetic"?synthetic:loadPersonal();
      result=runReliabilityStudy(data.evidence,data.rhythms,{
        seed:Number($("reliability-seed").value),
        ratio:$("reliability-ratio").value,
        repeats:Number($("reliability-repeats").value)
      });
      render();
    }catch(error){
      clear("Reliability study unavailable: "+error.message);
      status.dataset.error="true";
    }finally{runButton.disabled=false;}
  });
  exportButton.addEventListener("click",()=>{
    if(!result)return;
    if(!window.confirm("Export aggregate split-sensitivity metrics? This is an exploratory research report, not a confidence interval or authorized training dataset."))return;
    downloadReport(exportReliabilityStudy(result,cohort));
    announce("Exported aggregate numeric results. No audio, source titles or reviewer identities included.");
  });
  for(const id of ["reliability-cohort","reliability-seed","reliability-ratio","reliability-repeats"]){
    $(id).addEventListener("change",()=>clear("Settings changed. Run again. Repeatedly selecting favorable seeds after seeing results does not preserve a pristine held-out test."));
  }
  const invalidate=()=>{
    if($("reliability-cohort").value==="personal")
      clear("Evidence or Rhythm notebook changed. Rerun to test the updated annotations.");
  };
  document.addEventListener("comedyatlas:evidence-updated",invalidate);
  document.addEventListener("comedyatlas:rhythms-updated",invalidate);
  window.addEventListener("storage",event=>{
    if(event.key===EVIDENCE_KEY||event.key===RHYTHM_KEY)invalidate();
  });
  clear("Ready. Choose original synthetic examples or opt into your reviewed local annotations.");
}
