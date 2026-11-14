import { buildTimingRows, summarizeRhythm } from "./rhythm-core.mjs";

export const AUDIO_FILE_LIMIT_BYTES = 40 * 1024 * 1024;
export const AUDIO_DURATION_LIMIT_SECONDS = 600;
export const AUDIO_DEFAULTS = Object.freeze({frameMs:25, thresholdDb:-38, minQuietMs:250});

export function validateAudioSettings(raw = {}) {
  const frameMs = raw.frameMs ?? AUDIO_DEFAULTS.frameMs;
  const thresholdDb = raw.thresholdDb ?? AUDIO_DEFAULTS.thresholdDb;
  const minQuietMs = raw.minQuietMs ?? AUDIO_DEFAULTS.minQuietMs;
  if (!Number.isInteger(frameMs) || frameMs < 10 || frameMs > 100) throw Error("Frame size must be 10 to 100 ms.");
  if (typeof thresholdDb !== "number" || !Number.isFinite(thresholdDb) || thresholdDb < -75 || thresholdDb > -10) {
    throw Error("Threshold must be between -75 and -10 dBFS.");
  }
  if (!Number.isInteger(minQuietMs) || minQuietMs < 100 || minQuietMs > 3000) {
    throw Error("Minimum quiet hold must be between 100 and 3000 ms.");
  }
  return {frameMs,thresholdDb,minQuietMs};
}

export function analyzePcm(samples, sampleRate, settings = {}) {
  const {frameMs,thresholdDb,minQuietMs} = validateAudioSettings(settings);
  if (!(samples instanceof Float32Array) || samples.length === 0) throw Error("Decoded audio samples are required.");
  if (!Number.isInteger(sampleRate) || sampleRate < 8000 || sampleRate > 192000) throw Error("Unsupported sample rate.");
  const duration = samples.length / sampleRate;
  if (duration > AUDIO_DURATION_LIMIT_SECONDS) throw Error("Audio exceeds the 10-minute analysis limit.");
  const frameLength = Math.max(1, Math.round(sampleRate * frameMs / 1000));
  const nFrames = Math.ceil(samples.length/frameLength);
  const frames = [];
  const threshold = Math.pow(10,thresholdDb/20);
  let totalSquare = 0;
  let peak = 0;
  let lowStart = -1;
  const quietIntervals = [];
  let lowSeconds = 0;
  for (let frameIndex = 0; frameIndex < nFrames; frameIndex++) {
    const startIndex = frameIndex * frameLength;
    const endIndex = Math.min(samples.length,startIndex+frameLength);
    const count = endIndex-startIndex;
    let square = 0;
    let framePeak = 0;
    for (let j=startIndex;j<endIndex;j++) {
      const v = samples[j];
      if (!Number.isFinite(v)) throw Error("Decoded sample contains non-finite audio data.");
      square += v*v;
      framePeak = Math.max(framePeak,Math.abs(v));
    }
    totalSquare += square;
    peak = Math.max(peak,framePeak);
    const rms = Math.sqrt(square/count);
    const from = startIndex/sampleRate;
    const to = endIndex/sampleRate;
    const quiet = rms <= threshold;
    frames.push({from,to,rms,peak:framePeak,quiet});
    if (quiet && lowStart < 0) lowStart = from;
    if ((!quiet || frameIndex === nFrames-1) && lowStart >= 0) {
      const quietEnd = quiet ? to : from;
      const quietDuration = quietEnd-lowStart;
      if (quietDuration >= minQuietMs/1000-1e-9) {
        const interval = {start:round3(lowStart),end:round3(quietEnd),duration:round3(quietDuration)};
        quietIntervals.push(interval);
        lowSeconds += quietDuration;
      }
      lowStart = -1;
    }
  }
  return {
    durationSeconds:round3(duration),
    sampleRate,
    frameMs,
    thresholdDb,
    minQuietMs,
    frames,
    quietIntervals,
    quietSeconds:round3(lowSeconds),
    quietPercent:Math.round((lowSeconds/duration)*100),
    rms:Math.sqrt(totalSquare/samples.length),
    peak
  };
}
function round3(n){return Math.round(n*1000)/1000;}

