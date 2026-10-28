"use client";
import { useState } from "react";
import type { PresetDTO } from "@/lib/types";
import { VOCAL_OPTIONS } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";
import { Check, Plus, RotateCcw, Save, Star, Trash2 } from "lucide-react";

type Draft = Partial<PresetDTO>;

export function PresetManager({ initial }: { initial: PresetDTO[] }) {
  const [presets, setPresets] = useState<PresetDTO[]>(initial);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [newPreset, setNewPreset] = useState<Draft>({ key: "", name: "", nameKo: "", description: "", prompt: "", excludes: "", bpm: 76, timeSig: "4/4", vocal: VOCAL_OPTIONS[0], genreTags: "" });

  const flash = (m: string) => {
    setMsg(m);
    setTimeout(() => setMsg(null), 2500);
  };

  const edit = (id: string, patch: Draft) => setDrafts((d) => ({ ...d, [id]: { ...d[id], ...patch } }));
  const valueOf = <K extends keyof PresetDTO>(p: PresetDTO, k: K): PresetDTO[K] => (drafts[p.id]?.[k] as PresetDTO[K] | undefined) ?? p[k];

  const save = async (p: PresetDTO) => {
    const patch = drafts[p.id];
    if (!patch) return;
    setBusy(p.id);
    try {
      const res = await fetch(`/api/presets/${p.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch) });
      const data = (await res.json()) as { preset?: PresetDTO; error?: string };
      if (!res.ok || !data.preset) throw new Error(data.error ?? "저장 실패");
      setPresets((ps) => ps.map((x) => (x.id === p.id ? data.preset! : x)));
      setDrafts((d) => { const { [p.id]: _omit, ...rest } = d; void _omit; return rest; });
      flash(`"${data.preset.name}" 저장됨`);
    } catch (e) {
      flash(e instanceof Error ? e.message : "저장 실패");
    } finally {
      setBusy(null);
    }
  };

  const setDefault = async (p: PresetDTO) => {
    setBusy(p.id);
    try {
      const res = await fetch(`/api/presets/${p.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ isDefault: true }) });
      if (!res.ok) throw new Error("기본값 설정 실패");
      setPresets((ps) => ps.map((x) => ({ ...x, isDefault: x.id === p.id })));
      flash(`"${p.name}"이(가) 기본 스타일로 설정됨`);
    } catch (e) {
      flash(e instanceof Error ? e.message : "실패");
    } finally {
      setBusy(null);
    }
  };

  const reset = async (p: PresetDTO) => {
    if (!confirm(`"${p.name}" 프리셋을 기본 제공 내용으로 되돌릴까요?`)) return;
    setBusy(p.id);
    try {
      const res = await fetch(`/api/presets/reset`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key: p.key }) });
      const data = (await res.json()) as { presets: PresetDTO[] };
      setPresets(data.presets);
      setDrafts((d) => { const { [p.id]: _omit, ...rest } = d; void _omit; return rest; });
      flash("기본값으로 복원됨");
    } finally {
      setBusy(null);
    }
  };

  const remove = async (p: PresetDTO) => {
    if (!confirm(`"${p.name}" 프리셋을 삭제할까요?`)) return;
    setBusy(p.id);
    try {
      const res = await fetch(`/api/presets/${p.id}`, { method: "DELETE" });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "삭제 실패");
      setPresets((ps) => ps.filter((x) => x.id !== p.id));
      flash("삭제됨");
    } catch (e) {
      flash(e instanceof Error ? e.message : "삭제 실패");
    } finally {
      setBusy(null);
    }
  };

  const create = async () => {
    setBusy("new");
    try {
      const res = await fetch(`/api/presets`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(newPreset) });
      const data = (await res.json()) as { preset?: PresetDTO; error?: string };
      if (!res.ok || !data.preset) throw new Error(data.error ?? "추가 실패");
      setPresets((ps) => [...ps, data.preset!]);
      setCreating(false);
      setNewPreset({ key: "", name: "", nameKo: "", description: "", prompt: "", excludes: "", bpm: 76, timeSig: "4/4", vocal: VOCAL_OPTIONS[0], genreTags: "" });
      flash(`"${data.preset.name}" 추가됨`);
    } catch (e) {
      flash(e instanceof Error ? e.message : "추가 실패");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="mt-8 space-y-6">
      {msg && <div className="rounded-md border border-gold-500/40 bg-gold-500/10 px-4 py-2 text-sm text-gold-300" role="status">{msg}</div>}

      {presets.map((p) => {
        const dirty = Boolean(drafts[p.id]);
        return (
          <Card key={p.id} className={p.isDefault ? "border-gold-500/60 shadow-gold" : ""} data-testid={`preset-${p.key}`}>
            <CardHeader className="flex-row items-start justify-between gap-3 space-y-0">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline" className="font-mono">{p.key}</Badge>
                  <CardTitle className="font-serif text-xl">{valueOf(p, "name")}</CardTitle>
                  {p.isDefault && <Badge className="gap-1"><Star className="h-3 w-3" /> 기본값</Badge>}
                  {p.isBuiltin && <Badge variant="muted">기본 제공</Badge>}
                </div>
                <p className="mt-1 text-sm text-gold-300">{valueOf(p, "nameKo")}</p>
              </div>
              <div className="flex flex-wrap justify-end gap-2">
                {!p.isDefault && <Button size="sm" variant="outline" onClick={() => setDefault(p)} disabled={busy === p.id}><Star /> 기본값으로</Button>}
                {p.isBuiltin ? (
                  <Button size="sm" variant="ghost" onClick={() => reset(p)} disabled={busy === p.id}><RotateCcw /> 복원</Button>
                ) : (
                  <Button size="sm" variant="ghost" onClick={() => remove(p)} disabled={busy === p.id}><Trash2 /> 삭제</Button>
                )}
                <Button size="sm" onClick={() => save(p)} disabled={!dirty || busy === p.id}>{busy === p.id ? <Spinner /> : <Save />} 저장</Button>
              </div>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-2">
              <div className="space-y-1.5"><Label>영어 이름</Label><Input value={valueOf(p, "name")} onChange={(e) => edit(p.id, { name: e.target.value })} /></div>
              <div className="space-y-1.5"><Label>한국어 이름</Label><Input value={valueOf(p, "nameKo")} onChange={(e) => edit(p.id, { nameKo: e.target.value })} /></div>
              <div className="space-y-1.5 md:col-span-2"><Label>설명</Label><Textarea rows={2} value={valueOf(p, "description")} onChange={(e) => edit(p.id, { description: e.target.value })} /></div>
              <div className="space-y-1.5 md:col-span-2"><Label>Suno 스타일 프롬프트 (영어)</Label><Textarea rows={4} className="font-mono text-xs leading-relaxed" value={valueOf(p, "prompt")} onChange={(e) => edit(p.id, { prompt: e.target.value })} /></div>
              <div className="space-y-1.5 md:col-span-2"><Label>제외 스타일 (Exclude Styles)</Label><Textarea rows={2} className="font-mono text-xs" value={valueOf(p, "excludes")} onChange={(e) => edit(p.id, { excludes: e.target.value })} /></div>
              <div className="space-y-1.5"><Label>BPM</Label><Input type="number" min={50} max={140} value={valueOf(p, "bpm")} onChange={(e) => edit(p.id, { bpm: Number(e.target.value) })} /></div>
              <div className="space-y-1.5"><Label>박자</Label><Input value={valueOf(p, "timeSig")} onChange={(e) => edit(p.id, { timeSig: e.target.value })} /></div>
              <div className="space-y-1.5"><Label>기본 보컬</Label>
                <Select value={valueOf(p, "vocal")} onChange={(e) => edit(p.id, { vocal: e.target.value })}>
                  {[...VOCAL_OPTIONS, ...(VOCAL_OPTIONS.includes(valueOf(p, "vocal") as never) ? [] : [valueOf(p, "vocal")])].map((v) => <option key={v} value={v}>{v}</option>)}
                </Select>
              </div>
              <div className="space-y-1.5"><Label>장르 태그</Label><Input value={valueOf(p, "genreTags")} onChange={(e) => edit(p.id, { genreTags: e.target.value })} /></div>
            </CardContent>
          </Card>
        );
      })}

      {creating ? (
        <Card className="border-dashed">
          <CardHeader><CardTitle className="font-serif text-xl">새 프리셋</CardTitle></CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2">
            <div className="space-y-1.5"><Label>키 (예: D, C4)</Label><Input value={newPreset.key ?? ""} onChange={(e) => setNewPreset({ ...newPreset, key: e.target.value })} placeholder="비우면 자동 생성" /></div>
            <div className="space-y-1.5"><Label>영어 이름 *</Label><Input value={newPreset.name ?? ""} onChange={(e) => setNewPreset({ ...newPreset, name: e.target.value })} /></div>
            <div className="space-y-1.5"><Label>한국어 이름</Label><Input value={newPreset.nameKo ?? ""} onChange={(e) => setNewPreset({ ...newPreset, nameKo: e.target.value })} /></div>
            <div className="space-y-1.5"><Label>BPM</Label><Input type="number" value={newPreset.bpm ?? 76} onChange={(e) => setNewPreset({ ...newPreset, bpm: Number(e.target.value) })} /></div>
            <div className="space-y-1.5 md:col-span-2"><Label>설명</Label><Textarea rows={2} value={newPreset.description ?? ""} onChange={(e) => setNewPreset({ ...newPreset, description: e.target.value })} /></div>
            <div className="space-y-1.5 md:col-span-2"><Label>Suno 스타일 프롬프트 (영어) *</Label><Textarea rows={4} className="font-mono text-xs" value={newPreset.prompt ?? ""} onChange={(e) => setNewPreset({ ...newPreset, prompt: e.target.value })} /></div>
            <div className="space-y-1.5 md:col-span-2"><Label>제외 스타일</Label><Textarea rows={2} className="font-mono text-xs" value={newPreset.excludes ?? ""} onChange={(e) => setNewPreset({ ...newPreset, excludes: e.target.value })} /></div>
            <div className="space-y-1.5"><Label>기본 보컬</Label>
              <Select value={newPreset.vocal ?? ""} onChange={(e) => setNewPreset({ ...newPreset, vocal: e.target.value })}>{VOCAL_OPTIONS.map((v) => <option key={v} value={v}>{v}</option>)}</Select>
            </div>
            <div className="space-y-1.5"><Label>장르 태그</Label><Input value={newPreset.genreTags ?? ""} onChange={(e) => setNewPreset({ ...newPreset, genreTags: e.target.value })} /></div>
            <div className="flex gap-2 md:col-span-2">
              <Button onClick={create} disabled={busy === "new" || !newPreset.name || !newPreset.prompt}>{busy === "new" ? <Spinner /> : <Check />} 추가</Button>
              <Button variant="ghost" onClick={() => setCreating(false)}>취소</Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Button variant="outline" size="lg" onClick={() => setCreating(true)} data-testid="add-preset"><Plus /> 새 프리셋 추가</Button>
      )}
    </div>
  );
}
