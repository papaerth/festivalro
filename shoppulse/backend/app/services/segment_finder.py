"""원본 영상 안에서 쇼츠가 쓴 **장면(몇 분 몇 초 ~ 몇 분 몇 초)** 찾기.

근거 순서:
1) 원본 자막(transcript: vidIQ MCP 등에서 가져온 타임스탬프 텍스트) — 쇼츠 제목·상품명 단어가 몰려 있는 구간
2) 원본 설명란의 챕터 타임스탬프(예: 03:15 트레이더조 쇼핑) — 단어가 맞는 챕터 구간
3) 둘 다 없으면 '찾을 수 없음'과 자막 요청 안내
AI 키가 있고 자막이 있으면 Claude 가 구간과 **자막 속 실제 발언**을 정밀하게 고른다(발언을 새로 만들지 않음).
"""
from __future__ import annotations

import json
import re
from datetime import datetime

from sqlalchemy.orm import Session

from ..models import SourcingCandidate, Video, VideoSegment, utcnow
from .original_finder import extract_keywords

_TS_LINE = re.compile(r"^\s*\(?((?:\d{1,2}:)?\d{1,2}:\d{2})\)?\s*[-–—:|]?\s*(.+)$")
_TR_LINE = re.compile(r"\[(\d{1,2}:)?(\d{1,2}):(\d{2})\]\s*")


def hms_to_sec(s: str) -> int:
    parts = [int(p) for p in s.split(":")]
    return parts[0] * 3600 + parts[1] * 60 + parts[2] if len(parts) == 3 else parts[0] * 60 + parts[1]


def fmt_ts(sec: int | None) -> str:
    if sec is None:
        return "?"
    return f"{sec // 3600}:{(sec % 3600) // 60:02d}:{sec % 60:02d}" if sec >= 3600 else f"{sec // 60:02d}:{sec % 60:02d}"


def parse_chapters(description: str | None, duration: int | None = None) -> list[dict]:
    out = []
    for line in (description or "").splitlines():
        m = _TS_LINE.match(line)
        if m:
            out.append({"start": hms_to_sec(m.group(1)), "title": m.group(2).strip()})
    out.sort(key=lambda c: c["start"])
    for i, c in enumerate(out):
        c["end"] = out[i + 1]["start"] if i + 1 < len(out) else duration
    return out if len(out) >= 2 else []


def parse_transcript_text(text: str) -> list[dict]:
    """vidIQ 'transcription' 형식: '[0:15] 문장 ...' 줄들 → [{start, text}]"""
    segs = []
    for line in (text or "").splitlines():
        m = _TR_LINE.match(line)
        if not m:
            if segs and line.strip():
                segs[-1]["text"] += " " + line.strip()
            continue
        h = int(m.group(1).rstrip(":")) if m.group(1) else 0
        start = h * 3600 + int(m.group(2)) * 60 + int(m.group(3))
        segs.append({"start": start, "text": line[m.end():].strip()})
    return segs


def transcript_from_payload(item: dict) -> dict | None:
    """vidIQ vidiq_video_transcript 응답({videoId, transcription, language}) 또는 {segments:[...]} → 저장 형식"""
    if isinstance(item.get("segments"), list):
        segs = [{"start": int(s.get("start", 0)), "text": str(s.get("text", ""))} for s in item["segments"]]
    elif isinstance(item.get("transcription"), str):
        segs = parse_transcript_text(item["transcription"])
    else:
        return None
    if not segs:
        return None
    return {"source": item.get("source") or "vidiq_mcp", "language": item.get("language"), "segments": segs,
            "fetched_at": utcnow().isoformat(), "count": len(segs)}


def _window_search(segs: list[dict], kws: list[str], max_window: int = 90) -> dict | None:
    kl = [k.lower() for k in kws]
    hits_per = []
    for s in segs:
        t = s["text"].lower()
        hits_per.append([k for k in kl if k in t])
    best, best_score = None, 0.0
    n = len(segs)
    for i in range(n):
        if not hits_per[i]:
            continue
        found: dict[str, int] = {}
        j = i
        while j < n and segs[j]["start"] - segs[i]["start"] <= max_window:
            for k in hits_per[j]:
                found[k] = found.get(k, 0) + 1
            j += 1
        score = len(found) * 2 + sum(found.values()) * 0.3
        if score > best_score:
            best_score, best = score, (i, j - 1, found)
    if not best:
        return None
    i, j, found = best
    # 실제로 단어가 나온 첫/마지막 세그먼트로 좁힌다
    hit_idx = [k for k in range(i, j + 1) if hits_per[k]]
    a, b = hit_idx[0], hit_idx[-1]
    start = max(0, segs[a]["start"] - 3)
    end = (segs[b + 1]["start"] if b + 1 < n else segs[b]["start"] + 15)
    quote = " ".join(segs[k]["text"] for k in range(a, b + 1))
    return {"start": start, "end": end, "quote": quote[:400], "matched": sorted(found, key=lambda k: -found[k]), "score": round(best_score, 1)}


