import {
  analyzePcm, compressWaveform, compareToRhythm, serializableAudioReport,
  AUDIO_FILE_LIMIT_BYTES, AUDIO_DURATION_LIMIT_SECONDS
} from "./audio-core.mjs";
import {parseRhythms, buildTimingRows, RHYTHM_KEY} from "./rhythm-core.mjs";

const $ = id => document.getElementById(id);
const PALETTE = Object.freeze({
  setup:"#597d9c",silence:"#777ca3",tension:"#b08ac1",
  escalation:"#d47d92",payoff:"#f3c56e",release:"#87e6cc"
});
const EXTENSION = /\.(?:wav|mp3|ogg|opus|flac|m4a|aac|webm|mp4)$/i;

function clock(seconds){
  const n=Math.max(0,Number(seconds)||0);
  return Math.floor(n/60)+":"+String(Math.floor(n%60)).padStart(2,"0")+"."+String(Math.round((n%1)*10));
}
function download(name,content){
  const url=URL.createObjectURL(new Blob([content],{type:"application/json"}));
  const a=document.createElement("a");
  a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();
  setTimeout(()=>URL.revokeObjectURL(url),5000);
}
function readSettings(){
  return {
    frameMs:25,
    thresholdDb:Number($("lab-threshold").value),
    minQuietMs:Number($("lab-min-hold").value)
  };
}
function drawWaveform(canvas,analysis,selectedRhythm){
  const cssWidth=Math.max(320,Math.round(canvas.getBoundingClientRect().width)||660);
  const cssHeight=270;
  const density=Math.min(window.devicePixelRatio||1,2);
  canvas.width=Math.round(cssWidth*density);
  canvas.height=Math.round(cssHeight*density);
  const ctx=canvas.getContext("2d");
  if(!ctx)return;
  ctx.setTransform(density,0,0,density,0,0);
  const w=cssWidth,h=cssHeight,LEFT=37,RIGHT=12,TOP=30,BOTTOM=33;
  const plotW=w-LEFT-RIGHT;
  const plotTop=TOP+24,plotH=h-plotTop-BOTTOM;
  const duration=analysis?.durationSeconds||1;
  const x=t=>LEFT+Math.max(0,Math.min(1,t/duration))*plotW;
  ctx.clearRect(0,0,w,h);
  ctx.fillStyle="#151a2c";ctx.fillRect(0,0,w,h);
  ctx.fillStyle="#a8b0c5";ctx.font="11px system-ui,sans-serif";
  ctx.fillText("AUDIO AMPLITUDE / TIME",LEFT,17);

  if(selectedRhythm){
    for(const block of buildTimingRows(selectedRhythm)){
      if(block.start>=duration)break;
      const left=x(block.start),right=x(block.end);
      ctx.fillStyle=PALETTE[block.phase]||"#a5acc0";
      ctx.globalAlpha=.82;ctx.fillRect(left,TOP,Math.max(1,right-left),14);ctx.globalAlpha=1;
    }
  }
  for(const q of analysis?.quietIntervals||[]){
    const left=x(q.start),right=x(q.end);
    ctx.fillStyle="rgba(154,155,255,.14)";
    ctx.fillRect(left,plotTop,Math.max(1,right-left),plotH);
  }
  ctx.strokeStyle="#333c58";ctx.lineWidth=1;
  for(let i=0;i<=4;i++){
    const xx=LEFT+plotW*i/4;
    ctx.beginPath();ctx.moveTo(xx,plotTop);ctx.lineTo(xx,plotTop+plotH);ctx.stroke();
    ctx.fillStyle="#a8b0c5";ctx.fillText(clock(duration*i/4),Math.max(LEFT,Math.min(xx-13,w-47)),h-12);
  }
  ctx.beginPath();ctx.moveTo(LEFT,plotTop+plotH/2);ctx.lineTo(w-RIGHT,plotTop+plotH/2);ctx.stroke();
  if(!analysis)return;
  const bins=compressWaveform(analysis.frames,Math.min(1300,Math.floor(plotW*2)));
  ctx.strokeStyle="#87e6cc";ctx.lineWidth=Math.max(1,plotW/bins.length*.72);
  for(const bin of bins){
    const xx=x((bin.start+bin.end)/2);
    const amplitude=Math.min(1,Math.sqrt(Math.max(0,bin.peak)));
    const half=Math.max(1,amplitude*plotH*.47);
    ctx.beginPath();ctx.moveTo(xx,plotTop+plotH/2-half);ctx.lineTo(xx,plotTop+plotH/2+half);ctx.stroke();
  }
  ctx.fillStyle="#a8b0c5";ctx.fillText("PEAK",2,plotTop+12);
}

