import { MECHANISM_IDS, escapeHtml } from "./core.mjs";
import {
  WORKSPACE_KEY, MAX_OBSERVATIONS, MAX_IMPORT_BYTES, normalizeObservation,
  parseWorkspace, serializeWorkspace, mergeWorkspace
} from "./workspace.mjs";

const $ = (id) => document.getElementById(id);
const h = (value) => escapeHtml(value ?? "");

function localId() {
  if (globalThis.crypto?.randomUUID) return "local-" + crypto.randomUUID();
  return "local-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2,12);
}

export function mountStudio(atlas, onUpdate) {
  const allowedProfiles = new Set(atlas.profiles.map((p) => p.id));
  let observations = [];
  const form = $("observation-form");
  const status = $("studio-status");
  const tell = (message, isError = false) => {
    status.textContent = message;
    status.dataset.error = String(isError);
  };

  function render() {
    $("studio-count").textContent = observations.length + " / " + MAX_OBSERVATIONS + " personal observations";
    $("studio-list").innerHTML = observations.length
      ? observations.map((entry) =>
          '<article class="saved-observation"><div><span class="micro-label">' + h(entry.medium) + ' · ' + h(entry.createdAt.slice(0,10)) + '</span>'
          + '<h4>' + h(entry.title) + '</h4><p>' + h(entry.source) + ' · ' + h(atlas.profiles.find((p) => p.id === entry.profileId)?.name || "") + '</p>'
          + '<div class="tags">' + MECHANISM_IDS.filter((id) => entry.scores[id] > 0).map((id) =>
            '<span class="tag">' + h(atlas.mechanisms.find((m) => m.id === id)?.short || id) + ' ' + entry.scores[id] + '</span>'
          ).join("") + '</div></div><button class="secondary-button remove-entry" type="button" data-id="' + h(entry.id) + '" aria-label="Remove ' + h(entry.title) + '">Remove</button></article>'
        ).join("")
      : '<p class="empty">No observations yet. Start with a moment that made you laugh.</p>';
    onUpdate([...observations]);
  }

  function commit(next, successMessage) {
    observations = next;
    try {
      localStorage.setItem(WORKSPACE_KEY, serializeWorkspace(observations));
      tell(successMessage);
    } catch {
      tell("Saved in this tab only. Browser storage is unavailable; export a backup before leaving.", true);
    }
    render();
  }

  const profileSelect = $("studio-profile");
  for (const profile of atlas.profiles) {
    const option = document.createElement("option");
    option.value = profile.id;
    option.textContent = profile.name;
    profileSelect.appendChild(option);
  }

  const scoreControls = $("studio-scores");
  for (const mechanism of atlas.mechanisms) {
    const label = document.createElement("label");
    label.className = "score-field";
    label.setAttribute("for", "studio-score-" + mechanism.id);
    label.textContent = mechanism.name;
    const select = document.createElement("select");
    select.id = "studio-score-" + mechanism.id;
    select.name = mechanism.id;
    for (let i = 0; i <= 5; i++) {
      const option = document.createElement("option");
      option.value = String(i);
      option.textContent = i === 0 ? "0 · absent / not tagged" : i + " · " + (i === 5 ? "dominant" : "prominent");
      select.appendChild(option);
    }
    label.appendChild(select);
    scoreControls.appendChild(label);
  }

  try {
    const raw = localStorage.getItem(WORKSPACE_KEY);
    if (raw !== null) observations = parseWorkspace(raw, allowedProfiles);
    tell("Observations are private to this browser until you export them.");
  } catch (error) {
    tell("Could not read saved observations: " + error.message + ". No stored data was erased.", true);
  }

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    try {
      const raw = {
        id: localId(),
        title: $("studio-title").value,
        source: $("studio-source").value,
        profileId: profileSelect.value,
        medium: $("studio-medium").value,
        description: $("studio-description").value,
        sourceUrl: $("studio-url").value,
        timestamp: $("studio-timestamp").value,
        scores: Object.fromEntries(MECHANISM_IDS.map((id) => [id, Number($("studio-score-" + id).value)])),
        createdAt: new Date().toISOString()
      };
      const entry = normalizeObservation(raw,allowedProfiles);
      commit(mergeWorkspace(observations,[entry]),"Observation added to your local notebook.");
      form.reset();
    } catch (error) { tell(error.message,true); }
  });

  $("studio-list").addEventListener("click", (event) => {
    const button = event.target.closest("button.remove-entry");
    if (!button) return;
    commit(observations.filter((entry) => entry.id !== button.dataset.id),"Observation removed from your notebook.");
  });

  $("studio-export").addEventListener("click", () => {
    const blob = new Blob([serializeWorkspace(observations)],{type:"application/json"});
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "comedyatlas-observations.json";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 3000);
    tell("Backup generated. Keep the downloaded JSON somewhere safe.");
  });

  $("studio-import").addEventListener("change", async (event) => {
    const input = event.currentTarget;
    const file = input.files?.[0];
    if (!file) return;
    try {
      if (file.size > MAX_IMPORT_BYTES) throw new Error("Backup exceeds 1 MB limit.");
      const incoming = parseWorkspace(await file.text(),allowedProfiles);
      const combined = mergeWorkspace(observations,incoming);
      const added = combined.length - observations.length;
      commit(combined,added + " new observation(s) imported. Existing entries were preserved.");
    } catch (error) {
      tell("Import rejected: " + error.message + ". Existing observations were not changed.",true);
    } finally { input.value = ""; }
  });

  $("studio-clear").addEventListener("click", () => {
    if (!observations.length) { tell("Your notebook is already empty."); return; }
    if (window.confirm("Delete all personal observations from this browser? Export first if you want a backup.")) {
      commit([],"Personal notebook cleared in this browser.");
    }
  });
  render();
}
