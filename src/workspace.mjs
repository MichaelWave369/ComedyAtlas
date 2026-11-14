import { MECHANISM_IDS } from "./core.mjs";

export const WORKSPACE_KEY = "comedyatlas.observations.v1";
export const WORKSPACE_KIND = "ComedyAtlasPersonalObservations";
export const WORKSPACE_VERSION = 1;
export const MAX_OBSERVATIONS = 250;
export const MAX_IMPORT_BYTES = 1024 * 1024;

function nonemptyString(value, name, max, optional = false) {
  if (typeof value !== "string") throw new Error(name + " must be text.");
  const text = value.trim();
  if ((!optional && !text) || text.length > max) {
    throw new Error(name + " must be " + (optional ? "at most " : "1 to ") + max + " characters.");
  }
  return text;
}

export function normalizeObservation(raw, allowedProfiles) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("Observation must be an object.");
  if (!(allowedProfiles instanceof Set)) throw new Error("Allowed profile IDs are required.");
  const id = nonemptyString(raw.id, "ID", 60);
  if (!/^local-[a-zA-Z0-9-]{8,54}$/.test(id)) throw new Error("Invalid local observation ID.");
  const profileId = nonemptyString(raw.profileId, "Profile", 80);
  if (!allowedProfiles.has(profileId)) throw new Error("Unknown profile: " + profileId);
  const scores = {};
  if (!raw.scores || typeof raw.scores !== "object" || Array.isArray(raw.scores)) throw new Error("Missing score vector.");
  for (const signal of MECHANISM_IDS) {
    const score = raw.scores[signal];
    if (!Number.isInteger(score) || score < 0 || score > 5) throw new Error("Scores must be whole numbers from 0 to 5.");
    scores[signal] = score;
  }
  if (!Object.values(scores).some((v) => v > 0)) throw new Error("Choose at least one active humor signal.");
  const sourceUrl = nonemptyString(raw.sourceUrl ?? "", "Source URL", 2048, true);
  if (sourceUrl) {
    let parsed;
    try { parsed = new URL(sourceUrl); } catch { throw new Error("Source URL must be a valid web address."); }
    if (!["https:","http:"].includes(parsed.protocol) || parsed.username || parsed.password) {
      throw new Error("Source URL must be a normal http(s) address without embedded credentials.");
    }
  }
  const timestamp = nonemptyString(raw.timestamp ?? "", "Source timestamp", 16, true);
  if (timestamp && !/^(?:\d{1,3}:)?[0-5]?\d:[0-5]\d$/.test(timestamp)) {
    throw new Error("Timestamp must be MM:SS or HH:MM:SS.");
  }
  const createdAt = nonemptyString(raw.createdAt, "Created at", 50);
  const date = new Date(createdAt);
  if (!Number.isFinite(date.valueOf()) || date.toISOString() !== createdAt) throw new Error("Invalid creation date.");
  return {
    id,
    title: nonemptyString(raw.title, "Title", 120),
    source: nonemptyString(raw.source, "Source / show", 160),
    profileId,
    medium: nonemptyString(raw.medium, "Medium", 40),
    description: nonemptyString(raw.description, "Observation", 1200),
    sourceUrl,
    timestamp,
    scores,
    createdAt
  };
}

export function parseWorkspace(jsonText, allowedProfiles) {
  if (typeof jsonText !== "string" || jsonText.length > MAX_IMPORT_BYTES) throw new Error("File exceeds 1 MB limit.");
  let data;
  try { data = JSON.parse(jsonText); } catch { throw new Error("Not valid JSON."); }
  if (!data || data.kind !== WORKSPACE_KIND || data.schemaVersion !== WORKSPACE_VERSION || !Array.isArray(data.observations)) {
    throw new Error("Unsupported ComedyAtlas observation backup (expected schema version 1).");
  }
  if (data.observations.length > MAX_OBSERVATIONS) throw new Error("Too many observations (limit 250).");
  const observations = data.observations.map((entry) => normalizeObservation(entry, allowedProfiles));
  const ids = observations.map((item) => item.id);
  if (new Set(ids).size !== ids.length) throw new Error("Duplicate IDs in imported file.");
  return observations;
}

export function serializeWorkspace(observations) {
  return JSON.stringify({
    kind: WORKSPACE_KIND,
    schemaVersion: WORKSPACE_VERSION,
    exportedAt: new Date().toISOString(),
    observations
  }, null, 2) + "\n";
}

export function mergeWorkspace(existing, imported) {
  const byId = new Map(existing.map((item) => [item.id, item]));
  for (const entry of imported) if (!byId.has(entry.id)) byId.set(entry.id, entry);
  if (byId.size > MAX_OBSERVATIONS) throw new Error("Combined notebook exceeds 250 observations.");
  return [...byId.values()].sort((a,b) => b.createdAt.localeCompare(a.createdAt) || a.id.localeCompare(b.id));
}

export function deriveObservedProfile(profile, observations) {
  const matching = observations.filter((entry) => entry.profileId === profile?.id);
  if (!matching.length) return null;
  const weights = Object.fromEntries(MECHANISM_IDS.map((id) => [
    id, Math.round(10 * matching.reduce((sum, entry) => sum + entry.scores[id], 0) / matching.length) / 10
  ]));
  return {...profile, weights, sampleCount: matching.length, note: "Personal observations; " + matching.length + " annotated moment(s). A small sample is not a definitive style signature."};
}

export function observationToMoment(entry) {
  return {
    id: entry.id,
    title: entry.title,
    source: entry.source,
    profileId: entry.profileId,
    medium: "Personal observation · " + entry.medium,
    description: entry.description,
    mechanisms: MECHANISM_IDS.filter((id) => entry.scores[id] > 0),
    personal: true,
    sourceUrl: entry.sourceUrl,
    timestamp: entry.timestamp
  };
}
