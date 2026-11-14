import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const read=(path)=>readFileSync(new URL("../"+path,import.meta.url),"utf8");
const html=read("index.html");
const rhythm=read("src/rhythm-studio.mjs");
const app=read("src/app.mjs");

test("HTML ids remain unique as the UI expands",()=>{
  const ids=[...html.matchAll(/\\bid="([^"]+)"/g)].map(x=>x[1]);
  assert.equal(new Set(ids).size,ids.length,"Duplicate HTML ids found.");
});

test("every rhythm editor target is represented in HTML",()=>{
  const references=[...rhythm.matchAll(/\\$\\("([^"]+)"\\)/g)].map(x=>x[1]);
  const ids=new Set([...html.matchAll(/\\bid="([^"]+)"/g)].map(x=>x[1]));
  for(const id of references)assert.ok(ids.has(id),"Missing rhythm control: "+id);
});

test("rhythm engine mounts and receives source updates from Observation Studio",()=>{
  assert.ok(app.includes('import { mountRhythm } from "./rhythm-studio.mjs"'));
  assert.ok(app.includes("const rhythm = mountRhythm(state.atlas"));
  assert.ok(app.includes("rhythm.updateReferences()"));
  assert.ok(html.includes('href="#rhythm"'));
});
