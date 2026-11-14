import test from "node:test";
import assert from "node:assert/strict";
import {
  PHASES,MAX_RHYTHMS,MAX_SEGMENTS,RHYTHM_KIND,RHYTHM_VERSION,
  normalizeSegment,normalizeRhythm,summarizeRhythm,buildTimingRows,
  serializeRhythms,parseRhythms,mergeRhythms,originalDemo
} from "../src/rhythm-core.mjs";

const demo=originalDemo();
test("demo is original, schema-valid, and has all six phases",()=>{
  assert.equal(normalizeRhythm(demo).segments.length,6);
  assert.equal(PHASES.length,6);
  assert.deepEqual(demo.segments.map(s=>s.phase),PHASES.map(p=>p.id));
});
test("timing rows and summary are deterministic",()=>{
  const rows=buildTimingRows(demo);
  assert.equal(rows[0].start,0);
  assert.equal(rows[2].start,7);
  assert.equal(rows[2].end,9.5);
  assert.equal(rows.at(-1).end,16);
  const s=summarizeRhythm(demo);
  assert.equal(s.totalSeconds,16);
  assert.equal(s.silenceSeconds,2.5);
  assert.equal(s.silencePercent,16);
  assert.equal(s.quarterBeats,32);
  assert.deepEqual(s.payoffAt,[12.5]);
  assert.equal(s.longestSilence,2.5);
});
test("edited energy and duration require precise bounds",()=>{
  for(const duration of [-2,0,0.09,121,1.123,NaN,Infinity,"2"]) {
    assert.throws(()=>normalizeSegment({...demo.segments[0],duration}));
  }
  for(const energy of [-1,6,0.5,"5"])assert.throws(()=>normalizeSegment({...demo.segments[0],energy}));
  assert.equal(normalizeSegment({...demo.segments[0],duration:0.1}).duration,0.1);
  assert.equal(normalizeSegment({...demo.segments[0],duration:120}).duration,120);
});
test("reject invalid phases, duplicate IDs and oversized sequences",()=>{
  assert.throws(()=>normalizeSegment({...demo.segments[0],phase:"internet"}));
  assert.throws(()=>normalizeRhythm({...demo,bpm:300}));
  assert.throws(()=>normalizeRhythm({...demo,segments:[]}));
  assert.throws(()=>normalizeRhythm({...demo,segments:[...demo.segments,demo.segments[0]]}));
  assert.throws(()=>normalizeRhythm({...demo,segments:Array.from({length:MAX_SEGMENTS+1},(_,i)=>({...demo.segments[0],id:"segment-more"+String(i).padStart(5,"0")}))}));
  assert.throws(()=>normalizeRhythm({...demo,segments:Array.from({length:8},(_,i)=>({...demo.segments[0],id:"segment-long"+String(i).padStart(5,"0"),duration:120}))}));
});
test("backup is versioned, portable, and atomically rejects invalid records",()=>{
  const backup=serializeRhythms([demo]);
  assert.deepEqual(parseRhythms(backup),[demo]);
  assert.throws(()=>parseRhythms("not JSON"));
  assert.throws(()=>parseRhythms(JSON.stringify({kind:RHYTHM_KIND,schemaVersion:RHYTHM_VERSION+1,sequences:[demo]})));
  assert.throws(()=>parseRhythms(JSON.stringify({kind:RHYTHM_KIND,schemaVersion:RHYTHM_VERSION,sequences:[demo,{...demo,bpm:5,id:"rhythm-invalid1"}]})));
  assert.throws(()=>parseRhythms(JSON.stringify({kind:RHYTHM_KIND,schemaVersion:RHYTHM_VERSION,sequences:[demo,demo]})));
  assert.throws(()=>parseRhythms(" ".repeat(1024*1024+1)));
});
test("merge preserves existing revisions on identifier collision",()=>{
  const incoming={...demo,title:"Changed text"};
  const second={...demo,id:"rhythm-addition0001",title:"New"};
  const items=mergeRhythms([demo],[incoming,second]);
  assert.equal(items.length,2);
  assert.equal(items.find(s=>s.id===demo.id).title,demo.title);
  assert.throws(()=>mergeRhythms(Array.from({length:MAX_RHYTHMS},(_,i)=>({...demo,id:"rhythm-saved"+String(i).padStart(5,"0")})),[second]));
});
test("freeform text cannot create unlimited or maliciously shaped records",()=>{
  assert.throws(()=>normalizeRhythm({...demo,title:"x".repeat(121)}));
  assert.throws(()=>normalizeRhythm({...demo,referenceId:7}));
  assert.throws(()=>normalizeRhythm({...demo,createdAt:"tomorrow"}));
  assert.throws(()=>normalizeRhythm({...demo,segments:[{...demo.segments[0],id:"x"}]}));
  assert.equal(summarizeRhythm({...demo,segments:[demo.segments[0]]}).payoffAt.length,0);
});