def propose_segment(c: SourcingCandidate, use_ai: bool = True) -> dict:
    short = c.video
    orig = short.original
    if orig is None:
        return {"status": "no_original", "note": "원본 영상이 연결되지 않았습니다. 먼저 원본을 찾아 연결하세요."}
    names = [c.celebrity.name] if c.celebrity else []
    kws = extract_keywords(short, c.product.name if c.product else None, names)
    base = {"status": "none", "original_video_id": orig.id, "original_url": orig.url, "keywords": kws,
            "checked_at": utcnow().isoformat()}
    tr = (orig.transcript or {}).get("segments") if isinstance(orig.transcript, dict) else None
    if tr:
        w = _window_search(tr, kws)
        if w:
            prop = base | {"status": "found", "basis": "transcript", "start": w["start"], "end": w["end"], "quote": w["quote"],
                           "matched": w["matched"], "score": w["score"],
                           "note": f"원본 자막에서 쇼츠 단어({', '.join(w['matched'][:4])})가 몰린 구간. 발언은 자막 원문 그대로이며 오타가 있을 수 있습니다."}
            if use_ai:
                try:
                    from ..config import get_settings
                    if get_settings().anthropic_api_key:
                        prop = _ai_refine(prop, tr, short, c.product.name if c.product else None) or prop
                except Exception as e:
                    prop["ai_note"] = f"AI 정밀 검토 실패: {str(e)[:100]}"
            prop["link"] = f"{orig.url}&t={int(prop['start'])}s" if orig.url else None
            prop["range_label"] = f"{fmt_ts(prop['start'])} ~ {fmt_ts(prop['end'])}"
            return prop
        base["note"] = "원본 자막은 있지만 쇼츠 단어가 나오는 구간을 찾지 못했습니다. 상품명을 연결하면 단어가 늘어납니다."
    chapters = parse_chapters(orig.description, orig.duration_seconds)
    if chapters:
        scored = []
        for ch in chapters:
            t = ch["title"].lower()
            hits = [k for k in kws if k.lower() in t]
            if hits:
                scored.append((len(hits), ch, hits))
        if scored:
            scored.sort(key=lambda x: -x[0])
            _, ch, hits = scored[0]
            return base | {"status": "found", "basis": "chapters", "start": ch["start"], "end": ch["end"], "quote": None,
                           "matched": hits, "chapter_title": ch["title"],
                           "link": f"{orig.url}&t={ch['start']}s" if orig.url else None,
                           "range_label": f"{fmt_ts(ch['start'])} ~ {fmt_ts(ch['end'])}",
                           "note": f"원본 설명란 챕터 「{ch['title']}」 구간(단어 {', '.join(hits)}). 실제 발언은 자막이 있어야 확인됩니다."}
        base["note"] = (base.get("note") or "") + " 설명란 챕터에는 맞는 제목이 없습니다."
    if not tr:
        base["needs_transcript"] = True
        base["transcript_request"] = transcript_request_prompt([orig.youtube_video_id])
        base["note"] = (base.get("note") or "") + " 원본 자막이 없어 구간을 찾을 수 없습니다. 아래 요청 문구로 vidIQ 자막을 받아 「vidIQ JSON 업로드」에 올리면 자동으로 찾습니다."
    return base


