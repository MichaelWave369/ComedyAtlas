import test from "node:test";
import assert from "node:assert/strict";
import {
  analyzePcm, compressWaveform, compareToRhythm, intervalOverlap,
  validateAudioSettings, serializableAudioReport
} from "../src/audio-core.mjs";
import { originalDemo } from "../src/rhythm-core.mjs";

const sr=8000;
const samples=new Float32Array(sr);
samples.fill(0.5,0,2000);
samples.fill(0.0,2000,5200);
samples.fill(0.5,5200);
const analysis=analyzePcm(samples,sr,{frameMs:25,thresholdDb:-30,minQuietMs:200});

test("RMS analysis finds synthetic quiet section at frame boundaries",()=>{
  assert.equal(analysis.frames.length,40);
  assert.equal(analysis.durationSeconds,1);
  assert.deepEqual(analysis.quietIntervals,[{start:0.25,end:0.65,duration:0.4}]);
  assert.equal(analysis.quietSeconds,0.4);
  assert.equal(analysis.quietPercent,40);
  assert.equal(analysis.peak,0.5);
  assert.ok(analysis.rms>0.38&&analysis.rms<0.39);
});

test("short low-energy blips do not meet the hold threshold",()=>{
  const sound=new Float32Array(sr);sound.fill(0.4);
  sound.fill(0,4000,4800);
  const result=analyzePcm(sound,sr,{frameMs:25,thresholdDb:-35,minQuietMs:250});
  assert.equal(result.quietSeconds,0);
  assert.deepEqual(result.quietIntervals,[]);
});

test("settings and input validation reject pathological values",()=>{
  for(const thresholdDb of [-90,0,NaN,"-30"])assert.throws(()=>validateAudioSettings({thresholdDb}));
  for(const minQuietMs of [0,3001,12.5])assert.throws(()=>validateAudioSettings({minQuietMs}));
  assert.throws(()=>analyzePcm([0,1],sr));
  assert.throws(()=>analyzePcm(new Float32Array(100),0));
  assert.throws(()=>analyzePcm(new Float32Array(100),sr,{frameMs:0}));
  const corrupt=new Float32Array([0,NaN,0]);
  assert.throws(()=>analyzePcm(corrupt,sr));
});

test("trailing quiet region is retained even without a later loud frame",()=>{
  const endQuiet=new Float32Array(sr);endQuiet.fill(0.6,0,sr/2);
  const result=analyzePcm(endQuiet,sr,{frameMs:25,thresholdDb:-40,minQuietMs:200});
  assert.deepEqual(result.quietIntervals,[{start:0.5,end:1,duration:0.5}]);
});

test("waveform binning preserves global peak and ordered time ranges",()=>{
  const bins=compressWaveform(analysis.frames,7);
  assert.equal(bins.length,7);
  assert.equal(bins[0].start,0);
  assert.equal(bins.at(-1).end,1);
  assert.equal(Math.max(...bins.map(x=>x.peak)),0.5);
  assert.ok(bins.every(x=>x.start<x.end));
  assert.throws(()=>compressWaveform(analysis.frames,5000));
});

test("annotated holds are compared as overlap, not laugh quality",()=>{
  const rhythm={...originalDemo(),segments:[
    {id:"segment-example01",phase:"setup",duration:0.2,energy:2,note:""},
    {id:"segment-example02",phase:"silence",duration:0.5,energy:0,note:""},
    {id:"segment-example03",phase:"payoff",duration:0.3,energy:5,note:""}
  ]};
  assert.equal(intervalOverlap({start:0,end:0.3},{start:0.2,end:0.4}),0.09999999999999998);
  const comparison=compareToRhythm(analysis,rhythm);
  assert.equal(comparison.audioDuration,1);
  assert.equal(comparison.manualDuration,1);
  assert.equal(comparison.overlapSeconds,0.4);
  assert.equal(comparison.annotatedSilenceOverlapPercent,80);
  assert.equal(comparison.timelineFitsAudio,true);
  const report=serializableAudioReport(analysis,rhythm,"synthetic.wav");
  assert.equal(report.comparison.overlapSeconds,0.4);
  assert.equal(report.fileLabel,"synthetic.wav");
  assert.equal(report.quietIntervals.length,1);
  assert.equal(JSON.stringify(report).includes("samples"),false);
});

test("all-loud and all-quiet signals are handled without invented punchlines",()=>{
  const loud=new Float32Array(sr).fill(1);
  const quiet=new Float32Array(sr);
  assert.equal(analyzePcm(loud,sr).quietPercent,0);
  assert.equal(analyzePcm(quiet,sr).quietPercent,100);
  assert.equal(compareToRhythm(analysis,{...originalDemo(),segments:[{phase:"setup",duration:1,energy:2}]}).annotatedSilenceOverlapPercent,null);
});
