import test from "node:test";
import assert from "node:assert/strict";
import { MECHANISM_IDS, clampWeight, vectorFor, similarity, topTraits, filterMoments, escapeHtml, validateAtlas } from "../src/core.mjs";
import atlas from "../data/atlas.json" with {type:"json"};

test("seed data passes basic structural checks", () => {
  assert.equal(validateAtlas(atlas), true);
  assert.equal(atlas.mechanisms.length, 9);
  assert.equal(new Set(atlas.mechanisms.map((x) => x.id)).size, 9);
  assert.equal(new Set(atlas.profiles.map((x) => x.id)).size, atlas.profiles.length);
  assert.equal(new Set(atlas.moments.map((x) => x.id)).size, atlas.moments.length);
  assert.ok(atlas.moments.every((m) => atlas.profiles.some((p) => p.id === m.profileId)));
});

test("weights are clamped and invalid weights become zero", () => {
  assert.equal(clampWeight(-3),0);
  assert.equal(clampWeight(15),5);
  assert.equal(clampWeight("not a number"),0);
  assert.deepEqual(vectorFor({weights:{timing:8,escalation:-1}}).slice(0,2),[5,0]);
});

test("similarity is symmetric and bounded", () => {
  const [a,b] = atlas.profiles;
  assert.equal(similarity(a,a),100);
  assert.equal(similarity(a,b),similarity(b,a));
  assert.ok(similarity(a,b)>=0 && similarity(a,b)<=100);
  const zero = {weights:{}};
  assert.equal(similarity(a,zero),0);
  const x = {weights:{timing:5}}, y = {weights:{escalation:5}};
  assert.equal(similarity(x,y),0);
});

test("top traits preserve deterministic order on ties", () => {
  const traits = topTraits({weights:{timing:5,escalation:5}},2);
  assert.deepEqual(traits.map((t) => t.id),MECHANISM_IDS.slice(0,2));
});

test("search supports query and mechanism filtering", () => {
  assert.ok(filterMoments(atlas.moments,"coffin").some((m) => m.id === "coffin"));
  assert.ok(filterMoments(atlas.moments,"", "musicality").every((m) => m.mechanisms.includes("musicality")));
  assert.equal(filterMoments(atlas.moments,"NONEXISTENTSTRING").length,0);
});

test("HTML output escapes arbitrary content", () => {
  assert.equal(escapeHtml('<img src=x onerror="a&b">'),"&lt;img src=x onerror=&quot;a&amp;b&quot;&gt;");
});

test("invalid data is rejected", () => {
  assert.equal(validateAtlas(null),false);
  const bad = structuredClone(atlas);
  bad.profiles[0].weights.timing = 99;
  assert.equal(validateAtlas(bad),false);
});
