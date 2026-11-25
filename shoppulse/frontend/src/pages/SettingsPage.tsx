import { useEffect, useRef, useState } from 'react'
import { api, fmt } from '../api'
import { useAsync } from '../hooks'
import { Badge, ErrorBox, Field, Spinner, useToast } from '../components/ui'
import type { ScoringConfig } from '../types'

export default function SettingsPage() {
  const s = useAsync(() => api.settings())
  const backups = useAsync(() => api.backups())
  const { toast, node } = useToast()
  const [scoring, setScoring] = useState<ScoringConfig | null>(null)
  const [rules, setRules] = useState('')
  const [bands, setBands] = useState('')
  const [slots, setSlots] = useState('')
  const [region, setRegion] = useState('')
  const [refreshLimit, setRefreshLimit] = useState(300)
  const [planLimit, setPlanLimit] = useState(40)
  const [winMin, setWinMin] = useState(90)
  const [winMax, setWinMax] = useState(1095)
  const [lunar, setLunar] = useState('')
  const restoreRef = useRef<HTMLInputElement>(null)
  const [restoreMode, setRestoreMode] = useState<'replace' | 'merge'>('replace')

  useEffect(() => {
    if (!s.data) return
    setScoring(JSON.parse(JSON.stringify(s.data.scoring)))
    setRules(JSON.stringify(s.data.graph_rules, null, 2)); setBands(JSON.stringify(s.data.metric_bands, null, 2)); setSlots(JSON.stringify(s.data.upload_slots, null, 2))
    setRegion(s.data.user.default_region || ''); setRefreshLimit(Number(s.data.user.daily_refresh_limit ?? 300)); setPlanLimit(Number(s.data.user.auto_plan_limit ?? 40)); setWinMin(Number(s.data.user.window_min_age_days ?? 90)); setWinMax(Number(s.data.user.window_max_age_days ?? 1095)); setLunar(JSON.stringify(s.data.user.lunar_holidays || [{ date: '2027-02-06', name: '설날(예시—실제 날짜 확인)' }], null, 1))
  }, [s.data])
  const act = async (fn: () => Promise<any>, ok: string) => { try { await fn(); toast(ok); s.reload(); backups.reload() } catch (e: any) { toast(e.message, 'err') } }
  if (s.error) return <ErrorBox error={s.error} onRetry={s.reload} />
  if (!s.data || !scoring) return <Spinner />
  const env = s.data.env
  const sum = scoring.items.reduce((a, i) => a + Number(i.max || 0), 0)

  return (
    <div className="space-y-5">
      {node}
      <div><h1 className="text-2xl font-bold tracking-tight">설정·백업</h1></div>
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="card p-4 text-sm">
          <h2 className="section-title mb-2">실행 환경 (.env)</h2>
          <ul className="space-y-1">
            <li>포트 <b>{env.port}</b> · 시간대 {env.timezone}</li>
            <li>데이터 폴더 <span className="font-mono text-xs">{env.data_dir}</span></li>
            <li>YouTube API {env.youtube_api_configured ? <Badge tone="green">설정됨</Badge> : <Badge tone="amber">미설정</Badge>}</li>
            <li>AI 기획안 {env.anthropic_configured && env.ai_provider === 'anthropic' ? <Badge tone="green">Claude</Badge> : <Badge tone="gray">템플릿(키 없음)</Badge>}</li>
          </ul>
          <p className="mt-2 text-[11px] muted">키는 shoppulse/.env 파일에서만 설정합니다(화면·저장소에 저장하지 않음). 변경 후 서버 재시작.</p>
          <h2 className="section-title mb-2 mt-4">기본 지역·명절</h2>
          <Field label="기본 지역(날씨·계절 참고)" hint="날씨는 시·도 단위로 조회합니다: 서울 부산 대구 인천 광주 대전 울산 세종 경기 강원 충북 충남 전북 전남 경북 경남 제주"><div className="flex gap-2"><input className="input" list="regions" value={region} onChange={(e) => setRegion(e.target.value)} /><datalist id="regions">{['서울', '부산', '대구', '인천', '광주', '대전', '울산', '세종', '경기', '강원', '충북', '충남', '전북', '전남', '경북', '경남', '제주'].map((r) => <option key={r} value={r} />)}</datalist><button className="btn-ghost" onClick={() => act(() => api.setUserSetting('default_region', region), '저장')}>저장</button></div></Field>
          <div className="mt-2"><Field label="음력 명절(설·추석) 날짜 JSON" hint="연도별로 달라 자동 계산하지 않습니다. 실제 날짜를 입력하세요."><textarea className="input font-mono text-xs" rows={4} value={lunar} onChange={(e) => setLunar(e.target.value)} /><button className="btn-ghost mt-1" onClick={() => { try { act(() => api.setUserSetting('lunar_holidays', JSON.parse(lunar)), '저장') } catch { toast('JSON 형식 오류', 'err') } }}>저장</button></Field></div>
          <h2 className="section-title mb-2 mt-4">조회 대상 게시 기간</h2>
          <Field label="오늘 기준 몇 일 전 ~ 몇 일 전 영상을 다룰지" hint="기본 90일 전 ~ 1095일(3년) 전. 재편집 쇼츠 검색·자동 후보 발굴(추천 대상)에 적용. 최근 쇼츠는 추이가 드러나지 않아 제외합니다. 연예인 채널의 원본 영상은 쇼츠가 쓴 최신 영상일 수 있어 '최근 제외' 없이 오늘까지 수집하고 과거 한도(3년)만 따릅니다."><div className="flex items-center gap-2"><input type="number" className="input w-24" min={0} value={winMin} onChange={(e) => setWinMin(Number(e.target.value))} /><span className="muted">일 전 ~</span><input type="number" className="input w-24" min={1} value={winMax} onChange={(e) => setWinMax(Number(e.target.value))} /><span className="muted">일 전</span><button className="btn-ghost" onClick={() => act(async () => { await api.setUserSetting('window_min_age_days', winMin); await api.setUserSetting('window_max_age_days', winMax) }, '저장')}>저장</button></div></Field>
          <h2 className="section-title mb-2 mt-4">일일 조회수 갱신 개수</h2>
          <Field label="「오늘 소싱 실행」 때 갱신할 영상 수 (오래된 것부터)" hint="영상 50개당 YouTube 할당량 1. 전체 영상 수보다 크게 두면 매일 전부 갱신됩니다. 0 = 갱신 안 함."><div className="flex gap-2"><input type="number" className="input" min={0} max={20000} value={refreshLimit} onChange={(e) => setRefreshLimit(Number(e.target.value))} /><button className="btn-ghost" onClick={() => act(() => api.setUserSetting('daily_refresh_limit', refreshLimit), '저장')}>저장</button></div></Field>
          <h2 className="section-title mb-2 mt-4">AI 기획안 자동 생성 개수</h2>
          <Field label="「오늘 소싱 실행」·「AI 기획안 일괄 생성」 1회에 만들 AI 기획안 수 (점수 높은 후보부터)" hint="AI 기획안이 없거나 후보 정보가 바뀐 후보만 대상. 후보마다 Claude 호출 1회(비용 발생). 템플릿 기획안과 규칙 간이 점수는 모든 후보에 항상 자동으로 붙습니다."><div className="flex gap-2"><input type="number" className="input" min={0} max={200} value={planLimit} onChange={(e) => setPlanLimit(Number(e.target.value))} /><button className="btn-ghost" onClick={() => act(() => api.setUserSetting('auto_plan_limit', planLimit), '저장')}>저장</button></div></Field>
          <h2 className="section-title mb-2 mt-4">원본 영상 자동 찾기</h2>
          <p className="mb-1 text-[11px] muted">「오늘 소싱 실행」 때 원본이 없는 쇼츠 후보마다 제목·해시태그로 찾고, 그래도 확신이 낮으면 쇼츠 썸네일로 이미지 검색(Google Vision 키가 있으면 같은 장면 페이지 검색, 없으면 AI 화면 읽기)까지 자동으로 합니다. YouTube 검색은 1회당 할당량 100이며 아래 총 횟수로 제한합니다.</p>
          <div className="flex flex-wrap items-center gap-3 text-sm"><label className="flex items-center gap-2"><input type="checkbox" checked={s.data.user.auto_image_original !== false} onChange={(e) => act(() => api.setUserSetting('auto_image_original', e.target.checked), '저장')} /> 썸네일 이미지 검색 포함</label><span className="muted text-xs">YouTube 검색 총 횟수/실행</span><input type="number" className="input w-20" min={0} max={100} defaultValue={Number(s.data.user.auto_original_search_limit ?? 10)} onBlur={(e) => act(() => api.setUserSetting('auto_original_search_limit', Number(e.target.value)), '저장')} /></div>
          <h2 className="section-title mb-2 mt-4">자동 소싱 (매일 05:00)</h2>
          <label className="flex items-center gap-2"><input type="checkbox" checked={!!s.data.user.auto_sourcing_enabled} onChange={(e) => act(() => api.setScheduler(e.target.checked), e.target.checked ? '자동 소싱 활성' : '자동 소싱 비활성')} /> 활성화 (데이터 연결·안정성 검증 후 켜세요)</label>
          <p className="mt-1 text-[11px] muted">PC와 SHOPPULSE 서버가 켜져 있어야 실행됩니다. 기존 ChatGPT 예약 브리핑과는 별개 시스템입니다.</p>
        </div>

        <div className="card p-4 lg:col-span-2">
          <h2 className="section-title mb-1">소싱 점수 배점·등급</h2>
          <p className="mb-3 text-xs muted">저장하면 새 버전이 만들어져 활성화됩니다(기존 점수는 이전 버전에 남음). 배점 합계는 100.</p>
          <Field label="버전 이름"><input className="input" value={scoring.name} onChange={(e) => setScoring({ ...scoring, name: e.target.value })} /></Field>
          <table className="mt-2 w-full text-sm"><thead><tr><th className="th">키</th><th className="th">항목</th><th className="th">배점</th><th className="th">세부 기준</th></tr></thead><tbody>
            {scoring.items.map((it, i) => <tr key={i} className="border-t border-stone-100 dark:border-stone-800"><td className="td font-mono text-xs">{it.key}</td><td className="td"><input className="input" value={it.label} onChange={(e) => { const items = [...scoring.items]; items[i] = { ...it, label: e.target.value }; setScoring({ ...scoring, items }) }} /></td><td className="td"><input type="number" className="input w-20" value={it.max} onChange={(e) => { const items = [...scoring.items]; items[i] = { ...it, max: Number(e.target.value) }; setScoring({ ...scoring, items }) }} /></td><td className="td"><textarea className="input text-xs" rows={2} value={it.criteria} onChange={(e) => { const items = [...scoring.items]; items[i] = { ...it, criteria: e.target.value }; setScoring({ ...scoring, items }) }} /></td></tr>)}
          </tbody></table>
          <div className="mt-2 text-sm">합계 <b className={sum === 100 ? '' : 'text-red-600'}>{sum}</b>/100</div>
          <h3 className="mt-3 text-sm font-semibold">등급</h3>
          <div className="mt-1 grid gap-2 md:grid-cols-4">{scoring.grades.map((g, i) => <div key={i} className="flex items-center gap-1 text-sm"><input type="number" className="input w-16" value={g.min} onChange={(e) => { const grades = [...scoring.grades]; grades[i] = { ...g, min: Number(e.target.value) }; setScoring({ ...scoring, grades }) }} /><span>+</span><input className="input" value={g.label} onChange={(e) => { const grades = [...scoring.grades]; grades[i] = { ...g, label: e.target.value }; setScoring({ ...scoring, grades }) }} /></div>)}</div>
          <div className="mt-3 flex justify-end"><button className="btn-primary" disabled={sum !== 100} onClick={() => act(() => api.newScoring(scoring), '새 배점 버전 저장·활성화')}>새 버전으로 저장</button></div>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {[['graph_rules.json', '그래프 판별 규칙', rules, setRules, '최소 관측 수·기간, 평탄화/재상승/꾸준히/뒤늦은 급상승 임계값'], ['metric_bands.json', 'Outlier·VPH 운영 참고 기준', bands, setBands, 'vidIQ 공식 등급이 아닌 SHOPPULSE 운영 기준'], ['upload_slots.json', '업로드 시간대·배치 가설', slots, setSlots, '3개 시간대와 카테고리별 배치 가설(검증된 순위 아님)']].map(([name, title, val, set, hint]) => (
          <div key={name as string} className="card p-4">
            <h2 className="section-title mb-1">{title as string}</h2><p className="mb-2 text-[11px] muted">{hint as string}</p>
            <textarea className="input font-mono text-xs" rows={14} value={val as string} onChange={(e) => (set as any)(e.target.value)} />
            <div className="mt-2 flex justify-end"><button className="btn-ghost" onClick={() => { try { act(() => api.putConfig(name as string, JSON.parse(val as string)), `${title} 저장`) } catch { toast('JSON 형식 오류', 'err') } }}>저장</button></div>
          </div>
        ))}
      </div>

      <div className="card p-4">
        <h2 className="section-title mb-1">데이터 백업·복원</h2>
        <p className="mb-3 text-xs muted">백업 폴더: <span className="font-mono">{backups.data?.dir}</span>. 복원 전에 자동으로 사전 백업을 만듭니다. '전체 교체'는 현재 데이터를 지우고 파일 내용으로 바꿉니다.</p>
        <div className="flex flex-wrap items-center gap-2">
          <button className="btn-primary" onClick={() => act(() => api.createBackup(), 'JSON 백업 생성')}>지금 백업(JSON)</button>
          <a className="btn-ghost" href="/api/backup/export.json">JSON 내려받기</a>
          <a className="btn-ghost" href="/api/backup/export.zip">CSV(zip) 내려받기</a>
          <span className="mx-2 muted">|</span>
          <select className="input w-40" value={restoreMode} onChange={(e) => setRestoreMode(e.target.value as any)}><option value="replace">전체 교체</option><option value="merge">병합(기존 유지)</option></select>
          <input ref={restoreRef} type="file" accept=".json" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f && confirm(`${restoreMode === 'replace' ? '현재 데이터를 모두 지우고' : '기존 데이터를 유지하고'} "${f.name}" 에서 복원할까요? 사전 백업이 자동 생성됩니다.`)) act(() => api.restore(f, restoreMode).then((r) => toast(`복원 완료 (사전 백업 ${r.pre_restore_backup})`)), '복원 완료'); e.target.value = '' }} />
          <button className="btn-danger" onClick={() => restoreRef.current?.click()}>JSON 복원…</button>
        </div>
        <table className="mt-3 w-full text-xs"><thead><tr><th className="th">파일</th><th className="th">크기</th><th className="th">생성</th><th className="th"></th></tr></thead><tbody>
          {(backups.data?.files || []).slice(0, 15).map((b) => <tr key={b.name} className="border-t border-stone-100 dark:border-stone-800"><td className="td font-mono">{b.name}</td><td className="td">{(b.size / 1024).toFixed(0)} KB</td><td className="td">{fmt.datetime(b.modified_at)}</td><td className="td"><a className="underline" href={`/api/backup/download/${b.name}`}>내려받기</a></td></tr>)}
          {backups.data?.files.length === 0 && <tr><td className="td muted" colSpan={4}>백업 파일 없음</td></tr>}
        </tbody></table>
      </div>
    </div>
  )
}
