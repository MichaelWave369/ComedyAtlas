import {PHASES} from "./rhythm-core.mjs";
import {RHYTHM_KEY,parseRhythms} from "./rhythm-core.mjs";
import {EVIDENCE_KEY,parseEvidence} from "./evidence-core.mjs";
import {
  syntheticLearningCohort,runLearningExperiment,predictNextPhase,
  baselineDistribution,exportLearningReport
} from "./learning-core.mjs";

const $=id=>document.getElementById(id);
const phases=PHASES.map(p=>p.id);
const phaseLabel=Object.fromEntries(PHASES.map(p=>[p.id,p.name]));
const asPercent=number=>Math.round(number*1000)/10+"%";
const asLoss=number=>number.toFixed(3);
function downloadJson(filename,content){
  const url=URL.createObjectURL(new Blob([JSON.stringify(content,null,2)+"\n"],{type:"application/json"}));
  const link=document.createElement("a");
  link.href=url;link.download=filename;document.body.appendChild(link);link.click();link.remove();
  setTimeout(()=>URL.revokeObjectURL(url),4000);
}
export function mountLearningExperiment(){
  const demo=syntheticLearningCohort();
  let result=null;
  let cohort=null;
  const status=$("learning-status");
  const text=(message,error=false)=>{status.textContent=message;status.dataset.error=String(error);};
  const runButton=$("learning-run");
  const exportButton=$("learning-export");
  const testPanel=$("learning-holdout");
  const startPanel=$("learning-start");
  const resultsPanel=$("learning-results");
  for(const phase of PHASES){
    const option=document.createElement("option");option.value=phase.id;option.textContent=phase.name;
    $("learning-context").appendChild(option);
  }
  function reset(message){
    result=null;cohort=null;
    resultsPanel.hidden=true;
    startPanel.hidden=false;
    exportButton.disabled=true;
    text(message);
  }
  function scoreCard(name,metrics){
    const outer=document.createElement("article");
    outer.className="learning-metric-card";
    const title=document.createElement("h4");title.textContent=name;
    const main=document.createElement("strong");
    main.textContent=asPercent(metrics.groupBalancedAccuracy);
    const explanation=document.createElement("p");
    explanation.textContent="Group-balanced accuracy";
    const more=document.createElement("p");more.className="fine-print";
    more.textContent="Group-balanced log-loss "+asLoss(metrics.groupBalancedLogLoss)+
      " · "+metrics.groups+" source groups · "+metrics.transitions+" annotated transitions";
    outer.append(title,main,explanation,more);
    return outer;
  }
  function metricsPair(container,entries){
    container.replaceChildren(
      scoreCard("Baseline: most common next phase",entries.baseline),
      scoreCard("Learned: previous-phase transitions",entries.learned)
    );
  }
  function renderMatrix(){
    const target=$("learning-confusion");
    target.replaceChildren();
    const table=document.createElement("table");
    table.className="learning-matrix";
    const caption=document.createElement("caption");
    caption.textContent="Held-out predictions: actual annotated phase in rows, predicted phase in columns.";
    const header=document.createElement("tr");
    const first=document.createElement("th");first.scope="col";first.textContent="Actual ↓ / Predicted →";
    header.append(first);
    for(const phase of phases){
      const th=document.createElement("th");th.scope="col";th.textContent=phaseLabel[phase];header.append(th);
    }
    const thead=document.createElement("thead");thead.append(header);table.append(caption,thead);
    const tbody=document.createElement("tbody");
    for(const actual of phases){
      const tr=document.createElement("tr");
      const heading=document.createElement("th");heading.scope="row";heading.textContent=phaseLabel[actual];
      tr.append(heading);
      for(const predicted of phases){
        const cell=document.createElement("td");
        cell.textContent=String(result.heldOutTest.learned.confusion[actual][predicted]);
        if(actual===predicted)cell.className="learning-matrix-hit";
        tr.append(cell);
      }
      tbody.append(tr);
    }
    table.append(tbody);target.append(table);
  }
  function renderContext(){
    if(!result)return;
    const previous=$("learning-context").value;
    const distribution=predictNextPhase(result.model,previous);
    const baseline=baselineDistribution(result.model);
    const target=$("learning-probabilities");
    target.replaceChildren();
    for(const phase of phases){
      const item=document.createElement("div");item.className="learning-probability";
      const label=document.createElement("span");label.textContent=phaseLabel[phase];
      const track=document.createElement("div");track.className="learning-probability-track";
      const fill=document.createElement("div");fill.className="learning-probability-fill";
      fill.style.width=(distribution[phase]*100).toFixed(1)+"%";
      fill.title="Conditional chance "+asPercent(distribution[phase]);
      track.append(fill);
      const amount=document.createElement("strong");amount.textContent=asPercent(distribution[phase]);
      item.append(label,track,amount);
      target.append(item);
    }
    $("learning-context-note").textContent="The learned conditional probabilities above are from training annotations only. "+
      "Baseline most-common-next-phase: "+
      phaseLabel[phases.reduce((best,phase)=>baseline[phase]>baseline[best]?phase:best,phases[0])]+
      ". They do not represent audience reactions.";
  }
  function render(){
    if(!result)return;
    startPanel.hidden=true;
    resultsPanel.hidden=false;
    exportButton.disabled=false;
    const counts=result.sourceGroups;
    $("learning-size").textContent="Trained on "+counts.train+" source group(s); tuned on "+counts.validation+
      "; evaluated on "+counts.test+". "+
      counts.quarantined+" source conflicts quarantined.";
    $("learning-alpha").textContent="Validation-selected smoothing "+result.selectedAlpha+
      " (chosen without looking at test labels)";
    $("learning-example-note").textContent=cohort==="synthetic"
      ?"The synthetic exercise has 36 computer-generated examples from 4 reused template families, not 36 independent human performances. These results are illustrative, not an external benchmark."
      :"These inputs are human-entered timing annotations. Source independence, reuse rights, and annotator identity were not independently verified.";
    metricsPair($("learning-validation"),result.validation);
    metricsPair($("learning-test-metrics"),result.heldOutTest);
    renderMatrix();
    renderContext();
    $("learning-comparison").textContent=result.heldOutTest.learned.groupBalancedLogLoss
       <result.heldOutTest.baseline.groupBalancedLogLoss
      ?"On this split the learned transition model has lower held-out group-balanced log-loss than the majority baseline."
      :"On this split the learned transition model does not improve held-out group-balanced log-loss over the majority baseline.";
    text("Local experiment complete. No raw audio, transcripts, or notebook data was uploaded.");
  }
  function readPersonal(){
    const savedRhythms=localStorage.getItem(RHYTHM_KEY);
    const rhythms=savedRhythms===null?[]:parseRhythms(savedRhythms);
    const savedEvidence=localStorage.getItem(EVIDENCE_KEY);
    const evidence=savedEvidence===null?[]:parseEvidence(savedEvidence,new Set(rhythms.map(r=>r.id)),{allowOrphans:true});
    return {rhythms,evidence};
  }
  runButton.addEventListener("click",()=>{
    reset("Running locally.");
    runButton.disabled=true;
    try{
      const selected=$("learning-cohort").value;
      const data=selected==="synthetic"?demo:readPersonal();
      cohort=selected;
      result=runLearningExperiment(data.evidence,data.rhythms,{
        seed:Number($("learning-seed").value),
        ratio:$("learning-ratio").value
      });
      render();
    }catch(error){
      reset("Experiment unavailable: "+error.message+" Fix the source data or try the original synthetic demo.");
      status.dataset.error="true";
    }finally{runButton.disabled=false;}
  });
  $("learning-context").addEventListener("change",renderContext);
  exportButton.addEventListener("click",()=>{
    if(!result)return;
    if(!window.confirm("Download a derived, local next-phase model report? No audio or transcript is included, but inspect numeric model parameters before publishing."))return;
    downloadJson("comedyatlas-local-learning-report.json",exportLearningReport(result,cohort));
    text("Derived model report exported. No personal timeline titles or pseudonyms are included.");
  });
  for(const id of ["learning-cohort","learning-seed","learning-ratio"]){
    $(id).addEventListener("change",()=>reset("Experiment settings changed. Run again to generate new results. Previously viewed test results must not be used to tune a final benchmark."));
  }
  function invalidate(){
    if($("learning-cohort").value==="personal")
      reset("Your saved Rhythm or Evidence notebook changed. Rerun to recompute the experiment from current annotations.");
  }
  document.addEventListener("comedyatlas:evidence-updated",invalidate);
  document.addEventListener("comedyatlas:rhythms-updated",invalidate);
  window.addEventListener("storage",event=>{
    if(event.key===EVIDENCE_KEY||event.key===RHYTHM_KEY)invalidate();
  });
  reset("Choose the synthetic exercise or your saved, reviewed evidence and run locally.");
}
