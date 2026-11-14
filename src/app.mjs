import { MECHANISM_IDS, clampWeight, escapeHtml, filterMoments, similarity, validateAtlas } from "./core.mjs";\nimport { deriveObservedProfile, observationToMoment } from "./workspace.mjs";\nimport { mountStudio } from "./studio.mjs";

const $ = (id) => document.getElementById(id);
const state = { atlas:null, active:"timing", first:"norm", second:"tim", query:"", mechanism:"all", observations:[], signatureMode:"editorial" };

function mechanism(id) { return state.atlas.mechanisms.find((item) => item.id === id); }
function profile(id) { return state.atlas.profiles.find((item) => item.id === id); }
function h(value) { return escapeHtml(value ?? ""); }

function makeNodeButton(item, index, count) {
  const angle = -Math.PI / 2 + (index * Math.PI * 2) / count;
  const button = document.createElement("button");
  button.className = "brain-node";
  button.type = "button";
  button.style.left = (50 + 37 * Math.cos(angle)) + "%";
  button.style.top = (50 + 37 * Math.sin(angle)) + "%";
  button.setAttribute("aria-label", "Explore " + item.name);
  button.dataset.id = item.id;
  const number = document.createElement("span");
  number.className = "index";
  number.textContent = String(index + 1).padStart(2, "0");
  const text = document.createElement("span");
  text.textContent = item.short;
  button.append(number, text);
  button.addEventListener("click", () => { state.active = item.id; renderMechanism(); });
  return button;
}

function renderBrain() {
  const target = $("brain-nodes");
  target.replaceChildren(...state.atlas.mechanisms.map((item, i) => makeNodeButton(item, i, state.atlas.mechanisms.length)));
  renderMechanism();
}

function renderMechanism() {
  const item = mechanism(state.active);
  if (!item) return;
  const index = state.atlas.mechanisms.findIndex((m) => m.id === item.id) + 1;
  $("mechanism-number").textContent = "SIGNAL / " + String(index).padStart(2, "0");
  $("mechanism-name").textContent = item.name;
  $("mechanism-description").textContent = item.description;
  $("mechanism-cues").textContent = item.cues;
  $("mechanism-music").textContent = item.music;
  document.querySelectorAll(".brain-node").forEach((node) => node.setAttribute("aria-pressed", String(node.dataset.id === item.id)));
  const people = [...state.atlas.profiles].filter((p) => clampWeight(p.weights[item.id]) >= 4)
    .sort((a,b) => b.weights[item.id] - a.weights[item.id] || a.name.localeCompare(b.name));
  $("mechanism-people").innerHTML = people.map((p) => '<span class="pill">' + h(p.name) + '</span>').join("") || '<span class="pill">No seed profiles yet</span>';
}

function fillSelect(select, options) {
  select.replaceChildren(...options.map((item) => {
    const opt = document.createElement("option");
    opt.value = item.id;
    opt.textContent = item.name;
    return opt;
  }));
}

function renderSignatures() {
  const a = profile(state.first);
  const b = profile(state.second);
  if (!a || !b) return;
  $("profile-a").value = a.id;
  $("profile-b").value = b.id;
  $("similarity-score").textContent = similarity(a,b) + "%";
  $("signature-bars").innerHTML = state.atlas.mechanisms.map((item) => {
    const x = clampWeight(a.weights[item.id]);
    const y = clampWeight(b.weights[item.id]);
    return '<div class="bar-row"><span>' + h(item.name) + '</span><div class="bar-pair">'
      + '<div class="bar-track" role="meter" aria-label="' + h(a.name + " " + item.name) + '" aria-valuemin="0" aria-valuemax="5" aria-valuenow="' + x + '"><div class="bar-fill a" style="width:' + (x * 20) + '%"></div></div>'
      + '<div class="bar-track" role="meter" aria-label="' + h(b.name + " " + item.name) + '" aria-valuemin="0" aria-valuemax="5" aria-valuenow="' + y + '"><div class="bar-fill b" style="width:' + (y * 20) + '%"></div></div></div><div class="bar-score">' + x + ' / ' + y + '</div></div>';
  }).join("");
  $("signature-notes").innerHTML = [a,b].map((p) => '<div class="note"><strong>' + h(p.name) + '</strong><p>' + h(p.note) + '</p></div>').join("");
}

function renderCatalog() {
  const items = filterMoments(state.atlas.moments,state.query,state.mechanism);
  $("result-count").textContent = items.length + " of " + state.atlas.moments.length + " seed entries";
  $("moment-grid").innerHTML = items.length ? items.map((item) =>
    '<article class="moment"><span class="type">' + h(item.medium) + '</span><h3>' + h(item.title) + '</h3>'
    + '<span class="source">' + h(item.source) + (item.timestamp ? " · " + h(item.timestamp) : "") + '</span><p>' + h(item.description) + '</p>'
    + (item.personal ? '<span class="personal-label">PERSONAL OBSERVATION</span>' : '')
    + (item.sourceUrl ? '<p><a class="source-link" href="' + h(item.sourceUrl) + '" target="_blank" rel="noopener noreferrer">Open source reference ↗</a></p>' : '')
    + '<div class="tags">'
    + item.mechanisms.map((id) => '<span class="tag">' + h(mechanism(id)?.short || id) + '</span>').join("")
    + '</div></article>').join("") : '<p class="empty">No matches. Try another word or signal.</p>';
}

function setup() {
  fillSelect($("profile-a"),state.atlas.profiles);
  fillSelect($("profile-b"),state.atlas.profiles);
  const filter = $("filter");
  state.atlas.mechanisms.forEach((item) => {
    const option = document.createElement("option");
    option.value = item.id;
    option.textContent = item.name;
    filter.appendChild(option);
  });
  $("signature-mode").addEventListener("change", (e) => { state.signatureMode = e.target.value; renderSignatures(); });
  $("profile-a").addEventListener("change",(e) => { state.first = e.target.value; renderSignatures(); });
  $("profile-b").addEventListener("change",(e) => { state.second = e.target.value; renderSignatures(); });
  $("search").addEventListener("input",(e) => { state.query = e.target.value; renderCatalog(); });
  filter.addEventListener("change",(e) => { state.mechanism = e.target.value; renderCatalog(); });
  renderBrain();
  renderSignatures();
  renderCatalog();
}

async function init() {
  try {
    const response = await fetch("./data/atlas.json");
    if (!response.ok) throw new Error("Atlas data could not be loaded (" + response.status + ")");
    state.atlas = await response.json();
    if (!validateAtlas(state.atlas)) throw new Error("Atlas data failed schema checks.");
    setup();
  } catch (error) {
    $("mechanism-name").textContent = "Atlas unavailable";
    $("mechanism-description").textContent = error.message + " Run with a local web server; see README.";
    $("result-count").textContent = "Unable to load catalog.";
  }
}
init();