def _ai_refine(prop: dict, tr: list[dict], short: Video, product_name: str | None) -> dict | None:
    from .claude_client import create_json
    lo, hi = prop["start"] - 120, prop["end"] + 120
    excerpt = [s for s in tr if lo <= s["start"] <= hi]
    schema = {"type": "object", "additionalProperties": False, "required": ["start", "end", "quote", "confidence", "reason"],
              "properties": {"start": {"type": "integer"}, "end": {"type": "integer"}, "quote": {"type": "string"},
                             "confidence": {"type": "string", "enum": ["high", "medium", "low"]}, "reason": {"type": "string"}}}
    system = ("당신은 유튜브 원본 영상에서 재편집 쇼츠가 잘라 쓴 구간을 찾는 편집 보조다. 한국어로 답한다. "
              "자막 발췌(초 단위 시작 시각 포함)와 쇼츠 제목·상품명을 보고, 쇼츠가 다룬 상품·발언이 나오는 구간의 start/end(초)와 "
              "그 구간의 **자막 원문 그대로의 핵심 발언(quote)** 을 고른다. 자막에 없는 말을 만들지 않는다. "
              "start 는 발언이 시작되기 직전 자막 세그먼트의 시각, end 는 발언이 끝난 다음 세그먼트 시각으로 한다.")
    payload = {"short_title": short.title, "short_description": (short.description or "")[:400], "product": product_name,
               "rule_candidate": {"start": prop["start"], "end": prop["end"]},
               "transcript_excerpt": [{"t": s["start"], "text": s["text"]} for s in excerpt]}
    out = create_json(system=system, max_tokens=1200, output_schema=schema,
                      messages=[{"role": "user", "content": json.dumps(payload, ensure_ascii=False)}])
    if not out or out.get("start") is None:
        return None
    start, end = int(out["start"]), int(out["end"])
    if end <= start:
        return None
    return prop | {"start": start, "end": end, "quote": (out.get("quote") or prop["quote"])[:400], "basis": "transcript+ai",
                   "ai": {"confidence": out.get("confidence"), "reason": out.get("reason"), "model": out.get("_model")},
                   "note": prop["note"] + f" AI 정밀 검토({out.get('confidence')}): {out.get('reason', '')}"}


def adopt_segment(db: Session, c: SourcingCandidate, prop: dict, by: str = "auto") -> VideoSegment:
    orig = c.video.original
    if orig is None:
        raise ValueError("원본 영상이 연결되지 않았습니다")
    basis = prop.get("basis", "manual")
    src = "captions" if basis.startswith("transcript") else ("description_only" if basis == "chapters" else "user_provided")
    seg = VideoSegment(video_id=orig.id, start_seconds=int(prop["start"]), end_seconds=int(prop["end"]) if prop.get("end") is not None else None,
                       quote=prop.get("quote"), content_type=c.content_type, source=src, verification_status="unverified",
                       context=prop.get("chapter_title"),
                       notes=f"[{by}] {prop.get('note', '')} (근거: {basis}, 단어: {', '.join(prop.get('matched', [])[:5])}) — 원본을 직접 보고 확인하세요")
    db.add(seg)
    db.flush()
    c.segment_id = seg.id
    db.commit()
    return seg


def segment_step(db: Session, use_ai: bool = True) -> dict:
    """원본은 있는데 장면이 없는 활성 후보에 자동 제안을 돌리고, 근거가 자막/챕터면 '미검증 장면'으로 저장한다."""
    cands = (db.query(SourcingCandidate)
             .filter(SourcingCandidate.is_demo.is_(False), SourcingCandidate.status.notin_(["rejected", "published", "analyzing"])).all())
    found = tried = need_tr = 0
    for c in cands:
        if c.segment_id or c.video.original is None:
            continue
        tried += 1
        prop = propose_segment(c, use_ai=use_ai)
        if prop.get("status") == "found":
            adopt_segment(db, c, prop, by="자동 제안")
            found += 1
        elif prop.get("needs_transcript"):
            need_tr += 1
    return {"tried": tried, "found": found, "needs_transcript": need_tr}


def transcript_request_prompt(video_ids: list[str]) -> str:
    return ("vidIQ 도구를 사용해 아래 유튜브 영상들의 자막(전체 스크립트)을 받아 주세요. 각 영상마다 vidiq_video_transcript 를 호출하고, "
            "결과는 가공하지 말고 각 호출의 원본 JSON 응답({\"videoId\": ..., \"transcription\": ..., \"language\": ...})을 그대로 JSON 배열로 묶어 "
            "하나의 .json 파일(예: vidiq_transcripts.json)로 저장해 주세요. 자막이 없다고 나오는 영상은 건너뛰고 목록만 알려 주세요.\n\n영상 ID 목록:\n"
            + "\n".join(video_ids))
