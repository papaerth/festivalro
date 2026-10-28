// API smoke test: exercises the whole studio flow against a running server.
// Usage: BASE_URL=http://localhost:3100 node scripts/smoke-test.mjs
const BASE = process.env.BASE_URL || "http://localhost:3100";
let failures = 0;
const ok = (cond, msg) => {
  if (cond) console.log(`  ✓ ${msg}`);
  else { failures++; console.error(`  ✗ ${msg}`); }
};
const api = async (path, init = {}) => {
  const res = await fetch(BASE + path, { headers: { "Content-Type": "application/json" }, ...init });
  let body = null;
  try { body = await res.json(); } catch { body = null; }
  return { status: res.status, body };
};

console.log(`LUMEROVIA smoke test → ${BASE}`);
{
  const h = await api("/api/health");
  ok(h.status === 200 && h.body?.ok, `health ok (mode=${h.body?.mode})`);
}
let presets;
{
  const r = await api("/api/presets");
  presets = r.body?.presets ?? [];
  ok(r.status === 200 && presets.length >= 6, `presets seeded (${presets.length})`);
  const def = presets.find((p) => p.isDefault);
  ok(def?.key === "C", `default preset is C (${def?.name})`);
  ok(["C", "A", "B", "C1", "C2", "C3"].every((k) => presets.some((p) => p.key === k)), "C/A/B/C1/C2/C3 all present");
}
let project;
{
  const r = await api("/api/projects", { method: "POST", body: "{}" });
  project = r.body?.project;
  ok(r.status === 201 && project?.id, `project created ${project?.id}`);
  ok(project?.styleKey === "C" && project?.genre === "Cinematic Nostalgic Soft Rock", "new project defaults to C style");
}
const id = project.id;
const reference = `[Verse 1]\nThe road still bends the way it did / when we were young\nI counted every step we hid / beneath the sun\n\n[Chorus]\nWhere the old road bends\nThat's where I find you still\nEvery song the wind has learned\nComes back across the hill`;
{
  const r = await api(`/api/projects/${id}`, { method: "PATCH", body: JSON.stringify({ referenceLyrics: reference, referenceRights: "own", emotion: "nostalgia" }) });
  ok(r.status === 200 && r.body?.project?.referenceLyrics === reference, "autosave PATCH persists reference lyrics");
}
{
  const r = await api("/api/ai/analyze", { method: "POST", body: JSON.stringify({ lyrics: reference }) });
  const a = r.body?.analysis;
  ok(r.status === 200 && a, "analysis returned");
  ok(a?.structure?.includes("Verse 1") && a?.structure?.includes("Chorus"), `structure detected: ${a?.structure?.join(" → ")}`);
  const l0 = a?.lines?.find((l) => !l.isBlank);
  ok(l0?.syllables > 0 && l0?.words > 0 && l0?.stress, `line analysis: ${l0?.syllables} syl, ${l0?.words} words, stress "${l0?.stress}"`);
  ok(l0?.slashPositions?.length === 1, `slash position detected (${JSON.stringify(l0?.slashPositions)})`);
  ok(a?.mood?.length > 0 && a?.difficultyKo, `mood=${a?.moodKo}, difficulty=${a?.difficultyKo}`);
}
let titles;
{
  const r = await api("/api/ai/titles", { method: "POST", body: JSON.stringify({ emotion: "nostalgia", count: 12, referenceLyrics: reference }) });
  titles = r.body?.titles ?? [];
  ok(r.status === 200 && titles.length >= 10 && titles.length <= 20, `titles generated (${titles.length}, source=${r.body?.source})`);
  const t = titles[0];
  ok(t?.title && t?.titleKo && t?.story && t?.vocal && t?.genre && t?.landscape, `title fields complete: "${t?.title}" / ${t?.titleKo} / ${t?.landscape}`);
  ok(t?.story.length >= 100, `story length ~200자 (${t?.story.length})`);
}
const chosen = titles[0];
{
  const r = await api(`/api/projects/${id}`, { method: "PATCH", body: JSON.stringify({ title: chosen.title, titleKo: chosen.titleKo, story: chosen.story, vocal: chosen.vocal, genre: chosen.genre, landscape: chosen.landscape, titleCandidates: titles }) });
  ok(r.status === 200 && r.body?.project?.title === chosen.title && r.body?.project?.titleCandidates?.length === titles.length, "title selection saved with candidates");
  const v = await api(`/api/projects/${id}/versions`, { method: "POST", body: JSON.stringify({ label: `제목 선택: ${chosen.title}` }) });
  ok(v.status === 201, "version snapshot created");
}
let lyrics;
{
  const r = await api("/api/ai/lyrics", { method: "POST", body: JSON.stringify({ title: chosen.title, titleKo: chosen.titleKo, story: chosen.story, emotion: "nostalgia", vocal: chosen.vocal, genre: chosen.genre, landscape: chosen.landscape, referenceLyrics: reference, referenceRights: "own" }) });
  lyrics = r.body?.lyrics;
  ok(r.status === 200 && typeof lyrics === "string" && lyrics.length > 200, `lyrics generated (${lyrics?.length} chars, source=${r.body?.source})`);
  ok(/\[Chorus\]/i.test(lyrics) && /\[Verse 1\]/i.test(lyrics), "lyrics have [Verse 1] and [Chorus] sections");
  ok(lyrics?.includes(chosen.title), "chorus contains the title");
  await api(`/api/projects/${id}`, { method: "PATCH", body: JSON.stringify({ lyrics, status: "lyrics_done" }) });
}
{
  const r = await api("/api/ai/compare", { method: "POST", body: JSON.stringify({ reference, target: lyrics }) });
  ok(r.status === 200 && typeof r.body?.comparison?.score === "number", `precision comparison score=${r.body?.comparison?.score}%`);
}
{
  const selection = lyrics.split("\n").filter((l) => l.trim() && !l.startsWith("[")).slice(0, 2).join("\n");
  const r = await api("/api/ai/rewrite", { method: "POST", body: JSON.stringify({ lyrics, selection, instruction: "more vivid", title: chosen.title, story: chosen.story, keepSyllables: true }) });
  const rep = r.body?.replacement;
  ok(r.status === 200 && rep && rep.split("\n").length === selection.split("\n").length, `partial rewrite keeps line count (${selection.split("\n").length} lines, source=${r.body?.source})`);
}
let styles;
{
  const r = await api("/api/ai/styles", { method: "POST", body: JSON.stringify({ lyrics, title: chosen.title, emotion: "nostalgia", vocal: chosen.vocal, refine: true }) });
  styles = r.body?.styles ?? [];
  ok(r.status === 200 && styles.length >= 3, `styles generated (${styles.length}, source=${r.body?.source})`);
  ok(styles[0]?.key === "C" && styles[1]?.key === "A" && styles[2]?.key === "B", `order is C, A, B (${styles.slice(0, 3).map((s) => s.key).join(",")})`);
  const c = styles[0];
  ok(["genre", "vocal", "bpm", "timeSig", "instruments", "emotion", "arrangement", "chorusBuild", "mixing", "length"].every((k) => c?.[k] !== undefined && c?.[k] !== ""), "C style has all 10 fields");
  ok(/BPM/.test(c?.prompt) && /under 3 minutes/.test(c?.prompt) && /baritone/.test(c?.prompt), `C prompt: "${c?.prompt?.slice(0, 90)}…"`);
  ok(c?.excludes?.length > 10, "exclusions present");
  const r2 = await api(`/api/projects/${id}`, { method: "PATCH", body: JSON.stringify({ styleOptions: styles, styleKey: c.key, stylePrompt: c.prompt, excludeStyles: c.excludes, bpm: c.bpm, status: "ready" }) });
  ok(r2.status === 200 && r2.body?.project?.styleOptions?.length === styles.length && r2.body?.project?.stylePrompt === c.prompt, "style selection persisted");
}
{
  const r = await api("/api/ai/video", { method: "POST", body: JSON.stringify({ title: chosen.title, story: chosen.story, lyrics, landscape: chosen.landscape }) });
  ok(r.status === 200 && r.body?.concept?.includes("섹션별"), `video concept generated (source=${r.body?.source})`);
}
{
  const list = await api(`/api/projects/${id}/versions`);
  const versions = list.body?.versions ?? [];
  ok(versions.length >= 2, `versions listed (${versions.length})`);
  const first = versions[versions.length - 1]; // oldest = 프로젝트 생성
  const r = await api(`/api/projects/${id}/versions/${first.id}/restore`, { method: "POST" });
  ok(r.status === 200 && r.body?.project?.title === "", "restore to initial version clears title");
  const list2 = await api(`/api/projects/${id}/versions`);
  ok(list2.body?.versions?.some((v) => v.label === "복원 전 자동 백업"), "restore created an automatic backup version");
  const backup = list2.body.versions.find((v) => v.label === "복원 전 자동 백업");
  const r3 = await api(`/api/projects/${id}/versions/${backup.id}/restore`, { method: "POST" });
  ok(r3.body?.project?.title === chosen.title && r3.body?.project?.lyrics === lyrics, "restoring backup brings the song back");
}
{
  const r = await api(`/api/projects/${id}/duplicate`, { method: "POST" });
  ok(r.status === 201 && r.body?.project?.id !== id && r.body?.project?.title === `${chosen.title} (Copy)`, "duplicate project");
  await api(`/api/projects/${r.body.project.id}`, { method: "DELETE" });
}
{
  const r = await api("/api/presets", { method: "POST", body: JSON.stringify({ key: "TEST", name: "Smoke Test Preset", nameKo: "테스트", prompt: "Test prompt, approximately 70 BPM, under 3 minutes.", bpm: 70 }) });
  ok(r.status === 201 && r.body?.preset?.key === "TEST", "custom preset created");
  const pid = r.body?.preset?.id;
  const u = await api(`/api/presets/${pid}`, { method: "PATCH", body: JSON.stringify({ prompt: "Edited prompt, under 3 minutes." }) });
  ok(u.status === 200 && u.body?.preset?.prompt.startsWith("Edited"), "custom preset edited");
  const s = await api("/api/ai/styles", { method: "POST", body: JSON.stringify({ lyrics, title: chosen.title, emotion: "love", refine: false }) });
  ok(s.body?.styles?.some((x) => x.key === "TEST"), "custom preset appears in generated style options");
  const d = await api(`/api/presets/${pid}`, { method: "DELETE" });
  ok(d.status === 200, "custom preset deleted");
  const builtin = presets.find((p) => p.key === "C");
  const bd = await api(`/api/presets/${builtin.id}`, { method: "DELETE" });
  ok(bd.status === 400, "builtin preset cannot be deleted");
}
{
  const r = await api(`/api/projects/${id}`, { method: "DELETE" });
  ok(r.status === 200, "project deleted (cleanup)");
  const g = await api(`/api/projects/${id}`);
  ok(g.status === 404, "deleted project returns 404");
}
console.log(failures ? `\n${failures} FAILED` : "\nALL PASSED");
process.exit(failures ? 1 : 0);
