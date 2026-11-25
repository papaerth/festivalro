"""레퍼런스 채널의 **편집 스타일**을 학습한다(패턴만 추상화 — 문구·장면을 복제하지 않는다).

학습 재료(있는 만큼 사용, 무엇으로 배웠는지 stats 에 기록):
 a) 채널 주소 → YouTube 공식 API 로 인기 쇼츠 목록(제목 길이·해시태그·영상 길이 통계) + 공식 썸네일 이미지(화면 배치·제목 띠·자막 모양)
 b) 사용자가 올린 샘플 쇼츠 mp4(선택, 최대 3개) → 컷 전환 빈도(ffmpeg 장면 변화 감지) + 장면 모음 이미지(자막이 바뀌는 방식·후킹 구성)
 c) 사용자가 붙여넣은 캡처 이미지(선택)
Claude 비전이 위 재료를 보고 렌더러가 쓸 수 있는 스타일 값(색·크기·위치·후킹 방식·컷 속도)과 '우리만의 차별점' 제안을 만든다.
"""
from __future__ import annotations

import base64
import json
import logging
import re
import shutil
import statistics
import threading
from pathlib import Path

from ..config import get_settings
from ..database import SessionLocal
from ..models import ReferenceStyle, utcnow
from . import shorts_maker
from .style_profile import DEFAULT_STYLE, normalize_style

log = logging.getLogger("shoppulse.style")

STYLE_SCHEMA = {
    "type": "object", "additionalProperties": False,
    "required": ["summary", "layout", "title", "caption", "hook", "pacing", "end_question", "kick", "evidence", "confidence"],
    "properties": {
        "summary": {"type": "string"},
        "layout": {"type": "object", "additionalProperties": False, "required": ["mode", "bg_color", "fg_zoom", "fg_position"],
                   "properties": {"mode": {"type": "string", "enum": ["blur_bg", "crop_fill", "color_bg"]}, "bg_color": {"type": "string"},
                                  "fg_zoom": {"type": "number"}, "fg_position": {"type": "string", "enum": ["center", "upper"]}}},
        "title": {"type": "object", "additionalProperties": False,
                  "required": ["enabled", "size", "color", "second_line_color", "outline_color", "box", "box_color", "tone", "patterns"],
                  "properties": {"enabled": {"type": "boolean"}, "size": {"type": "string", "enum": ["small", "medium", "large"]},
                                 "color": {"type": "string"}, "second_line_color": {"type": "string"}, "outline_color": {"type": "string"},
                                 "box": {"type": "boolean"}, "box_color": {"type": "string"}, "tone": {"type": "string"},
                                 "patterns": {"type": "array", "items": {"type": "string"}}}},
        "caption": {"type": "object", "additionalProperties": False,
                    "required": ["enabled", "position", "size", "color", "outline_color", "box", "box_color", "tone", "max_chars", "emoji"],
                    "properties": {"enabled": {"type": "boolean"}, "position": {"type": "string", "enum": ["below_video", "bottom", "over_video"]},
                                   "size": {"type": "string", "enum": ["small", "medium", "large"]}, "color": {"type": "string"},
                                   "outline_color": {"type": "string"}, "box": {"type": "boolean"}, "box_color": {"type": "string"},
                                   "tone": {"type": "string"}, "max_chars": {"type": "integer"}, "emoji": {"type": "boolean"}}},
        "hook": {"type": "object", "additionalProperties": False, "required": ["seconds", "pattern", "zoom_punch", "caption_color"],
                 "properties": {"seconds": {"type": "number"}, "pattern": {"type": "string"}, "zoom_punch": {"type": "boolean"},
                                "caption_color": {"type": "string"}}},
        "pacing": {"type": "object", "additionalProperties": False, "required": ["total_seconds", "segments", "max_clip_seconds", "note"],
                   "properties": {"total_seconds": {"type": "number"}, "segments": {"type": "integer"}, "max_clip_seconds": {"type": "number"},
                                  "note": {"type": "string"}}},
        "end_question": {"type": "boolean"},
        "kick": {"type": "array", "items": {"type": "string"}},
        "evidence": {"type": "array", "items": {"type": "string"}},
        "confidence": {"type": "string", "enum": ["high", "medium", "low"]},
    },
}
_CH_ID = re.compile(r"youtube\.com/channel/(UC[\w-]{20,})")
_HANDLE = re.compile(r"youtube\.com/(@[\w.\-가-힣%]+)|^(@[\w.\-가-힣]+)$")


