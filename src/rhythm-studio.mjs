import {escapeHtml} from "./core.mjs";
import {
  RHYTHM_KEY, PHASES, MAX_RHYTHMS, MAX_SEGMENTS, MAX_RHYTHM_IMPORT_BYTES,
  normalizeSegment,normalizeRhythm,summarizeRhythm,buildTimingRows,
  serializeRhythms,parseRhythms,mergeRhythms,originalDemo
} from "./rhythm-core.mjs";

const $=id=>document.getElementById(id);
const h=value=>escapeHtml(value??"");
const phaseNames=Object.fromEntries(PHASES.map(p=>[p.id,p.name]));
function makeId(prefix) {
  if(globalThis.crypto?.randomUUID)return prefix+"-"+crypto.randomUUID();
  return prefix+"-"+Date.now().toString(36)+"-"+Math.random().toString(36).slice(2,10);
}
function blankDraft(){
  const time=new Date().toISOString();
  return {id:makeId("rhythm"),title:"Untitled rhythm",referenceId:"",referenceLabel:"",bpm:120,
    segments:[{id:makeId("segment"),phase:"setup",duration:2,energy:2,note:""}],
    createdAt:time,updatedAt:time};
}
function demoDraft(){
  const sample=originalDemo();
  const time=new Date().toISOString();
  return {...sample,id:makeId("rhythm"),createdAt:time,updatedAt:time,
    segments:sample.segments.map(s=>({...s,id:makeId("segment")}))};
}
function elapsedTime(seconds){
  const minutes=Math.floor(seconds/60);
  const sec=(seconds-minutes*60).toFixed(2).padStart(5,"0");
  return minutes+":"+sec;
}
function triggerDownload(name,text){
  const url=URL.createObjectURL(new Blob([text],{type:"application/json"}));
  const anchor=document.createElement("a");anchor.href=url;anchor.download=name;
  document.body.appendChild(anchor);anchor.click();anchor.remove();
  setTimeout(()=>URL.revokeObjectURL(url),3000);
}