export function mountAudioLab(){
  let decoded=null;
  let analysis=null;
  let fileLabel="";
  let playbackUrl=null;
  let loadedGeneration=0;
  let rhythms=[];
  let selectedId="";
  const audio=$("lab-player");
  const status=$("lab-status");
  const canvas=$("lab-waveform");
  const announce=(message,error=false)=>{
    status.textContent=message;
    status.dataset.error=String(error);
  };
  const selected=()=>rhythms.find(r=>r.id===selectedId)||null;
  function refreshRhythms(){
    const select=$("lab-rhythm");
    let incoming=[];
    try{
      const raw=localStorage.getItem(RHYTHM_KEY);
      incoming=raw===null?[]:parseRhythms(raw);
    }catch(e){
      announce("Could not read saved rhythm notebook: "+e.message+". Previous selections are unchanged.",true);
      return;
    }
    rhythms=incoming;
    select.replaceChildren();
    const none=document.createElement("option");
    none.value="";none.textContent="No timeline overlay";select.appendChild(none);
    for(const rhythm of rhythms){
      const option=document.createElement("option");
      option.value=rhythm.id;option.textContent=rhythm.title;
      select.appendChild(option);
    }
    if(!rhythms.some(r=>r.id===selectedId))selectedId="";
    select.value=selectedId;
    $("lab-refresh-summary").textContent=rhythms.length+" saved rhythm timeline(s) available";
    render();
  }
  function renderComparison(){
    if(!analysis){
      $("lab-comparison").textContent="Load a local recording to compare its amplitude against a manually annotated timeline.";
      return;
    }
    const rhythm=selected();
    if(!rhythm){
      $("lab-comparison").textContent="Select a saved Rhythm Engine timeline to overlay its phases at their annotated seconds. This does not auto-detect punchlines.";
      return;
    }
    const c=compareToRhythm(analysis,rhythm);
    const overlay=c.annotatedSilenceSeconds
      ? "Annotated silence overlaps detected quiet windows by "+c.overlapSeconds.toFixed(2)+" seconds ("+c.annotatedSilenceOverlapPercent+"% of the manually marked holds)."
      : "This timeline has no annotated silence/hold blocks.";
    $("lab-comparison").textContent=
      "Timeline: "+rhythm.title+". Audio starts at t=0; timeline starts at t=0. "+
      "Audio "+clock(c.audioDuration)+", annotation "+clock(c.manualDuration)+
      " (difference "+c.durationDifference.toFixed(2)+" s). "+overlay+
      (Math.abs(c.durationDifference)>.5?" Durations differ: comparison requires manual alignment; the overlay is not rescaled.":"")+
      " Acoustic quiet and comedic silence are different concepts.";
  }
  function renderQuietEvents(){
    const list=$("lab-quiet-list");
    list.replaceChildren();
    if(!analysis){
      list.textContent="No audio loaded.";
      return;
    }
    const events=analysis.quietIntervals;
    if(!events.length){
      list.textContent="No quiet windows met the threshold. Try adjusting the cutoff or minimum hold.";
      return;
    }
    const top=events.slice(0,18);
    for(const event of top){
      const item=document.createElement("li");
      item.textContent=clock(event.start)+" to "+clock(event.end)+" · "+event.duration.toFixed(2)+" seconds";
      list.appendChild(item);
    }
    if(events.length>top.length){
      const item=document.createElement("li");
      item.textContent="…and "+(events.length-top.length)+" more detected windows.";
      list.appendChild(item);
    }
  }
  function render(){
    $("lab-threshold-label").textContent=$("lab-threshold").value+" dBFS";
    $("lab-duration").textContent=analysis?clock(analysis.durationSeconds):"—";
    $("lab-quiet").textContent=analysis?analysis.quietSeconds.toFixed(2)+" s · "+analysis.quietPercent+"%":"—";
    $("lab-peak").textContent=analysis?analysis.peak.toFixed(3):"—";
    $("lab-file-label").textContent=analysis?fileLabel:"No local audio selected";
    $("lab-download").disabled=!analysis;
    $("lab-reset").disabled=!analysis;
    renderQuietEvents();
    renderComparison();
    drawWaveform(canvas,analysis,selected());
  }
  function analyzeLoaded(){
    if(!decoded)return;
    const settings=readSettings();
    const channels=Array.from({length:Math.min(2,decoded.numberOfChannels)},(_,i)=>decoded.getChannelData(i));
    analysis=analyzePcm(channels,decoded.sampleRate,settings);
    announce("Analyzed locally. No audio transmitted, uploaded, or saved in the Atlas.");
    render();
  }
  async function handleFile(file){
    const generation=++loadedGeneration;
    if(!file)return;
    if(file.size===0||file.size>AUDIO_FILE_LIMIT_BYTES) {
      announce("Choose a nonempty audio file smaller than 40 MB.",true);
      return;
    }
    if(!(file.type?.startsWith("audio/")||EXTENSION.test(file.name))){
      announce("Choose an audio recording (WAV, MP3, OGG, FLAC, or another browser-supported format).",true);
      return;
    }
    announce("Decoding the local file in your browser. No network upload is used.");
    let ctx;
    try{
      const Engine=window.AudioContext||window.webkitAudioContext;
      if(!Engine)throw Error("Your browser does not support Web Audio decoding.");
      ctx=new Engine();
      const bytes=await file.arrayBuffer();
      const buffer=await ctx.decodeAudioData(bytes);
      if(generation!==loadedGeneration)return;
      if(!Number.isFinite(buffer.duration)||buffer.duration<=0||buffer.duration>AUDIO_DURATION_LIMIT_SECONDS){
        throw Error("Audio must be between 0 and 10 minutes long.");
      }
      const channels=Array.from({length:Math.min(2,buffer.numberOfChannels)},(_,i)=>buffer.getChannelData(i));
      if(!channels.length)throw Error("This recording has no readable audio channels.");
      const candidate=analyzePcm(channels,buffer.sampleRate,readSettings());
      // Never retain the previous media object URL longer than necessary.
      audio.pause();audio.removeAttribute("src");audio.load();
      if(playbackUrl)URL.revokeObjectURL(playbackUrl);
      playbackUrl=URL.createObjectURL(file);
      audio.src=playbackUrl;
      audio.hidden=false;
      decoded=buffer;
      analysis=candidate;
      fileLabel=file.name;
      announce("Local waveform ready. Inspect the quiet regions and compare with a saved timeline.");
      render();
    }catch(error){
      if(generation===loadedGeneration)announce("Unable to analyze: "+error.message,true);
    }finally{
      if(ctx)try{await ctx.close();}catch{}
    }
  }
  function clear(){
    loadedGeneration++;
    decoded=null;analysis=null;fileLabel="";
    audio.pause();audio.removeAttribute("src");audio.load();
    audio.hidden=true;
    if(playbackUrl)URL.revokeObjectURL(playbackUrl);
    playbackUrl=null;
    $("lab-file").value="";
    announce("Audio cleared from this page. Nothing was sent to a server.");
    render();
  }
  $("lab-file").addEventListener("change",event=>{void handleFile(event.currentTarget.files?.[0]);});
  $("lab-threshold").addEventListener("input",()=>{
    $("lab-threshold-label").textContent=$("lab-threshold").value+" dBFS";
  });
  for(const id of ["lab-threshold","lab-min-hold"]){
    $(id).addEventListener("change",()=>{
      if(!decoded){render();return;}
      try{analyzeLoaded();}catch(error){announce(error.message,true);}
    });
  }
  $("lab-rhythm").addEventListener("change",event=>{
    selectedId=event.target.value;
    render();
  });
  $("lab-refresh").addEventListener("click",()=>{
    refreshRhythms();
    announce("Saved timeline list refreshed from local browser storage.");
  });
  $("lab-reset").addEventListener("click",clear);
  $("lab-download").addEventListener("click",()=>{
    if(!analysis)return;
    download("comedyatlas-audio-features.json",
      JSON.stringify(serializableAudioReport(analysis,selected(),fileLabel),null,2)+"\n");
    announce("Derived feature report downloaded. No source audio was included.");
  });
  document.addEventListener("comedyatlas:rhythms-updated",refreshRhythms);
  window.addEventListener("storage",event=>{if(event.key===RHYTHM_KEY)refreshRhythms();});
  window.addEventListener("resize",()=>drawWaveform(canvas,analysis,selected()));
  window.addEventListener("pagehide",()=>{
    if(playbackUrl)URL.revokeObjectURL(playbackUrl);
    playbackUrl=null;
  });
  refreshRhythms();
  render();
}