def resolve_channel(client, url: str) -> dict | None:
    """채널 주소(@핸들, /channel/UC…, 영상·쇼츠 주소) → {channel_id, title}"""
    from urllib.parse import unquote
    from .metrics import extract_video_id
    url = unquote((url or "").strip())
    m = _CH_ID.search(url)
    if m:
        got = client.get_channels([m.group(1)])
        return got[0] if got else None
    m = _HANDLE.search(url)
    if m:
        got = client.get_channels(handle=(m.group(1) or m.group(2)))
        return got[0] if got else None
    vid = extract_video_id(url) if ("youtu" in url or re.fullmatch(r"[\w-]{11}", url)) else None
    if vid:
        vs = client.get_videos([vid])
        if vs and vs[0].get("channel_id"):
            got = client.get_channels([vs[0]["channel_id"]])
            return got[0] if got else None
    got = client.search_channels(url, 3) if url else []
    return got[0] if got else None


def scene_cuts(ff: str, path: str) -> list[float]:
    """장면 전환 시각(초). 컷 속도 계산용."""
    r = shorts_maker._run([ff, "-hide_banner", "-i", path, "-an", "-vf", "select='gt(scene,0.30)',showinfo", "-f", "null", "-"], timeout=300)
    return [float(m) for m in re.findall(r"pts_time:(\d+(?:\.\d+)?)", r.stderr)]


def metadata_stats(videos: list[dict]) -> dict:
    from .collection import parse_iso8601_duration
    durs = [d for d in (parse_iso8601_duration(v.get("duration")) for v in videos) if d]
    titles = [v.get("title") or "" for v in videos]
    plain = [re.sub(r"#\S+", "", t).strip() for t in titles]
    return {"shorts_analyzed": len(videos),
            "avg_seconds": round(statistics.mean(durs), 1) if durs else None,
            "median_seconds": round(statistics.median(durs), 1) if durs else None,
            "avg_title_chars": round(statistics.mean(len(p) for p in plain), 1) if plain else None,
            "avg_hashtags": round(statistics.mean(len(re.findall(r"#\S+", t)) for t in titles), 1) if titles else None,
            "question_title_ratio": round(sum(1 for p in plain if "?" in p) / len(plain), 2) if plain else None,
            "top_views": max((v.get("view_count") or 0 for v in videos), default=0)}


def _img(data: bytes, mt: str = "image/jpeg") -> dict:
    return {"type": "image", "source": {"type": "base64", "media_type": mt, "data": base64.standard_b64encode(data).decode()}}