export function mountRhythm(atlas,getMoments) {
  let saved=[];
  let draft=demoDraft();
  let selectedIndex=null;
  let message="";
  let isError=false;
  const status=$("rhythm-status");
  const phaseSelect=$("rhythm-phase");
  for(const p of PHASES){
    const o=document.createElement("option");o.value=p.id;o.textContent=p.name;phaseSelect.appendChild(o);
  }
  const announce=(s,error=false)=>{message=s;isError=error;status.textContent=s;status.dataset.error=String(error);};
  const findReferences=()=>getMoments();
  function renderReferences(){
    const select=$("rhythm-reference");
    const old=select.value||draft.referenceId;
    select.replaceChildren();
    const none=document.createElement("option");none.value="";none.textContent="Original / unlinked";select.appendChild(none);
    for(const entry of findReferences()){
      const o=document.createElement("option");o.value=entry.id;o.textContent=entry.title+" · "+entry.source;select.appendChild(o);
    }
    if(old && ![...select.options].some(o=>o.value===old)){
      const missing=document.createElement("option");missing.value=old;
      missing.textContent=(draft.referenceLabel||"Previous source")+" (not currently in Atlas)";
      select.appendChild(missing);
    }
    select.value=old;
  }
  function renderFields(){
    $("rhythm-title").value=draft.title;
    $("rhythm-bpm").value=String(draft.bpm);
    renderReferences();
    $("rhythm-reference").value=draft.referenceId;
  }
  function renderSegmentFields(){
    const selected=selectedIndex===null?null:draft.segments[selectedIndex];
    $("rhythm-phase").value=selected?.phase??"setup";
    $("rhythm-duration").value=String(selected?.duration??2);
    $("rhythm-energy").value=String(selected?.energy??2);
    $("rhythm-note").value=selected?.note??"";
    $("rhythm-selected-label").textContent=selected
      ?"Editing segment "+(selectedIndex+1)+" · "+phaseNames[selected.phase]
      :"Select a segment to edit, or add a new one.";
    $("rhythm-update").disabled=selected===null;
    $("rhythm-remove").disabled=selected===null||draft.segments.length===1;
    $("rhythm-earlier").disabled=selected===null||selectedIndex===0;
    $("rhythm-later").disabled=selected===null||selectedIndex===draft.segments.length-1;
    $("rhythm-add").disabled=draft.segments.length>=MAX_SEGMENTS;
  }
  function renderTimeline(){
    const rows=buildTimingRows(draft),total=summarizeRhythm(draft);
    const track=$("rhythm-track");
    track.replaceChildren();
    track.style.minWidth=Math.max(550,rows.length*78)+"px";
    for(const [i,s] of rows.entries()){
      const button=document.createElement("button");
      button.type="button";
      button.className="rhythm-block"+(selectedIndex===i?" chosen":"");
      button.dataset.phase=s.phase;
      button.setAttribute("aria-pressed",String(selectedIndex===i));
      button.title=phaseNames[s.phase]+" · "+elapsedTime(s.start)+" to "+elapsedTime(s.end)+(s.note?" · "+s.note:"");
      button.setAttribute("aria-label","Segment "+(i+1)+": "+phaseNames[s.phase]+", "+s.duration+" seconds, energy "+s.energy+" of 5. Starts at "+elapsedTime(s.start));
      button.style.flexGrow=String(s.duration);
      button.style.flexBasis="0";
      const label=document.createElement("strong");label.textContent=phaseNames[s.phase];
      const time=document.createElement("span");time.textContent=elapsedTime(s.start);
      const seconds=document.createElement("small");seconds.textContent=s.duration+"s · "+s.energy+"/5";
      button.append(label,time,seconds);
      button.addEventListener("click",()=>{selectedIndex=i;renderSegmentFields();renderTimeline();});
      track.appendChild(button);
    }
    const graph=$("rhythm-energy");
    graph.replaceChildren();
    graph.style.minWidth=track.style.minWidth;
    for(const s of rows){
      const col=document.createElement("div");col.className="energy-col";col.dataset.phase=s.phase;
      col.style.flexGrow=String(s.duration);col.style.flexBasis="0";
      col.setAttribute("aria-label",phaseNames[s.phase]+" energy "+s.energy+" of 5");
      const bar=document.createElement("div");bar.className="energy-bar";
      bar.style.height=Math.max(3,s.energy*17)+"%";col.appendChild(bar);graph.appendChild(col);
    }
    $("rhythm-total").textContent=elapsedTime(total.totalSeconds);
    $("rhythm-silence").textContent=elapsedTime(total.silenceSeconds)+" ("+total.silencePercent+"%)";
    $("rhythm-beats").textContent=total.quarterBeats.toFixed(1)+" at "+draft.bpm+" BPM";
    $("rhythm-peaks").textContent=total.payoffAt.length?total.payoffAt.map(elapsedTime).join(", "):"Not marked";
    $("rhythm-timeline-end").textContent="End "+elapsedTime(total.totalSeconds);
    $("rhythm-timeline-summary").textContent=rows.map((s,i)=>
      "Segment "+(i+1)+": "+phaseNames[s.phase]+" from "+elapsedTime(s.start)+" to "+elapsedTime(s.end)+", energy "+s.energy+"/5"+(s.note?" ("+s.note+")":"")
    ).join(". ");
    renderSegmentFields();
  }
  function renderSaved(){
    $("rhythm-count").textContent=saved.length+" / "+MAX_RHYTHMS+" saved sequences";
    $("rhythm-saved").innerHTML=saved.length?saved.map(s=>
      '<article class="rhythm-saved-row"><div><strong>'+h(s.title)+'</strong><p>'+h(s.referenceLabel||"No reference")+' · '+h(elapsedTime(summarizeRhythm(s).totalSeconds))+'</p></div><div class="rhythm-row-actions">'
      +'<button type="button" class="secondary-button" data-action="load" data-id="'+h(s.id)+'">Edit</button>'
      +'<button type="button" class="danger-button" data-action="delete" data-id="'+h(s.id)+'">Delete</button></div></article>'
    ).join(""):'<p class="empty">No saved timelines yet. The demo is only a draft until you press Save.</p>';
  }
  function render(){
    renderFields();
    renderTimeline();
    renderSaved();
  }
  function persist(next,msg){
    saved=next;
    try{localStorage.setItem(RHYTHM_KEY,serializeRhythms(saved));announce(msg);}
    catch{announce("Changes are in memory only; browser storage failed. Export a backup now.",true);}
    renderSaved();
  }
  function segmentFromForm(id){
    return normalizeSegment({
      id,phase:phaseSelect.value,
      duration:Number($("rhythm-duration").value),
      energy:Number($("rhythm-energy").value),
      note:$("rhythm-note").value
    });
  }
  function loadSequence(entry){
    draft=structuredClone(entry);selectedIndex=null;render();
    announce("Loaded timeline for editing. Changes are saved only when you press Save timeline.");
  }

  try{
    const data=localStorage.getItem(RHYTHM_KEY);
    if(data!==null)saved=parseRhythms(data);
    announce("Local timeline editor ready. No audio is uploaded or played.");
  }catch(err){announce("Saved notebook was not overwritten. Storage read failed: "+err.message,true);}
  render();

  $("rhythm-new").addEventListener("click",()=>{
    if(!window.confirm("Start a new timeline? Unsaved draft edits will be lost."))return;
    draft=blankDraft();selectedIndex=null;render();announce("New original timeline draft created.");
  });
  $("rhythm-demo").addEventListener("click",()=>{
    if(!window.confirm("Load the original sample? Unsaved draft edits will be lost."))return;
    draft=demoDraft();selectedIndex=null;render();announce("Loaded original six-phase demonstration.");
  });
  $("rhythm-reference").addEventListener("change",(event)=>{
    draft.referenceId=event.target.value;
    const ref=findReferences().find(e=>e.id===draft.referenceId);
    draft.referenceLabel=ref?ref.title+" · "+ref.source:"";
  });
  $("rhythm-title").addEventListener("input",(e)=>{draft.title=e.target.value;});
  $("rhythm-bpm").addEventListener("input",(e)=>{
    draft.bpm=Number(e.target.value);
    if(Number.isInteger(draft.bpm)&&draft.bpm>=40&&draft.bpm<=240)renderTimeline();
    else $("rhythm-beats").textContent="Tempo out of range";
  });
  $("rhythm-segment-form").addEventListener("submit",(event)=>{
    event.preventDefault();
    try{
      if(draft.segments.length>=MAX_SEGMENTS)throw Error("Maximum "+MAX_SEGMENTS+" segments.");
      const added=segmentFromForm(makeId("segment"));
      const next=[...draft.segments,added];
      normalizeRhythm({...draft,title:$("rhythm-title").value,bpm:Number($("rhythm-bpm").value),segments:next});
      draft.segments=next;selectedIndex=next.length-1;
      renderTimeline();announce("Added segment. Press Save timeline to keep the changes.");
    }catch(err){announce(err.message,true);}
  });
  $("rhythm-update").addEventListener("click",()=>{
    if(selectedIndex===null)return;
    try{
      const next=draft.segments.map((s,i)=>i===selectedIndex?segmentFromForm(s.id):s);
      normalizeRhythm({...draft,title:$("rhythm-title").value,bpm:Number($("rhythm-bpm").value),segments:next});
      draft.segments=next;renderTimeline();announce("Segment updated in draft.");
    }catch(err){announce(err.message,true);}
  });
  $("rhythm-remove").addEventListener("click",()=>{
    if(selectedIndex===null||draft.segments.length<2)return;
    draft.segments.splice(selectedIndex,1);selectedIndex=null;renderTimeline();announce("Segment removed from draft.");
  });
  for(const [control,offset] of [["rhythm-earlier",-1],["rhythm-later",1]]){
    $(control).addEventListener("click",()=>{
      if(selectedIndex===null)return;
      const target=selectedIndex+offset;
      if(target<0||target>=draft.segments.length)return;
      [draft.segments[selectedIndex],draft.segments[target]]=[draft.segments[target],draft.segments[selectedIndex]];
      selectedIndex=target;renderTimeline();announce("Segment moved in draft.");
    });
  }
  $("rhythm-save").addEventListener("click",()=>{
    try{
      const time=new Date().toISOString();
      const ref=findReferences().find(e=>e.id===draft.referenceId);
      const next=normalizeRhythm({...draft,title:$("rhythm-title").value,bpm:Number($("rhythm-bpm").value),
        referenceLabel:ref?ref.title+" · "+ref.source:draft.referenceLabel,
        updatedAt:time});
      const updated=saved.filter(s=>s.id!==next.id);
      const merged=mergeRhythms(updated,[next]);
      draft=structuredClone(next);persist(merged,"Saved sequence locally. Export JSON for a backup.");
      render();
    }catch(err){announce(err.message,true);}
  });
  $("rhythm-saved").addEventListener("click",(event)=>{
    const button=event.target.closest("button[data-action]");
    if(!button)return;
    const entry=saved.find(s=>s.id===button.dataset.id);
    if(!entry)return;
    if(button.dataset.action==="load"){
      if(!window.confirm("Load saved timeline? Unsaved draft edits will be lost."))return;
      loadSequence(entry);
    }else if(button.dataset.action==="delete"){
      if(!window.confirm("Delete this saved timeline? This does not delete export backups."))return;
      persist(saved.filter(s=>s.id!==entry.id),"Saved sequence deleted.");
      if(draft.id===entry.id)announce("Saved version deleted. The draft remains until you leave or start a new one.");
    }
  });
  $("rhythm-export").addEventListener("click",()=>{
    triggerDownload("comedyatlas-rhythms.json",serializeRhythms(saved));
    announce("Rhythm notebook exported as JSON. Keep a backup outside this browser.");
  });
  $("rhythm-import").addEventListener("change",async(event)=>{
    const input=event.currentTarget,file=input.files?.[0];
    if(!file)return;
    try{
      if(file.size>MAX_RHYTHM_IMPORT_BYTES)throw Error("Backup file exceeds 1 MB.");
      const entries=parseRhythms(await file.text());
      const next=mergeRhythms(saved,entries);
      const added=next.length-saved.length;
      persist(next,added+" new saved timeline(s) imported; existing IDs were preserved.");
    }catch(err){announce("Import rejected: "+err.message+". Saved data unchanged.",true);}
    finally{input.value="";}
  });
  return {
    updateReferences(){renderReferences();}
  };
}
