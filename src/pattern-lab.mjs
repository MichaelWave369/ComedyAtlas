import {escapeHtml} from "./core.mjs";
import {parseRhythms,RHYTHM_KEY,PHASES} from "./rhythm-core.mjs";
import {
  originalPatternExamples,comparePatterns,nearestPatterns,mineMotifs,
  extractCohortReport,COMPONENT_WEIGHTS
} from "./pattern-core.mjs";

const $=id=>document.getElementById(id);
const h=value=>escapeHtml(value??"");
const PHASE_NAMES=Object.fromEntries(PHASES.map(x=>[x.id,x.name]));
const COMPONENTS=[
  ["phases","Phase proportions","Share of total time spent in each named phase"],
  ["transitions","Phase transitions","How frequently the same ordered phase-to-phase changes occur"],
  ["energy","Energy contour","Relative perceived intensity over twelve normalized time bins"],
  ["pauses","Hold placement","Where manually marked silence appears in normalized time"],
  ["payoff","Punchline placement","Relative positions and counts of marked punchlines"]
];
function downloadJson(name,data){
  const blob=new Blob([JSON.stringify(data,null,2)+"\n"],{type:"application/json"});
  const url=URL.createObjectURL(blob);
  const anchor=document.createElement("a");anchor.href=url;anchor.download=name;
  document.body.appendChild(anchor);anchor.click();anchor.remove();
  setTimeout(()=>URL.revokeObjectURL(url),3000);
}
function sequenceSummary(sequence){
  const total=sequence.segments.reduce((sum,s)=>sum+s.duration,0);
  return sequence.segments.length+" phases · "+total.toFixed(2)+" s · "+sequence.bpm+" reference BPM";
}
function phaseStrip(sequence,container){
  container.replaceChildren();
  const label=document.createElement("p");
  label.className="pattern-strip-label";
  label.textContent=sequence.title+" · "+sequenceSummary(sequence);
  const bar=document.createElement("div");
  bar.className="pattern-strip";
  bar.setAttribute("role","list");
  bar.setAttribute("aria-label","Ordered timing phases for "+sequence.title);
  for(const segment of sequence.segments){
    const block=document.createElement("div");
    block.className="pattern-phase";
    block.dataset.phase=segment.phase;
    block.style.flexGrow=String(segment.duration);
    block.style.flexBasis="0";
    block.title=PHASE_NAMES[segment.phase]+" · "+segment.duration+" seconds · energy "+segment.energy;
    block.setAttribute("role","listitem");
    block.setAttribute("aria-label",PHASE_NAMES[segment.phase]+", "+segment.duration+" seconds, energy "+segment.energy+" of five");
    bar.appendChild(block);
  }
  container.append(label,bar);
}
export function mountPatternLab(){
  const demo=originalPatternExamples();
  let saved=[];
  let cohort="example";
  let primaryId="";
  let secondaryId="";
  const status=$("pattern-status");
  const source=$("pattern-source");
  const first=$("pattern-first");
  const second=$("pattern-second");
  const announce=(msg,error=false)=>{
    status.textContent=msg;
    status.dataset.error=String(error);
  };
  function activeSequences(){return cohort==="personal"?saved:demo;}
  function populate(select,sequences,preferred){
    const old=preferred||"";
    select.replaceChildren();
    if(!sequences.length){
      const option=document.createElement("option");option.value="";
      option.textContent="No saved rhythms available";select.appendChild(option);
      select.disabled=true;return;
    }
    select.disabled=false;
    for(const sequence of sequences){
      const option=document.createElement("option");
      option.value=sequence.id;option.textContent=sequence.title;select.appendChild(option);
    }
    select.value=sequences.some(s=>s.id===old)?old:sequences[0].id;
  }
  function synchronize(){
    const sequences=activeSequences();
    const firstExists=sequences.some(s=>s.id===primaryId);
    const secondExists=sequences.some(s=>s.id===secondaryId);
    if(!firstExists)primaryId=sequences[0]?.id||"";
    if(!secondExists)secondaryId=sequences.find(s=>s.id!==primaryId)?.id||sequences[0]?.id||"";
    populate(first,sequences,primaryId);
    populate(second,sequences,secondaryId);
    $("pattern-count").textContent=sequences.length+" "+(cohort==="personal"?"saved personal":"original example")+" timeline(s) in this cohort";
    $("pattern-download").disabled=!sequences.length;
    render();
  }
  function renderMotifs(sequences){
    const length=Number($("pattern-motif-length").value);
    const minSupport=Number($("pattern-min-support").value);
    const results=mineMotifs(sequences,{length,minSupport});
    const container=$("pattern-motifs");
    if(!results.length){
      container.innerHTML='<p class="empty">No shared motifs with these settings. Add more independent timelines or reduce support to two.</p>';
      return;
    }
    container.innerHTML=results.slice(0,10).map(motif=>{
      const names=motif.phases.map(id=>PHASE_NAMES[id]).join(" → ");
      const members=motif.sourceTitles.slice(0,4).join(" · ")+(motif.support>4?" · and others":"");
      return '<article class="pattern-motif"><strong>'+h(names)+'</strong>'
        +'<span class="pattern-support">'+motif.support+' of '+sequences.length+' sequences</span>'
        +'<p>'+h(members)+'</p></article>';
    }).join("");
  }
  function renderNeighbors(sequences,selected){
    const container=$("pattern-neighbors");
    const rows=nearestPatterns(selected,sequences,4);
    container.innerHTML=rows.length?rows.map(item=>
      '<li><button type="button" class="pattern-neighbor" data-pattern-id="'+h(item.id)+'"><span>'+h(item.title)+'</span><strong>'+item.score+'% structural resemblance</strong></button></li>'
    ).join(""):'<li class="fine-print">Save or add a second sequence to find neighbors.</li>';
  }
  function render(){
    const sequences=activeSequences();
    const a=sequences.find(s=>s.id===primaryId);
    const b=sequences.find(s=>s.id===secondaryId);
    $("pattern-cohort-note").textContent=cohort==="example"
      ?"These four original fictional examples are never added to your personal notebook."
      :"Only saved timelines in this browser are used. Draft edits are excluded until saved.";
    const hasIndependentComparison=Boolean(a&&b&&sequences.length>=2);
    $("pattern-compare").hidden=!hasIndependentComparison;
    $("pattern-empty").hidden=hasIndependentComparison;
    if(!hasIndependentComparison){
      $("pattern-empty").textContent="Save at least two timeline sequences in the Rhythm Engine, then return here. A single saved sequence can still be exported, but cross-example comparisons need two.";
      renderMotifs(sequences);
      $("pattern-neighbors").replaceChildren();
      return;
    }
    first.value=primaryId;
    second.value=secondaryId;
    const results=comparePatterns(a,b);
    $("pattern-score").textContent=results.score+"%";
    $("pattern-duration-note").textContent=
      a.title+" ("+results.left.totalSeconds.toFixed(2)+" s) vs. "+
      b.title+" ("+results.right.totalSeconds.toFixed(2)+" s). Relative timing is compared independently of absolute length.";
    $("pattern-comparison-warning").textContent=a.id===b.id
      ?"You selected the same sequence twice, so 100% is guaranteed by definition, not evidence of independent agreement."
      :(sequences.length<2
        ?"Save another independent timeline to compare two observations."
        :"This percentage describes resemblance between your annotations, not comedic success or quality.");
    phaseStrip(a,$("pattern-strip-a"));
    phaseStrip(b,$("pattern-strip-b"));
    const breakdown=$("pattern-breakdown");
    breakdown.innerHTML=COMPONENTS.map(([key,label,help])=>{
      const score=results.components[key];
      const weight=Math.round(COMPONENT_WEIGHTS[key]*100);
      return '<div class="pattern-component"><div class="pattern-component-head"><strong>'+h(label)
      +'</strong><span>'+score+'% resemblance · '+weight+'% weight</span></div>'
      +'<div class="pattern-progress" role="meter" aria-label="'+h(label)+' similarity" aria-valuemin="0" aria-valuemax="100" aria-valuenow="'+score+'">'
      +'<div class="pattern-progress-fill" style="width:'+score+'%"></div></div><p>'+h(help)+'</p></div>';
    }).join("");
    renderNeighbors(sequences,a);
    renderMotifs(sequences);
  }
  function refreshSaved(notify=false){
    try{
      const raw=localStorage.getItem(RHYTHM_KEY);
      saved=raw===null?[]:parseRhythms(raw);
      if(notify)announce("Read "+saved.length+" saved timeline(s) from this browser.");
      synchronize();
    }catch(error){
      announce("Could not load saved timelines: "+error.message+". Existing data was not overwritten.",true);
    }
  }
  source.addEventListener("change",()=>{
    cohort=source.value;
    primaryId="";
    secondaryId="";
    synchronize();
    announce(cohort==="example"?"Showing original fictional demonstrations.":"Showing saved local timelines.");
  });
  first.addEventListener("change",()=>{
    primaryId=first.value;
    if(primaryId===secondaryId){
      const replacement=activeSequences().find(s=>s.id!==primaryId);
      if(replacement)secondaryId=replacement.id;
    }
    render();
  });
  second.addEventListener("change",()=>{secondaryId=second.value;render();});
  for(const id of ["pattern-motif-length","pattern-min-support"]){
    $(id).addEventListener("change",render);
  }
  $("pattern-refresh").addEventListener("click",()=>refreshSaved(true));
  $("pattern-neighbors").addEventListener("click",event=>{
    const button=event.target.closest("button[data-pattern-id]");
    if(!button)return;
    secondaryId=button.dataset.patternId;
    render();
    $("pattern-second").focus();
  });
  $("pattern-download").addEventListener("click",()=>{
    const sequences=activeSequences();
    if(!sequences.length)return;
    downloadJson("comedyatlas-pattern-features.json",extractCohortReport(sequences,cohort));
    announce("Feature-only JSON exported. Titles and source labels are included; no audio or transcripts.");
  });
  document.addEventListener("comedyatlas:rhythms-updated",()=>refreshSaved(false));
  window.addEventListener("storage",event=>{if(event.key===RHYTHM_KEY)refreshSaved(true);});
  refreshSaved(false);
  announce("Pattern engine ready. Start with the original demos or compare your saved rhythm timelines.");
}