def ai_learn(name: str, stats: dict, titles: list[str], thumbs: list[tuple[bytes, str]], sheets: list[dict],
             captures: list[tuple[bytes, str]]) -> dict:
    from .claude_client import create_json
    content: list[dict] = []
    if thumbs:
        content.append({"type": "text", "text": f"[채널 인기 쇼츠의 공식 썸네일 {len(thumbs)}장] 화면 배치·제목 띠·자막 모양을 본다."})
        content += [_img(d, mt) for d, mt in thumbs]
    for i, sh in enumerate(sheets, 1):
        content.append({"type": "text", "text": f"[샘플 쇼츠 장면 모음 {i}] {sh['cols']}열×{sh['rows']}행, 왼쪽 위부터 순서대로. 각 칸의 시각(초): {sh['times']} (파일: {sh.get('sample')})"})
        content.append(_img(Path(sh["path"]).read_bytes()))
    if captures:
        content.append({"type": "text", "text": f"[사용자가 붙여넣은 캡처 {len(captures)}장]"})
        content += [_img(d, mt) for d, mt in captures]
    content.append({"type": "text", "text": json.dumps({
        "channel": name, "measured_stats": stats, "title_examples_for_pattern_analysis_only": titles[:15],
        "renderer_can_do": {"layout.mode": "blur_bg(흐린 배경+가운데 화면) / crop_fill(세로로 꽉 채움) / color_bg(단색 배경)",
                            "layout.fg_zoom": "1.0~1.45 (가로 영상을 좌우 잘라 키움)", "title/caption": "색(#RRGGBB)·크기·테두리·불투명 박스·위치",
                            "hook.zoom_punch": "후킹 컷만 살짝 확대", "end_question": "마지막 1.8초에 시청자 질문 자막"}}, ensure_ascii=False)})
    system = (
        "쇼츠 편집 스타일 분석가. 한국어. 레퍼런스 채널의 자료를 보고 '편집 방식'만 뽑아 우리 렌더러가 쓸 값으로 정리한다.\n"
        "규칙: 1) 문구·제목을 베끼지 않는다. title.patterns 에는 구조만 추상화해 적는다(예: '[인물]이 [행동]한 [상품]?' 형태, 실제 고유명사·문장 금지). "
        "2) 색은 화면에서 본 대표색을 #RRGGBB 로. 확실치 않으면 무난한 값. 3) pacing 은 measured_stats 의 평균 길이·컷 간격을 우선 근거로 한다"
        "(샘플 영상이 없으면 note 에 '컷 속도는 추정'이라고 적는다). 4) hook.pattern 에는 처음 2~3초를 어떻게 여는지 방식으로 적는다. "
        "5) kick 에는 이 스타일을 따르되 우리만 다르게 할 차별점 2~3개를 구체적으로 제안한다(예: 후킹 컷 확대, 둘째 줄 강조색, 끝 질문 자막, 사실 확인 한 줄). "
        "6) evidence 에 무엇을 보고 판단했는지, 못 본 것은 무엇인지 적는다. 자료가 썸네일뿐이면 confidence 는 medium 이하.")
    return create_json(system=system, max_tokens=2500, output_schema=STYLE_SCHEMA, messages=[{"role": "user", "content": content}], timeout=300.0)


