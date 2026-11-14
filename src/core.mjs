export const MECHANISM_IDS = ["timing","escalation","absurdity","character","friction","deadpan","repetition","shock","musicality"];

export function clampWeight(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.min(5, Math.max(0, number)) : 0;
}

export function vectorFor(profile, ids = MECHANISM_IDS) {
  return ids.map((id) => clampWeight(profile?.weights?.[id]));
}

// Cosine similarity is a visualization convenience, NOT an empirical measure of humor or people.
export function similarity(a, b, ids = MECHANISM_IDS) {
  const av = vectorFor(a, ids);
  const bv = vectorFor(b, ids);
  const dot = av.reduce((sum, v, i) => sum + v * bv[i], 0);
  const aNorm = Math.hypot(...av);
  const bNorm = Math.hypot(...bv);
  return aNorm === 0 || bNorm === 0 ? 0 : Math.round((100 * dot) / (aNorm * bNorm));
}

export function topTraits(profile, count = 3, ids = MECHANISM_IDS) {
  return ids.map((id) => ({id, value: clampWeight(profile?.weights?.[id])}))
    .sort((a, b) => b.value - a.value || ids.indexOf(a.id) - ids.indexOf(b.id))
    .slice(0, Math.max(0, count));
}

export function filterMoments(moments, query = "", mechanism = "all") {
  const needle = String(query).toLocaleLowerCase().trim();
  return moments.filter((item) => {
    if (mechanism !== "all" && !item.mechanisms?.includes(mechanism)) return false;
    const haystack = [item.title,item.source,item.medium,item.description,...(item.mechanisms || [])].join(" ").toLocaleLowerCase();
    return !needle || haystack.includes(needle);
  });
}

export function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (c) => ({
    "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;"
  })[c]);
}

export function validateAtlas(atlas) {
  if (!atlas || !Array.isArray(atlas.mechanisms) || !Array.isArray(atlas.profiles) || !Array.isArray(atlas.moments)) return false;
  const ids = new Set(atlas.mechanisms.map((m) => m.id));
  return MECHANISM_IDS.every((id) => ids.has(id))
    && atlas.profiles.every((p) => p.id && p.weights && MECHANISM_IDS.every((id) => Number.isInteger(p.weights[id]) && p.weights[id] >= 0 && p.weights[id] <= 5))
    && atlas.moments.every((m) => Array.isArray(m.mechanisms) && m.mechanisms.every((id) => ids.has(id)));
}
