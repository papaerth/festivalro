#!/usr/bin/env python3
"""쇼핑 쇼츠 자동 제작 — 원본 영상 하나에서 완성본 여섯 가지까지.

  python shorts.py new  <편> --url <유튜브 링크> [--inpock 123] [--product "제품명"]
  python shorts.py auto <편>            # 전부 자동(Claude API 키 필요)
  python shorts.py auto --all           # input/ 의 아직 안 만든 편을 모두

단계별 실행(Claude Code가 판단 단계를 직접 맡을 때)
  prep → (analysis.json 작성) → zoom → (plan.json · copy.json 작성) → check → tts → render → qa → copy

단계 사이의 약속은 work/<편>/ 의 파일이다. 파일이 있으면 그 단계는 건너뛴다(--redo 단계명 으로 다시).
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from pipeline import asr_words, checks, comments, util  # noqa: E402
from pipeline.build import build, crop_of, load_plan  # noqa: E402
from pipeline.sheets import default_crop_size, make_sheets  # noqa: E402
from pipeline.util import Episode, log  # noqa: E402

STAGES = ["prep", "analyze", "design", "tts", "render", "qa", "copy"]
STAGE_FILES = {
    "prep": ["meta.json", "words.json", "transcript.txt", "comments.json"],
    "analyze": ["analysis.json", "zoom.json"],
    "design": ["plan.json", "copy.json"],
    "tts": ["tts.json"],
}


# ------------------------------------------------------------------ 단계
def stage_prep(ep: Episode):
    """원본을 읽어 대사(음성 인식)·개요 프레임 시트·댓글을 준비한다."""
    src = ep.source
    meta = util.probe(src)
    if "width" not in meta:
        util.die(f"영상 스트림이 없는 파일입니다: {src}")
    util.write_json(ep.w("meta.json"), {**meta, "source": src.name})
    if not ep.w("words.json").exists():
        log(f"[준비] 음성 인식 중… ({meta['duration']:.0f}초 분량)")
        asr = asr_words.transcribe_file(src)
        util.write_json(ep.w("words.json"), asr)
        ep.w("transcript.txt").write_text(asr_words.as_text(asr), encoding="utf-8")
    if not list(ep.work.glob("overview_*.jpg")):
        log("[준비] 개요 프레임 시트 만드는 중…")
        make_sheets(src, ep.w("overview"), step=2.0, cols=5, rows=4, thumb_w=320, max_sheets=30)
    if not ep.w("comments.json").exists():
        given = ep.inp / "comments.json"
        if given.exists():
            yt = util.read_json(given)
            for c in yt.get("comments", []):
                c.setdefault("likes_label", comments.like_label(int(c.get("likes", 0))))
        elif ep.info["url"]:
            log("[준비] 댓글 가져오는 중…")
            yt = comments.fetch(ep.info["url"])
            if yt["error"]:
                log(f"[주의] {yt['error']}")
        else:
            yt = {"title": "", "channel": "", "description": "", "comments": [],
                  "error": "유튜브 링크가 없어 댓글을 가져오지 않았습니다."}
        util.write_json(ep.w("comments.json"), yt)
    return meta


def stage_analyze(ep: Episode):
    from pipeline import brain
    meta, asr, yt = util.read_json(ep.w("meta.json")), util.read_json(ep.w("words.json")), util.read_json(ep.w("comments.json"))
    if not asr["words"]:
        util.die("음성 인식 결과가 비었습니다. 말소리가 있는 영상인지 확인하세요.")
    log("[분석] 제품표·후킹 순위·제품 선정 중…")
    vidiq = ep.vidiq
    if vidiq:
        log("[분석] 붙여 넣은 vidIQ 분석을 함께 봅니다.")
    an = brain.analyze(meta, asr, sorted(ep.work.glob("overview_*.jpg")), ep.info, yt, vidiq, ep.feedback)
    util.write_json(ep.w("analysis.json"), an)
    log(f"[분석] 선정: {an['pick'].get('brand', '')} {an['pick']['name']} — {an['pick']['reason']}")
    return an


def stage_zoom(ep: Episode, a: float | None = None, b: float | None = None, step: float = 0.5):
    """고른 제품 구간을 0.5초 간격·x좌표 눈금 프레임 시트로 뽑고, 그 구간의 어절 시각을 정리한다."""
    meta = util.read_json(ep.w("meta.json")) or stage_prep(ep)
    an = util.read_json(ep.w("analysis.json"), {}) or {}
    if a is None or b is None:
        if not an.get("pick"):
            util.die("analysis.json 의 pick(start, end)이 없습니다. --a, --b 로 구간을 주세요.")
        a, b = float(an["pick"]["start"]) - 1.5, float(an["pick"]["end"]) + 1.5
    a, b = max(0.0, a), min(meta["duration"], b)
    for p in ep.work.glob("zoom_*.jpg"):
        p.unlink()
    crop = default_crop_size(meta)
    sheets = make_sheets(ep.source, ep.w("zoom"), a, b, step, cols=4, rows=3, thumb_w=480, ruler=True,
                         crop_size=crop, max_sheets=24)
    asr = util.read_json(ep.w("words.json"))
    zoom_asr = {"words": [w for w in asr["words"] if a <= w["t"] <= b],
                "speech": [s for s in asr["speech"] if s[1] > a and s[0] < b],
                "lines": [l for l in asr["lines"] if l["b"] > a and l["a"] < b]}
    ep.w("words_zoom.txt").write_text(asr_words.as_text(zoom_asr, words=True), encoding="utf-8")
    util.write_json(ep.w("zoom.json"), {"a": a, "b": b, "crop_default": crop, "sheets": [p.name for p in sheets]})
    return zoom_asr, sheets, crop


def stage_design(ep: Episode, max_rounds: int = 3):
    """컷 설계 → 규칙 검사 → (문제 있으면) 다시 설계. TTS 키가 있으면 실제 음성 길이로 한 번 더 확인."""
    from pipeline import brain, tts
    meta, an, yt = util.read_json(ep.w("meta.json")), util.read_json(ep.w("analysis.json")), util.read_json(ep.w("comments.json"))
    asr = util.read_json(ep.w("words.json"))
    zoom_asr, sheets, crop_default = stage_zoom(ep)
    images = [p.name for p in ep.images()]
    feedback, prev_plan, prev_copy = ep.feedback, None, None
    if feedback:
        log("[설계] 수정 요청을 반영합니다.")
        prev_plan, prev_copy = util.read_json(ep.w("plan.prev.json")), util.read_json(ep.w("copy.prev.json"))
        product = ep.info["product"] or f"{an['pick'].get('brand', '')} {an['pick']['name']}".strip()
        if not prev_plan or prev_plan.get("product") != product:
            prev_plan = prev_copy = None      # 제품이 바뀌었으면 이전 설계는 참고하지 않는다
    content = brain.design_request(meta, an, zoom_asr, sheets, ep.info, yt, images, crop_default, ep.vidiq,
                                   feedback, prev_plan, prev_copy)
    history, plan, copy, res = None, None, None, None
    for rnd in range(1, max_rounds + 2):
        log(f"[설계] {'컷 설계 중…' if rnd == 1 else f'규칙 검사에서 걸린 부분 고치는 중… ({rnd - 1}차)'}")
        d, history = brain.ask_json(content, brain.DESIGN_SCHEMA, history)
        plan, copy = brain.to_plan(d, an, ep.info, yt)
        util.write_json(ep.w("plan.json"), plan)
        full = load_plan(ep.w("plan.json"))
        res = checks.validate_tight(full, meta, ep.inp, asr)
        if not res["errors"] and tts.available():
            tts.ensure(plan, ep.inp, ep.work)          # 실제 음성 길이로 20초 규칙을 다시 본다
            res = checks.validate_tight(full, meta, ep.inp, asr)
        if not res["errors"]:
            break
        log(checks.report(res))
        if rnd > max_rounds:
            util.die(f"{max_rounds}번 고쳐도 규칙 검사를 통과하지 못했습니다. work/{ep.name}/plan.json 을 직접 고친 뒤 "
                     f"`python shorts.py auto {ep.name}` 을 다시 실행하세요.")
        extra = [w for w in res["warnings"] if "음성 인식" in w or "잘릴" in w]
        content = brain.repair_request(res["errors"] + extra)
    plan, notes = checks.tighten(plan, asr)
    for n in notes:
        log(f"[다듬음] {n}")
    util.write_json(ep.w("plan.json"), plan)
    copy["warnings"] = checks.validate(load_plan(ep.w("plan.json")), meta, ep.inp, asr)["warnings"]
    util.write_json(ep.w("copy.json"), copy)
    return plan


def stage_check(ep: Episode, fix: bool = False) -> dict:
    meta, asr = util.read_json(ep.w("meta.json")) or stage_prep(ep), util.read_json(ep.w("words.json"))
    if not ep.w("plan.json").exists():
        util.die(f"work/{ep.name}/plan.json 이 없습니다.")
    if fix:
        plan, notes = checks.tighten(util.read_json(ep.w("plan.json")), asr)
        if notes:
            util.write_json(ep.w("plan.json"), plan)
            print("\n".join("[다듬음] " + n for n in notes))
    res = checks.validate(load_plan(ep.w("plan.json")), meta, ep.inp, asr)
    print(checks.report(res))
    return res


def stage_tts(ep: Episode):
    from pipeline import tts
    plan = util.read_json(ep.w("plan.json"))
    missing = [s["audio"] for s in plan["timeline"] if s["type"] == "tts" and not (ep.inp / s["audio"]).exists()]
    if missing and not tts.available():
        texts = [f"  {s['audio']}: {s['text']}" for s in plan["timeline"] if s["type"] == "tts"]
        util.die("TTS 음성이 없습니다. .env 에 ELEVENLABS_API_KEY 를 넣거나, 아래 문구를 녹음·생성해 "
                 f"input/{ep.name}/ 에 넣어 주세요.\n" + "\n".join(texts))
    tts.ensure(plan, ep.inp, ep.work)


def _outputs_fresh(ep: Episode) -> bool:
    res = ep.out / "_plan_resolved.json"
    if not res.exists():
        return False
    newest = max([ep.w("plan.json").stat().st_mtime] +
                 [p.stat().st_mtime for p in ep.inp.glob("tts*.mp3")])
    outs = (util.read_json(res) or {}).get("outputs", {})
    return res.stat().st_mtime >= newest and all((ep.out / Path(p).name).exists() for p in outs.values())


def stage_render(ep: Episode, uvr_model=None, no_uvr=False):
    plan = util.read_json(ep.w("plan.json"))
    if plan is None:
        util.die(f"work/{ep.name}/plan.json 이 없습니다.")
    meta = util.read_json(ep.w("meta.json")) or stage_prep(ep)   # 준비 단계를 건너뛰고 불렀을 때
    asr = util.read_json(ep.w("words.json"))
    res = checks.validate(load_plan(ep.w("plan.json")), meta, ep.inp, asr)
    if res["errors"]:
        print(checks.report(res))
        util.die("규칙 검사에서 오류가 나와 렌더링하지 않았습니다.")
    return build(ep.w("plan.json"), ep.source, ep.out, plan.get("product") or ep.name, uvr_model, ep.inp, no_uvr)


def stage_qa(ep: Episode) -> dict:
    from pipeline import qa
    q = qa.run_qa(ep.out)
    print(qa.summary(q))
    return q


def stage_review(ep: Episode, q: dict) -> list[str]:
    """모델이 완성본 프레임을 직접 보고, 고칠 것이 있으면 plan을 고친다. 고친 내용을 돌려준다."""
    from pipeline import brain
    meta = util.read_json(ep.w("meta.json"))
    plan = util.read_json(ep.w("plan.json"))
    size, _ = crop_of(load_plan(ep.w("plan.json")), meta)
    rv = brain.review(util.read_json(ep.out / "_plan_resolved.json"), plan, q["sheets"], meta, size)
    util.write_json(ep.w("review.json"), rv)
    done = brain.apply_review(plan, rv, meta, size)
    if done:
        util.write_json(ep.w("plan.json"), plan)
    return done


def stage_copy(ep: Episode) -> Path:
    """업로드 문구와 결과 보고를 쓴다."""
    plan, copy = util.read_json(ep.w("plan.json")), util.read_json(ep.w("copy.json"), {}) or {}
    an = util.read_json(ep.w("analysis.json"), {}) or {}
    if not (ep.out / "_plan_resolved.json").exists():
        util.die(f"아직 렌더링하지 않았습니다. 먼저 `python shorts.py render {ep.name}`.")
    q = util.read_json(ep.out / "_검수.json", {}) or {}
    yt = util.read_json(ep.w("comments.json"), {}) or {}
    product = plan.get("product") or ep.name
    name = util.safe_name(product)
    num = ep.info["inpock"] or "(번호)"
    combos = copy.get("combos") or [{"top": plan.get("title", ["", ""]), "title": ""}]
    desc = copy.get("description") or {}
    L = ["[제목]"]
    for i, c in enumerate(combos[:3]):
        L.append(f"{'1순위' if i == 0 else f'대안 {i}'}: {c.get('title', '')}   (썸네일 문구: {' / '.join(c.get('top', []))})")
    L += ["", "[설명]", f"📌 {product}", f"🔗 프로필 인포크 링크에서 '{num}' 검색", ""]
    L += [x for x in [desc.get("hook_line", "")] + list(desc.get("body_lines", [])) + [desc.get("closing_line", "")] if x]
    L += ["", " ".join(desc.get("hashtags", [])), "", "[핀 댓글]", f"제품명 : {product}", "📌 제품 태그 하시거나",
          f"📌 프로필 인포크 링크 → '{num}' 검색하면 바로 나와요. 🔗", "", copy.get("pin_question", "")]
    ep.out.mkdir(parents=True, exist_ok=True)
    (ep.out / f"{name}_업로드문구.txt").write_text("\n".join(L).rstrip() + "\n", encoding="utf-8")
    desc_text = "\n".join(
        [f"📌 {product}", f"🔗 프로필 인포크 링크에서 '{num}' 검색", ""]
        + [x for x in [desc.get("hook_line", "")] + list(desc.get("body_lines", [])) + [desc.get("closing_line", "")] if x]
        + ["", " ".join(desc.get("hashtags", []))]).strip()
    pin_text = "\n".join([f"제품명 : {product}", "📌 제품 태그 하시거나",
                          f"📌 프로필 인포크 링크 → '{num}' 검색하면 바로 나와요. 🔗", "",
                          copy.get("pin_question", "")]).strip()

    checks_ = ["유튜브 업로드 화면에서 제품 태그 검색이 되는지 (안 되면 아래 차순위 후보로)",
               "배경음X 버전에서 목소리가 뭉개지지 않았는지 직접 들어 보기"]
    if not ep.info["inpock"]:
        checks_.append("인포크 번호가 없어 설명·핀 댓글에 '(번호)'로 비워 두었습니다")
    if an.get("paid_ad"):
        checks_.append(f"원본이 유료 광고 영상입니다: {an.get('paid_ad_note', '')}")
    if not plan.get("cards"):
        why = (yt.get("error") or "댓글 없음").strip().splitlines()[-1][:120]
        checks_.append(f"댓글 카드를 넣지 못했습니다: {why}")
    checks_ += [f"[검수] {i}" for i in q.get("issues", [])] + list(q.get("notes", []))
    checks_ += [ln.strip() for ln in str(copy.get("notes") or "").splitlines() if ln.strip()]
    checks_ += [f"[권고] {w}" for w in copy.get("warnings", [])]
    pick = an.get("pick") or {}
    data = {
        "episode": ep.name, "product": product, "duration": q.get("duration"),
        "version": (util.read_json(ep.w("version.json")) or {}).get("dir", ""),
        "description": desc_text, "pin_comment": pin_text,
        "files": [f"{name}_배경음O.mp4", f"{name}_배경음X.mp4"]
                 + ([f"{name}_음악.mp4"] if (ep.out / f"{name}_음악.mp4").exists() else [])
                 + [f"{name}_썸네일.jpg", f"{name}_업로드문구.txt"],
        "pick_reason": pick.get("reason", ""),
        "checks": checks_,
        "feedback": ep.feedback,
        "revision": [ln.strip() for ln in str(copy.get("revision") or "").splitlines() if ln.strip()],
        "combos": [{"title": c.get("title", ""), "top": c.get("top", [])} for c in combos[:3]],
        "alternates": [{"brand": a.get("brand", ""), "name": a.get("name", ""), "reason": a.get("reason", "")}
                       for a in an.get("alternates", [])],
    }
    util.write_json(ep.out / "_보고.json", data)

    R = [f"■ 만든 것 — {product} ({data['duration'] or '?'}초)", "  " + " · ".join(data["files"])]
    if data["pick_reason"]:
        R.append(f"  고른 이유: {data['pick_reason']}")
    R += ["", "■ 사람이 확인할 것"] + [f"  - {c}" for c in checks_]
    if data["feedback"]:
        R += ["", "■ 수정 요청 반영"] + [f"  요청: {ln}" for ln in data["feedback"].splitlines() if ln.strip()]
        R += [f"  - {ln}" for ln in data["revision"]] or ["  (반영 내용 설명 없음)"]
    R += ["", "■ 차순위 제품 후보"]
    R += [f"  {i}. {a['brand']} {a['name']} — {a['reason']}" for i, a in enumerate(data["alternates"], 1)] \
        or ["  (분석 파일에 후보가 없습니다)"]
    rep = ep.out / f"{name}_보고.txt"
    rep.write_text("\n".join(R) + "\n", encoding="utf-8")
    return rep


# ------------------------------------------------------------------ 전체 자동
def clear_from(ep: Episode, stage: str):
    """stage 와 그 뒤 단계의 결과 파일을 지워 다시 만들게 한다."""
    for st in STAGES[STAGES.index(stage):]:
        if st == "design":   # 수정 요청을 반영할 때 고칠 대상으로 쓰도록 이전 설계를 남겨 둔다
            for f in ("plan", "copy"):
                if ep.w(f"{f}.json").exists():
                    ep.w(f"{f}.json").replace(ep.w(f"{f}.prev.json"))
        if st == "tts":      # 프로그램이 만든 TTS 음성만 지운다(사용자가 넣은 파일은 기록에 없다)
            for f in util.read_json(ep.w("tts.json"), {}) or {}:
                (ep.inp / f).unlink(missing_ok=True)
        for f in STAGE_FILES.get(st, []):
            ep.w(f).unlink(missing_ok=True)
        if st == "prep":
            for p in ep.work.glob("overview_*.jpg"):
                p.unlink()
        if st == "render":
            (ep.out / "_plan_resolved.json").unlink(missing_ok=True)
            ep.w("review.json").unlink(missing_ok=True)


VERSION_LABEL = {"analyze": "제품변경", "design": "컷다시", "render": "다시렌더"}


def pick_version(ep: Episode, redo: str | None):
    """완성본을 덮어쓰지 않게 버전 폴더를 정한다: 처음은 01_처음, 다시 만들 때마다 새 폴더."""
    if not ep.w("version.json").exists():
        if (ep.out_root / "_plan_resolved.json").exists():
            # 버전 폴더가 없던 때 만든 완성본을 01_처음 으로 옮긴다
            files = [p for p in ep.out_root.iterdir() if p.is_file()]
            d = ep.start_version("처음")
            for p in files:
                p.replace(d / p.name)
        else:
            ep.start_version("처음")
    if redo in VERSION_LABEL and (ep.out / "_plan_resolved.json").exists():
        label = "수정" if redo == "design" and ep.feedback else VERSION_LABEL[redo]
        before = ep.out.name
        log(f"[버전] 이전 완성본은 {before} 에 그대로 두고 새 폴더에 만듭니다: {ep.start_version(label).name}")


def auto(ep: Episode, redo: str | None = None, review: bool = True, uvr_model=None):
    pick_version(ep, redo)
    if redo:
        clear_from(ep, redo)
    log(f"━━ {ep.name} ━━")
    if not all(ep.w(f).exists() for f in ("meta.json", "words.json", "comments.json")):
        stage_prep(ep)
    if not ep.w("analysis.json").exists():
        stage_analyze(ep)
    if not (ep.w("plan.json").exists() and ep.w("copy.json").exists()):
        stage_design(ep)
    stage_tts(ep)
    if not _outputs_fresh(ep):
        stage_render(ep, uvr_model)
    q = stage_qa(ep)
    if review and not ep.w("review.json").exists():
        fixed = stage_review(ep, q)
        if fixed:
            for f in fixed:
                log(f"[검수 반영] {f}")
            stage_render(ep, uvr_model)
            q = stage_qa(ep)
    rep = stage_copy(ep)
    print("\n" + rep.read_text(encoding="utf-8"))
    return rep


def pending_episodes() -> list[str]:
    inp = util.ROOT / "input"
    out = []
    for d in sorted(inp.iterdir()) if inp.is_dir() else []:
        if d.is_dir() and any(p.suffix.lower() in util.VIDEO_EXT for p in d.iterdir()):
            if not list((util.ROOT / "output" / d.name).rglob("*_보고.txt")):
                out.append(d.name)
    return out


def main():
    util.load_env()
    ap = argparse.ArgumentParser(description="쇼핑 쇼츠 자동 제작", formatter_class=argparse.RawDescriptionHelpFormatter,
                                 epilog=__doc__)
    sub = ap.add_subparsers(dest="cmd", required=True)

    p = sub.add_parser("new", help="편 폴더와 정보 파일 만들기")
    p.add_argument("name")
    p.add_argument("--url", default="")
    p.add_argument("--inpock", default="")
    p.add_argument("--product", default="")
    p.add_argument("--channel", default="")

    p = sub.add_parser("auto", help="처음부터 끝까지 자동")
    p.add_argument("name", nargs="?")
    p.add_argument("--all", action="store_true", help="input/ 의 아직 안 만든 편 모두")
    p.add_argument("--redo", choices=STAGES, help="이 단계부터 다시")
    p.add_argument("--no-review", action="store_true", help="모델의 화면 검수(재렌더 포함)를 건너뛴다")
    p.add_argument("--uvr-model")

    for name, hlp in [("prep", "음성 인식·개요 시트·댓글 준비"), ("analyze", "분석·제품 선정(API)"),
                      ("design", "컷 설계·문구(API)"), ("tts", "TTS 음성 만들기"),
                      ("qa", "완성본 검수"), ("copy", "업로드 문구·보고 쓰기"), ("status", "단계별 진행 상태")]:
        sub.add_parser(name, help=hlp).add_argument("name")
    p = sub.add_parser("zoom", help="구간 프레임 시트(x좌표 눈금)와 어절 시각")
    p.add_argument("name")
    p.add_argument("--a", type=float)
    p.add_argument("--b", type=float)
    p.add_argument("--step", type=float, default=0.5)
    p = sub.add_parser("check", help="plan 규칙 검사")
    p.add_argument("name")
    p.add_argument("--fix", action="store_true", help="쉼·무음을 잘라 컷을 다듬는다")
    p = sub.add_parser("render", help="렌더링")
    p.add_argument("name")
    p.add_argument("--uvr-model")
    p.add_argument("--no-uvr", action="store_true")
    a = ap.parse_args()

    if a.cmd == "new":
        d = util.ROOT / "input" / a.name
        d.mkdir(parents=True, exist_ok=True)
        info = util.read_json(d / "info.json", {}) or {}
        info.update({k: v for k, v in dict(url=a.url, inpock=a.inpock, product=a.product, channel=a.channel).items() if v})
        for k in ("url", "inpock", "product", "channel"):
            info.setdefault(k, "")
        util.write_json(d / "info.json", info)
        print(f"{d} 에 원본 영상(mp4)을 넣고, 필요하면 img1.jpg · img2.jpg 도 넣은 뒤\n  python shorts.py auto {a.name}")
        return
    if a.cmd == "auto":
        names = pending_episodes() if a.all else [a.name] if a.name else []
        if not names:
            util.die("만들 편이 없습니다. `python shorts.py auto <편>` 또는 input/<편>/ 에 원본 영상을 넣고 --all.")
        failed = []
        for n in names:
            try:
                auto(Episode(n), a.redo, not a.no_review, a.uvr_model)
            except SystemExit as e:
                if not a.all or not e.code:
                    raise
                failed.append(n)
        if failed:
            util.die("실패한 편: " + ", ".join(failed))
        return

    ep = Episode(a.name)
    if a.cmd == "prep":
        stage_prep(ep)
        print(f"대사: {ep.w('transcript.txt')}\n개요 시트: {ep.work}/overview_*.jpg\n댓글: {ep.w('comments.json')}")
    elif a.cmd == "analyze":
        stage_prep(ep)
        stage_analyze(ep)
    elif a.cmd == "zoom":
        _, sheets, _ = stage_zoom(ep, a.a, a.b, a.step)
        print(f"어절 시각: {ep.w('words_zoom.txt')}\n" + "\n".join(str(s) for s in sheets))
    elif a.cmd == "design":
        stage_design(ep)
    elif a.cmd == "check":
        raise SystemExit(1 if stage_check(ep, a.fix)["errors"] else 0)
    elif a.cmd == "tts":
        stage_tts(ep)
    elif a.cmd == "render":
        stage_render(ep, a.uvr_model, a.no_uvr)
    elif a.cmd == "qa":
        raise SystemExit(0 if stage_qa(ep)["ok"] else 1)
    elif a.cmd == "copy":
        print(stage_copy(ep).read_text(encoding="utf-8"))
    elif a.cmd == "status":
        for st in STAGES[:4]:
            print(f"{st:8s}", " ".join(f"{f}{'✓' if ep.w(f).exists() else '✗'}" for f in STAGE_FILES[st]))
        print(f"{'render':8s}", "완료" if _outputs_fresh(ep) else "필요")
        print(f"{'copy':8s}", "완료" if list(ep.out.glob('*_보고.txt')) else "필요")
        print(f"{'폴더':8s}", ep.out)


if __name__ == "__main__":
    main()