def run_learning(style_id: int, sample_paths: list[str], capture_paths: list[str]) -> None:
    with SessionLocal() as db:
        st = db.get(ReferenceStyle, style_id)
        if not st:
            return
        work = get_settings().media_dir / "styles" / f"s{style_id}"
        try:
            s = get_settings()
            stats: dict = {"sources": []}
            titles: list[str] = []
            thumbs: list[tuple[bytes, str]] = []
            notes: list[str] = []

            def step(msg: str):
                st.step = msg
                db.commit()

            # a) 채널 메타데이터·썸네일
            if st.channel_url and s.youtube_api_key:
                step("채널 인기 쇼츠 목록 가져오는 중")
                from .product_identifier import fetch_image
                from .youtube_connector import YouTubeAPIError, YouTubeClient
                client = YouTubeClient()
                try:
                    ch = resolve_channel(client, st.channel_url)
                    if ch:
                        st.yt_channel_id, st.channel_title = ch["channel_id"], ch["title"]
                        items = client._get("search", part="id", type="video", channelId=ch["channel_id"], order="viewCount",
                                            videoDuration="short", maxResults=15).get("items", [])
                        ids = [i["id"]["videoId"] for i in items if i.get("id", {}).get("videoId")]
                        vids = client.get_videos(ids) if ids else []
                        from .collection import parse_iso8601_duration
                        vids = [v for v in vids if (parse_iso8601_duration(v.get("duration")) or 999) <= 90]
                        stats.update(metadata_stats(vids))
                        titles = [v.get("title") or "" for v in vids]
                        for v in vids[:6]:
                            if v.get("thumbnail"):
                                im = fetch_image(v["thumbnail"])
                                if im:
                                    thumbs.append(im)
                        stats["sources"].append(f"채널 인기 쇼츠 {len(vids)}개 메타데이터 + 썸네일 {len(thumbs)}장")
                    else:
                        notes.append("채널 주소에서 채널을 찾지 못했습니다.")
                except YouTubeAPIError as e:
                    notes.append(f"YouTube 조회 실패: {e}")
                finally:
                    client.close()
            elif st.channel_url:
                notes.append("YOUTUBE_API_KEY 가 없어 채널 목록·썸네일은 가져오지 못했습니다.")

            # b) 샘플 mp4: 컷 빈도 + 장면 모음
            sheets: list[dict] = []
            caps = shorts_maker.capabilities()
            cut_gaps: list[float] = []
            sample_durs: list[float] = []
            if sample_paths and caps.get("available"):
                step("샘플 쇼츠의 컷 속도·화면 구성 분석 중")
                ff = caps["path"]
                for n, sp in enumerate(sample_paths[:3], 1):
                    try:
                        info = shorts_maker.probe(ff, sp)
                        cuts = scene_cuts(ff, sp)
                        pts = [0.0] + cuts + [info["duration"]]
                        cut_gaps += [b - a for a, b in zip(pts, pts[1:]) if b - a > 0.3]
                        sample_durs.append(info["duration"])
                        stepv = max(1.0, info["duration"] / 27)
                        for sh in shorts_maker.contact_sheets(ff, sp, 0, info["duration"], stepv, 3, 3, 300, work, f"sample{n}")[:3]:
                            sheets.append(sh | {"sample": Path(sp).name})
                    except Exception as e:
                        notes.append(f"샘플 {Path(sp).name} 분석 실패: {str(e)[:120]}")
                if cut_gaps:
                    stats.update({"sample_videos": len(sample_durs), "sample_avg_seconds": round(statistics.mean(sample_durs), 1),
                                  "avg_shot_seconds": round(statistics.mean(cut_gaps), 2), "median_shot_seconds": round(statistics.median(cut_gaps), 2),
                                  "cuts_per_10s": round(10 / statistics.mean(cut_gaps), 2)})
                    stats["sources"].append(f"샘플 영상 {len(sample_durs)}개(컷 전환 실측)")
            captures: list[tuple[bytes, str]] = []
            for cp in capture_paths[:6]:
                p = Path(cp)
                captures.append((p.read_bytes(), "image/png" if p.suffix.lower() == ".png" else "image/jpeg"))
            if captures:
                stats["sources"].append(f"캡처 {len(captures)}장")

            if not (thumbs or sheets or captures):
                raise RuntimeError("학습할 자료가 없습니다. 채널 주소(YouTube API 키 필요)나 샘플 쇼츠 mp4·캡처를 넣어 주세요. " + " ".join(notes))
            if not s.anthropic_api_key:
                # AI 없이: 실측 통계만 반영한 기본 스타일
                prof = normalize_style(DEFAULT_STYLE | {"summary": f"{st.name}: AI 키가 없어 화면 스타일은 기본값, 길이·컷 속도만 실측 반영",
                                                         "pacing": {"total_seconds": stats.get("sample_avg_seconds") or stats.get("avg_seconds") or 26,
                                                                    "segments": 2, "max_clip_seconds": max(4, (stats.get("avg_shot_seconds") or 7) * 2),
                                                                    "note": "AI 미사용 — 실측 통계만 반영"}})
                notes.append("ANTHROPIC_API_KEY 가 없어 색·자막 모양은 학습하지 못했습니다.")
            else:
                step("AI 가 편집 스타일 정리 중")
                raw = ai_learn(st.channel_title or st.name, stats, titles, thumbs, sheets, captures)
                stats["evidence"], stats["confidence"], stats["model"] = raw.get("evidence"), raw.get("confidence"), raw.get("_model")
                prof = normalize_style(raw)
                # 실측 컷 속도가 있으면 AI 값보다 우선
                if stats.get("avg_shot_seconds"):
                    total = prof["pacing"]["total_seconds"]
                    prof["pacing"]["max_clip_seconds"] = round(max(3.0, min(20.0, stats["median_shot_seconds"] * 2.5)), 1)
                    prof["pacing"]["segments"] = int(max(1, min(6, round(total / max(4.0, stats["avg_shot_seconds"] * 2)))))
            stats["notes"] = notes
            st.profile, st.stats, st.status, st.step, st.error = prof, stats, "ready", "완료", None
            db.commit()
        except Exception as e:
            db.rollback()
            log.exception("스타일 학습 실패")
            st = db.get(ReferenceStyle, style_id)
            st.status, st.error, st.step = "failed", str(e)[:600], None
            db.commit()
        finally:
            shutil.rmtree(work, ignore_errors=True)  # 올린 샘플·캡처는 학습 후 지운다


def start_learning(db, st: ReferenceStyle, sample_paths: list[str], capture_paths: list[str]) -> None:
    st.status, st.step, st.error = "learning", "대기", None
    db.commit()
    threading.Thread(target=run_learning, args=(st.id, sample_paths, capture_paths), daemon=True, name=f"style-{st.id}").start()
