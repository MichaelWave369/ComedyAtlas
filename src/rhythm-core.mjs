export const RHYTHM_KEY = "comedyatlas.rhythms.v1";
export const RHYTHM_KIND = "ComedyAtlasRhythmNotebook";
export const RHYTHM_VERSION = 1;
export const MAX_RHYTHMS = 60;
export const MAX_SEGMENTS = 32;
export const MAX_RHYTHM_IMPORT_BYTES = 1024 * 1024;
export const PHASES = [
  {id:"setup",name:"Setup",description:"Establish the expectation."},
  {id:"silence",name:"Silence",description:"Hold space; let the audience anticipate."},
  {id:"tension",name:"Tension",description:"Delay, friction, or uncertainty grows."},
  {id:"escalation",name:"Escalation",description:"The situation increases in intensity or complexity."},
  {id:"payoff",name:"Punchline",description:"Subvert or fulfill the expectation."},
  {id:"release",name:"Release",description:"Leave room for laughter and reset."}
];
const PHASE_IDS=new Set(PHASES.map(p=>p.id));
function limitedText(value,label,max,optional=false) {
  if(typeof value!=="string")throw Error(label+" must be text.");
  const s=value.trim();
  if(s.length>max||(!optional&&!s))throw Error(label+" must be "+(optional?"up to ":"1–")+max+" characters.");
  return s;
}
function isoDate(value,label){
  const s=limitedText(value,label,40);
  const d=new Date(s);
  if(!Number.isFinite(d.valueOf())||d.toISOString()!==s)throw Error("Invalid "+label+".");
  return s;
}
function validId(value,prefix,label){
  const id=limitedText(value,label,65);
  if(!new RegExp("^"+prefix+"-[a-zA-Z0-9-]{8,57}$").test(id))throw Error("Invalid "+label+".");
  return id;
}
export function normalizeSegment(raw) {
  if(!raw||typeof raw!=="object"||Array.isArray(raw))throw Error("Timeline segment must be an object.");
  const id=validId(raw.id,"segment","segment ID");
  if(typeof raw.phase!=="string"||!PHASE_IDS.has(raw.phase))throw Error("Unknown rhythm phase.");
  if(typeof raw.duration!=="number"||!Number.isFinite(raw.duration)||raw.duration<0.1||raw.duration>120||Math.abs(raw.duration*100-Math.round(raw.duration*100))>1e-8)
    throw Error("Segment duration must be between 0.1 and 120 seconds, in hundredths.");
  if(!Number.isInteger(raw.energy)||raw.energy<0||raw.energy>5)throw Error("Energy must be a whole number between 0 and 5.");
  return {id,phase:raw.phase,duration:raw.duration,energy:raw.energy,note:limitedText(raw.note??"","Note",240,true)};
}
export function normalizeRhythm(raw) {
  if(!raw||typeof raw!=="object"||Array.isArray(raw))throw Error("Rhythm must be an object.");
  const id=validId(raw.id,"rhythm","rhythm ID");
  if(!Array.isArray(raw.segments)||raw.segments.length<1||raw.segments.length>MAX_SEGMENTS)throw Error("Timeline needs 1–"+MAX_SEGMENTS+" segments.");
  const segments=raw.segments.map(normalizeSegment);
  if(new Set(segments.map(s=>s.id)).size!==segments.length)throw Error("Duplicate segment IDs.");
  if(segments.reduce((sum,s)=>sum+s.duration,0)>900.00001)throw Error("Timeline must be at most 15 minutes.");
  if(!Number.isInteger(raw.bpm)||raw.bpm<40||raw.bpm>240)throw Error("Tempo must be 40–240 BPM.");
  return {
    id,
    title:limitedText(raw.title,"Title",120),
    referenceId:limitedText(raw.referenceId??"","Reference ID",80,true),
    referenceLabel:limitedText(raw.referenceLabel??"","Reference label",180,true),
    bpm:raw.bpm,
    segments,
    createdAt:isoDate(raw.createdAt,"createdAt"),
    updatedAt:isoDate(raw.updatedAt,"updatedAt")
  };
}
export function summarizeRhythm(raw) {
  const segments=raw.segments;
  const total=segments.reduce((sum,s)=>sum+s.duration,0);
  const silence=segments.filter(s=>s.phase==="silence").reduce((sum,s)=>sum+s.duration,0);
  const loudest=Math.max(...segments.map(s=>s.energy));
  const payoffAt=[];
  let cursor=0;
  for(const s of segments){if(s.phase==="payoff")payoffAt.push(Math.round(cursor*100)/100);cursor+=s.duration;}
  const maxHold=Math.max(0,...segments.filter(s=>s.phase==="silence").map(s=>s.duration));
  return {
    totalSeconds:Math.round(total*100)/100,
    silenceSeconds:Math.round(silence*100)/100,
    silencePercent:total>0?Math.round(silence/total*100):0,
    segmentCount:segments.length,
    quarterBeats:Math.round((total*raw.bpm/60)*10)/10,
    maxEnergy:loudest,
    longestSilence:Math.round(maxHold*100)/100,
    payoffAt
  };
}
export function buildTimingRows(raw){
  let cursor=0;
  return raw.segments.map(s=>{
    const row={...s,start:Math.round(cursor*100)/100,end:Math.round((cursor+s.duration)*100)/100};
    cursor+=s.duration;
    return row;
  });
}
export function serializeRhythms(items){
  return JSON.stringify({kind:RHYTHM_KIND,schemaVersion:RHYTHM_VERSION,exportedAt:new Date().toISOString(),sequences:items},null,2)+"\n";
}
export function parseRhythms(text) {
  if(typeof text!=="string"||text.length>MAX_RHYTHM_IMPORT_BYTES)throw Error("Backup exceeds 1 MB.");
  let parsed;
  try{parsed=JSON.parse(text);}catch{throw Error("Not valid JSON.");}
  if(!parsed||parsed.kind!==RHYTHM_KIND||parsed.schemaVersion!==RHYTHM_VERSION||!Array.isArray(parsed.sequences))throw Error("Unsupported rhythm backup version.");
  if(parsed.sequences.length>MAX_RHYTHMS)throw Error("Too many sequences.");
  const sequences=parsed.sequences.map(normalizeRhythm);
  if(new Set(sequences.map(s=>s.id)).size!==sequences.length)throw Error("Duplicate rhythm IDs.");
  return sequences;
}
export function mergeRhythms(existing,incoming) {
  const byId=new Map(existing.map(s=>[s.id,s]));
  for(const s of incoming)if(!byId.has(s.id))byId.set(s.id,s);
  if(byId.size>MAX_RHYTHMS)throw Error("Notebook limit exceeded ("+MAX_RHYTHMS+").");
  return [...byId.values()].sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt)||a.id.localeCompare(b.id));
}
export function originalDemo(){
  const epoch="2026-01-01T00:00:00.000Z";
  const data=[
    ["setup",4,2,"An ordinary expectation is established."],
    ["tension",3,3,"The answer is delayed."],
    ["silence",2.5,0,"The pause itself becomes the setup."],
    ["escalation",3,4,"A second improbable detail appears."],
    ["payoff",1,5,"A short, surprising turn lands."],
    ["release",2.5,1,"Give the response room to breathe."]
  ];
  return {
    id:"rhythm-demo0001",title:"Original long-pause demonstration",
    referenceId:"",referenceLabel:"Fictional original example",bpm:120,
    segments:data.map(([phase,duration,energy,note],index)=>({id:"segment-demo"+String(index+1).padStart(4,"0"),phase,duration,energy,note})),
    createdAt:epoch,updatedAt:epoch
  };
}
