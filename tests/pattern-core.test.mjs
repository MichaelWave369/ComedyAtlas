import test from "node:test";
import assert from "node:assert/strict";
import {
  PHASE_IDS,ENERGY_BINS,COMPONENT_WEIGHTS,extractPattern,comparePatterns,
  nearestPatterns,mineMotifs,extractCohortReport,originalPatternExamples
} from "../src/pattern-core.mjs";
const examples=originalPatternExamples();
const [a,b,c,d]=examples;

test("examples are original, valid, separate and in consistent feature dimensions",()=>{
  assert.equal(examples.length,4);
  assert.equal(new Set(examples.map(s=>s.id)).size,4);
  for(const item of examples){
    const f=extractPattern(item);
    assert.equal(f.phaseShares.length,6);
    assert.equal(f.energyCurve.length,ENERGY_BINS);
    assert.equal(f.silenceCurve.length,ENERGY_BINS);
    assert.equal(f.payoffCurve.length,ENERGY_BINS);
    assert.ok(Math.abs(f.phaseShares.reduce((x,y)=>x+y,0)-1)<0.001);
    assert.ok(f.energyCurve.every(v=>v>=0&&v<=1));
  }
  assert.equal(PHASE_IDS.length,6);
  assert.equal(Object.values(COMPONENT_WEIGHTS).reduce((a,b)=>a+b,0),1);
});

test("structural comparisons are symmetric, deterministic and identity-preserving",()=>{
  for(const p of examples){
    const equal=comparePatterns(p,p);
    assert.equal(equal.score,100);
    assert.ok(Object.values(equal.components).every(n=>n===100));
    for(const q of examples){
      assert.deepEqual(comparePatterns(p,q).components,comparePatterns(q,p).components);
      assert.equal(comparePatterns(p,q).score,comparePatterns(q,p).score);
    }
  }
  assert.ok(comparePatterns(a,b).score>comparePatterns(a,c).score);
  assert.ok(comparePatterns(a,b).score>comparePatterns(a,d).score);
  assert.ok(comparePatterns(a,c).score<100);
});

test("normalized timing preserves structure when all durations are uniformly scaled",()=>{
  const double={...a,id:"rhythm-scaled01",segments:a.segments.map(s=>({...s,duration:s.duration*2}))};
  assert.equal(comparePatterns(a,double).score,100);
  assert.equal(comparePatterns(a,double).durationRatio,0.5);
});

test("energy differences affect only energy component for otherwise same structure",()=>{
  const changed={...a,id:"rhythm-energy01",segments:a.segments.map(s=>({...s,energy:0}))};
  const cmp=comparePatterns(a,changed);
  assert.equal(cmp.components.phases,100);
  assert.equal(cmp.components.transitions,100);
  assert.equal(cmp.components.pauses,100);
  assert.equal(cmp.components.payoff,100);
  assert.ok(cmp.components.energy<100);
});

test("phase order changes are captured by transition similarity",()=>{
  const swap={...a,id:"rhythm-swapped01",segments:a.segments.map(s=>({...s}))};
  [swap.segments[1],swap.segments[2]]=[swap.segments[2],swap.segments[1]];
  const cmp=comparePatterns(a,swap);
  assert.equal(cmp.components.phases,100);
  assert.ok(cmp.components.transitions<100);
  assert.ok(cmp.score<100);
});

test("nearest neighbors sort deterministically and exclude the selected sequence",()=>{
  const neighbors=nearestPatterns(a,examples,2);
  assert.equal(neighbors.length,2);
  assert.ok(neighbors.every(p=>p.id!==a.id));
  assert.ok(neighbors[0].score>=neighbors[1].score);
  assert.throws(()=>nearestPatterns(a,examples,100));
});

test("motif support counts distinct sequences rather than repeated occurrence in one",()=>{
  const same={...a,id:"rhythm-repeats01",segments:[
    ...a.segments,
    {...a.segments[0],id:"segment-repeats01"},
    {...a.segments[1],id:"segment-repeats02"}
  ]};
  const results=mineMotifs([a,b,c,d,same],{length:2,minSupport:2});
  const motif=results.find(x=>x.key==="setup|tension");
  assert.ok(motif);
  assert.equal(motif.support,3);
  assert.equal(new Set(motif.sourceIds).size,3);
  const tri=mineMotifs([a,b],{length:3,minSupport:2});
  assert.ok(tri.some(x=>x.key==="setup|tension|silence"));
  assert.equal(mineMotifs([a],{length:2,minSupport:2}).length,0);
  assert.throws(()=>mineMotifs([a,b],{length:4}));
});

test("export includes derived features, excludes raw notes and validates duplicates",()=>{
  const report=extractCohortReport([a,b],"example");
  assert.equal(report.patterns.length,2);
  assert.equal(report.kind,"ComedyAtlasPatternFeatures");
  assert.equal(report.methodology.energyBins,ENERGY_BINS);
  const string=JSON.stringify(report);
  assert.ok(!string.includes("createdAt"));
  assert.ok(!string.includes("segments"));
  assert.throws(()=>extractCohortReport([a,a]));
  assert.throws(()=>extractCohortReport([a],"wrong"));
});

test("no-payoff cases and single-segment timelines remain comparable",()=>{
  const only={...a,id:"rhythm-single01",segments:[a.segments[0]]};
  const other={...a,id:"rhythm-single02",segments:[{...a.segments[0],id:"segment-single02",phase:"silence",energy:0}]};
  assert.equal(comparePatterns(only,only).score,100);
  assert.equal(comparePatterns(only,other).components.payoff,100);
  assert.equal(comparePatterns(a,only).components.payoff,0);
});