export function compressWaveform(frames, maxBins=1000){
  if(!Array.isArray(frames))throw Error("Frames required.");
  if(!Number.isInteger(maxBins)||maxBins<1||maxBins>3000)throw Error("Invalid waveform resolution.");
  if(frames.length===0)return [];
  const bins=[];
  const nBins=Math.min(frames.length,maxBins);
  for(let i=0;i<nBins;i++){
    const start=Math.floor(i*frames.length/nBins);
    const end=Math.max(start+1,Math.floor((i+1)*frames.length/nBins));
    let max=0,avg=0;
    for(let j=start;j<end;j++){
      max=Math.max(max,frames[j].peak);
      avg+=frames[j].rms;
    }
    bins.push({start:frames[start].from,end:frames[end-1].to,peak:max,rms:avg/(end-start)});
  }
  return bins;
}

export function intervalOverlap(a,b){
  if(!a||!b)return 0;
  return Math.max(0,Math.min(a.end,b.end)-Math.max(a.start,b.start));
}

// Acoustic quiet is NOT the same thing as comedic silence. This merely compares
// time windows, given an explicit assumption that both sequences start at t=0.
export function compareToRhythm(analysis,rhythm){
  if(!analysis||!rhythm||!Array.isArray(analysis.quietIntervals))throw Error("Audio analysis and rhythm annotation are required.");
  const annotated = buildTimingRows(rhythm).filter(s=>s.phase==="silence");
  const annotatedSeconds = annotated.reduce((sum,s)=>sum+s.duration,0);
  let overlapSeconds = 0;
  for(const row of annotated)for(const quiet of analysis.quietIntervals)overlapSeconds+=intervalOverlap({start:row.start,end:row.end},quiet);
  const manualTotal=summarizeRhythm(rhythm).totalSeconds;
  return {
    manualDuration:manualTotal,
    audioDuration:analysis.durationSeconds,
    durationDifference:round3(manualTotal-analysis.durationSeconds),
    annotatedSilenceSeconds:round3(annotatedSeconds),
    overlapSeconds:round3(overlapSeconds),
    annotatedSilenceOverlapPercent:annotatedSeconds?Math.round(overlapSeconds/annotatedSeconds*100):null,
    timelineFitsAudio:manualTotal<=analysis.durationSeconds+0.05,
    annotated
  };
}

export function serializableAudioReport(analysis,rhythm=null,filename=""){
  if(!analysis||!Array.isArray(analysis.quietIntervals))throw Error("Analysis required.");
  const compare=rhythm?compareToRhythm(analysis,rhythm):null;
  return {
    kind:"ComedyAtlasAudioAnalysis",
    schemaVersion:1,
    generatedAt:new Date().toISOString(),
    fileLabel:String(filename).slice(0,200),
    privacy:"Derived signal features only. No source audio included.",
    method:"Per-frame root-mean-square amplitude, relative to full scale (dBFS). Not speech detection, laughter recognition, or humor scoring.",
    sampleRate:analysis.sampleRate,
    durationSeconds:analysis.durationSeconds,
    settings:{frameMs:analysis.frameMs,thresholdDb:analysis.thresholdDb,minQuietMs:analysis.minQuietMs},
    rms:Math.round(analysis.rms*100000)/100000,
    peak:Math.round(analysis.peak*100000)/100000,
    quietSeconds:analysis.quietSeconds,
    quietPercent:analysis.quietPercent,
    quietIntervals:analysis.quietIntervals.map(q=>({...q})),
    comparison:compare?{...compare,annotated:compare.annotated.map(s=>({start:s.start,end:s.end,phase:s.phase}))}:null
  };
}
