"""판단이 필요한 단계를 Claude API로 처리한다: 분석·제품 선정 → 컷 설계·문구 → 화면 검수.

결과는 모두 work/<편>/ 의 JSON 파일로 남는다. 같은 파일을 사람이나 Claude Code가 직접 써 넣어도
뒤 단계는 똑같이 동작한다(파일이 단계 사이의 약속이다).

환경변수: ANTHROPIC_API_KEY, SHORTS_MODEL(기본 claude-opus-5-5), SHORTS_EFFORT(기본 high)
"""
from __future__ import annotations

import base64
import json
import os
import sys
from pathlib import Path

if __package__ in (None, ""):
    sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from pipeline import asr_words, util  # noqa: E402

MODEL = os.environ.get("SHORTS_MODEL", "claude-opus-5-5")
SFX = ["", "whoosh", "pop", "ding", "sparkle"]


def system_prompt() -> str:
    rules = (util.ROOT / "RULES.md").read_text(encoding="utf-8")
    return ("당신은 유튜브 쇼핑 쇼츠 편집자입니다. 원본 영상 하나에서 20초 이내의 쇼츠 한 편을 설계합니다. "
            "아래 제작 규칙은 사용자와 실제로 한 편을 만들며 확정한 것이니 그대로 지킵니다. "
            "시각은 모두 원본 영상 기준 초 단위 숫자로 답합니다.\n\n" + rules)


# ------------------------------------------------------------------ API 호출
def _client():
    try:
        import anthropic
    except ImportError:
        util.die("anthropic 패키지가 없습니다: pip install anthropic")
    try:
        return anthropic, anthropic.Anthropic()
    except anthropic.AnthropicError as e:
        util.die(f"Claude API를 쓸 수 없습니다: {e}\ntools/shopping-shorts/.env 에 ANTHROPIC_API_KEY 를 넣어 주세요.")


def _has_credentials() -> bool:
    return bool(os.environ.get("ANTHROPIC_API_KEY") or os.environ.get("ANTHROPIC_AUTH_TOKEN"))


def ask_json(content: list, schema: dict, history: list | None = None) -> tuple[dict, list]:
    """구조화 출력(JSON 스키마)으로 답을 받는다. (답, 이어서 쓸 대화 기록)"""
    anthropic, client = _client()
    messages = list(history or []) + [{"role": "user", "content": content}]
    kw = dict(model=os.environ.get("SHORTS_MODEL", MODEL), max_tokens=32000, system=system_prompt(),
              thinking={"type": "adaptive"},
              output_config={"effort": os.environ.get("SHORTS_EFFORT", "high"),
                             "format": {"type": "json_schema", "schema": schema}},
              messages=messages)
    if not os.environ.get("SHORTS_NO_FALLBACK"):
        # 모델이 요청을 거절하면 서버가 다른 모델로 같은 요청을 한 번 더 처리한다
        kw.update(betas=["server-side-fallback-2026-07-01"], fallbacks="default")
    try:
        with client.beta.messages.stream(**kw) as stream:
            msg = stream.get_final_message()
    except anthropic.AuthenticationError:
        util.die("Claude API 인증에 실패했습니다. tools/shopping-shorts/.env 의 ANTHROPIC_API_KEY 를 확인하세요.")
    except anthropic.RateLimitError:
        util.die("Claude API 사용량 한도에 걸렸습니다. 잠시 뒤 같은 명령을 다시 실행하면 이어서 진행합니다.")
    except anthropic.BadRequestError as e:
        util.die(f"Claude API 요청이 거부됐습니다(400): {e.message}")
    except anthropic.APIStatusError as e:
        util.die(f"Claude API 오류({e.status_code}): {e.message}")
    except anthropic.APIConnectionError:
        util.die("Claude API에 연결하지 못했습니다. 인터넷 연결을 확인하세요.")
    except anthropic.AnthropicError as e:
        util.die(f"Claude API를 쓸 수 없습니다: {e}\ntools/shopping-shorts/.env 에 ANTHROPIC_API_KEY 를 넣어 주세요.")
    except TypeError:
        if not _has_credentials():   # 키가 없으면 SDK가 요청을 보내기 전에 TypeError 를 낸다
            util.die("Claude API 키가 없습니다. tools/shopping-shorts/.env 의 ANTHROPIC_API_KEY= 뒤에 키를 넣어 주세요.")
        raise
    if msg.stop_reason == "refusal":
        util.die("모델이 이 요청을 처리하지 않았습니다(refusal).")
    if msg.stop_reason == "max_tokens":
        util.die("모델 답이 길이 한도에서 잘렸습니다. 다시 실행해 주세요.")
    text = next((b.text for b in msg.content if b.type == "text"), None)
    if text is None:
        util.die("모델 답에 본문이 없습니다.")
    data = json.loads(text)
    u = msg.usage
    util.log(f"[Claude] 입력 {u.input_tokens:,} · 출력 {u.output_tokens:,} 토큰 ({msg.model})")
    return data, messages + [{"role": "assistant", "content": msg.content}]


def img_block(path) -> dict:
    data = base64.standard_b64encode(Path(path).read_bytes()).decode("ascii")
    media = "image/png" if str(path).lower().endswith(".png") else "image/jpeg"
    return {"type": "image", "source": {"type": "base64", "media_type": media, "data": data}}


def _sheets(paths, label) -> list:
    out = []
    for i, p in enumerate(paths, 1):
        out += [{"type": "text", "text": f"[{label} {i}/{len(paths)}]"}, img_block(p)]
    return out


def _obj(props: dict) -> dict:
    return {"type": "object", "properties": props, "required": list(props), "additionalProperties": False}


def _arr(items: dict) -> dict:
    return {"type": "array", "items": items}


S, N, I, B = {"type": "string"}, {"type": "number"}, {"type": "integer"}, {"type": "boolean"}


def comments_text(comments: list, limit: int = 100) -> str:
    if not comments:
        return "(댓글을 가져오지 못했습니다)"
    return "\n".join(f"#{i} (좋아요 {c.get('likes_label', c.get('likes', 0))}) {c['text']}"
                     for i, c in enumerate(comments[:limit]))


# ------------------------------------------------------------------ 1) 분석·제품 선정
ANALYSIS_SCHEMA = _obj({
    "channel": S,
    "celebrity": S,
    "paid_ad": B,
    "paid_ad_note": S,
    "burned_in": _obj({"caption_top_y": I, "left_label_right_x": I, "right_label_left_x": I, "note": S}),
    "products": _arr(_obj({"brand": S, "name": S, "start": N, "end": N, "closeups": _arr(N), "demos": _arr(N),
                           "quote": S, "sellable": S})),
    "hooks": _arr(_obj({"t": N, "product": S, "why": S})),
    "pick": _obj({"brand": S, "name": S, "start": N, "end": N, "reason": S}),
    "alternates": _arr(_obj({"brand": S, "name": S, "reason": S})),
})


def vidiq_block(vidiq: str, limit: int = 20000) -> str:
    """사용자가 붙여 넣은 vidIQ 분석(영상을 통째로 본 결과)을 프롬프트에 넣을 글로."""
    vidiq = (vidiq or "").strip()
    if not vidiq:
        return ""
    return ("\n[vidIQ 분석 — 영상을 통째로 보고 낸 결과입니다. 프레임 시트로는 안 보이는 표정·움직임·후킹 판단과 "
            "제품 추천은 이 분석을 우선 근거로 삼고, 시각(초)은 아래 음성 인식과 프레임으로 맞춰 확인합니다]\n"
            + vidiq[:limit] + "\n")


def feedback_block(feedback: str, prev_plan: dict | None = None, prev_copy: dict | None = None) -> str:
    """사용자의 수정 요청(과 고칠 대상인 이전 설계)을 프롬프트에 넣을 글로."""
    feedback = (feedback or "").strip()
    if not feedback:
        return ""
    out = ("\n[사용자의 수정 요청 — 이전 완성본을 보고 직접 적은 요청입니다. 제작 규칙과 부딪치지 않는 한 그대로 반영하고, "
           "부딪치면 규칙 안에서 가장 가까운 방법을 택합니다]\n" + feedback[:4000] + "\n")
    if prev_plan:
        keep = {k: prev_plan.get(k) for k in ("title", "crop", "timeline", "cards", "thumbnail")}
        out += ("\n[이전 설계 — 요청이 닿지 않는 부분은 이대로 둡니다]\n" + json.dumps(keep, ensure_ascii=False) + "\n")
        if prev_copy:
            out += "[이전 제목·문구]\n" + json.dumps(
                {k: prev_copy.get(k) for k in ("combos", "description", "pin_question")}, ensure_ascii=False) + "\n"
    return out


def analyze(meta: dict, asr: dict, sheets: list, info: dict, yt: dict, vidiq: str = "", feedback: str = "") -> dict:
    ask = f"""원본 영상을 분석해 쇼츠 소재가 될 제품을 고릅니다.

영상 정보: 길이 {meta['duration']:.0f}초, {meta['width']}×{meta['height']}
유튜브 제목: {yt.get('title') or '(모름)'} / 채널: {info.get('channel') or yt.get('channel') or '(모름)'}
사용자가 정한 제품: {info.get('product') or '(없음 — 규칙 1에 따라 고릅니다)'}

위 이미지는 일정 간격으로 뽑은 프레임 시트이고 각 프레임 위에 원본 시각이 적혀 있습니다.
{vidiq_block(vidiq)}{feedback_block(feedback)}
[전체 대사 — 음성 인식, 시각 포함]
{asr_words.as_text(asr)}

[영상 설명란]
{yt.get('description') or '(없음)'}

[인기 댓글]
{comments_text(yt.get('comments') or [], 60)}

채워야 할 것
- channel: 출처 표기에 쓸 유튜브 채널명. celebrity: 화자(연예인) 이름. 모르면 빈 문자열.
- paid_ad / paid_ad_note: 원본이 특정 브랜드의 유료 광고 영상인지(화면의 고지 문구, 설명란, 대사 근거).
- burned_in: 원본 화면에 박힌 글자의 위치(원본 픽셀). caption_top_y는 아래쪽 자막 영역의 위쪽 경계 y(없으면 영상 높이),
  left_label_right_x는 왼쪽 위 라벨이 끝나는 x(없으면 0), right_label_left_x는 오른쪽 위 고지 문구가 시작하는 x(없으면 영상 너비).
- products: 영상에 나오는 모든 제품. start/end는 소개 구간, closeups는 제품 클로즈업 시각, demos는 바르거나 시연하는 시각,
  quote는 화자의 가장 강한 한마디(대사 그대로), sellable은 쿠팡 판매·제품 태그 가능성에 대한 한 줄 판단.
- hooks: 20~40대 여성이 쇼츠 첫 3초에 멈출 후킹 순간 TOP 10 (표정·리액션·반전 발언·비포애프터·제형 클로즈업 우선).
- pick: 고른 제품과 그 제품 구간(start/end, 컷을 뽑을 범위. 앞뒤 맥락을 조금 넉넉히), 고른 이유.
- alternates: 차순위 후보 정확히 2개와 이유."""
    data, _ = ask_json(_sheets(sheets, "개요 프레임 시트") + [{"type": "text", "text": ask}], ANALYSIS_SCHEMA)
    return data


# ------------------------------------------------------------------ 2) 컷 설계·문구
DESIGN_SCHEMA = _obj({
    "combos": _arr(_obj({"top1": S, "top2": S, "title": S})),
    "crop": _obj({"size": I, "x_min": I, "x_max": I}),
    "timeline": _arr(_obj({
        "type": {"type": "string", "enum": ["cut", "tts"]},
        "a": N, "b": N, "x0": I,
        "subs": _arr(_obj({"t": N, "text": S, "em": B, "sfx": {"type": "string", "enum": SFX}})),
        "sfx": {"type": "string", "enum": SFX},
        "text": S, "image": S, "still_t": N,
    })),
    "cards": _arr(_obj({"comment": I, "seg": I, "offset": N, "dur": N, "heart": B,
                        "pos": {"type": "string", "enum": ["top", "mid", "bottom"]}})),
    "thumbnail": _obj({"t": N, "x0": I}),
    "description": _obj({"hook_line": S, "body_lines": _arr(S), "closing_line": S, "hashtags": _arr(S)}),
    "pin_question": S,
    "notes": S,
    "revision": S,
})


def design_request(meta: dict, analysis: dict, asr_zoom: dict, sheets: list, info: dict, yt: dict,
                   images: list[str], crop_default: int, vidiq: str = "", feedback: str = "",
                   prev_plan: dict | None = None, prev_copy: dict | None = None) -> list:
    pick = analysis["pick"]
    bi = analysis.get("burned_in") or {}
    ask = f"""'{pick.get('brand', '')} {pick['name']}' 로 쇼츠 한 편을 설계합니다.

원본: {meta['width']}×{meta['height']}, 길이 {meta['duration']:.0f}초. 완성본은 1.1배속입니다.
위 이미지는 제품 구간을 촘촘히 뽑은 프레임 시트입니다. 각 프레임 위에 원본 시각이 있고,
청록색 세로선과 노란 숫자는 원본 x좌표, 빨간 가로선은 기본 1:1 크롭({crop_default}px)의 아래 경계입니다.
분석 단계에서 본 화면 글자 위치: {json.dumps(bi, ensure_ascii=False)}

[이 구간의 음성 인식 — 어절@시작시각, 괄호는 말소리 구간]
{asr_words.as_text(asr_zoom, words=True)}

[분석 요약]
화자: {analysis.get('celebrity', '')} / 채널: {analysis.get('channel', '')}
후킹 순간: {json.dumps(analysis.get('hooks', [])[:10], ensure_ascii=False)}
제품 정보: {json.dumps(next((p for p in analysis.get('products', []) if p.get('name') == pick['name']), {}), ensure_ascii=False)}

{vidiq_block(vidiq, 8000)}{feedback_block(feedback, prev_plan, prev_copy)}
[인기 댓글 — 카드에는 번호(#)로 고릅니다. 원문과 좋아요 수는 프로그램이 그대로 넣습니다]
{comments_text(yt.get('comments') or [])}

[사용자가 준 TTS용 이미지]
{', '.join(images) if images else '(없음 — still_t 로 원본의 정지 화면을 씁니다)'}

출력 형식
- combos: 썸네일 문구(top1 윗줄, top2 아랫줄)와 업로드 제목(title) 조합 3개, 좋은 순서대로. 첫 번째가 화면 상단 제목이 됩니다.
  업로드 제목은 피드에서 손을 멈추게 하는 후킹 문장으로 씁니다(궁금증·반전·구체적인 상황이나 숫자, 40자 이내).
  세 개는 서로 다른 각도로 씁니다.
- crop: size는 1:1 크롭 한 변(보통 {crop_default}), x_min/x_max는 크롭이 들어가도 되는 원본 x 범위(모서리 라벨·고지 문구를 피한 범위).
- timeline: 재생 순서대로.
  · 컷: type "cut", a/b 원본 초, x0 크롭 왼쪽 x, subs 자막 묶음(t는 첫 어절 시작 시각, em은 노란 강조, sfx는 그 순간 효과음 또는 ""),
    sfx는 컷 시작 효과음 또는 "". text와 image는 "", still_t는 -1.
  · TTS: type "tts", text 문구, image는 사용자 이미지 파일명 또는 "", image가 ""이면 still_t(정지 화면 시각)와 x0. a/b는 -1, subs는 [].
- cards: comment는 위 댓글 번호, seg는 카드가 뜨기 시작하는 timeline 순번(0부터), offset은 그 구간 시작 뒤 초, dur는 표시 시간.
  댓글을 가져오지 못했으면 빈 배열.
- thumbnail: 썸네일로 쓸 원본 시각과 x0(표정이 가장 좋은 순간).
- description: hook_line(쓰게 된 계기 한 줄), body_lines(영상에서 직접 말한 내용 2~3줄), closing_line, hashtags(# 포함 15개 안팎).
- pin_question: 핀 댓글의 시청자 참여 질문 한 줄.
- notes: 완성본을 받은 사용자가 직접 확인해야 할 점만 짧게(두세 줄). 설계를 고친 과정, 차순위 후보,
  인포크 번호처럼 프로그램이 따로 알리는 내용은 쓰지 않습니다. 없으면 "".
- revision: 사용자의 수정 요청이 있을 때만, 요청마다 어떻게 반영했는지 한 줄씩(반영하지 못한 것은 이유와 함께). 요청이 없으면 "".

완성 길이는 컷 길이 합 ÷ 1.1 + TTS 길이(대략 글자당 0.15초 + 0.3초)로 어림합니다."""
    return _sheets(sheets, "제품 구간 프레임 시트") + [{"type": "text", "text": ask}]


def to_plan(d: dict, analysis: dict, info: dict, yt: dict) -> tuple[dict, dict]:
    """모델 답을 build.py가 읽는 plan과 업로드 문구(copy)로 바꾼다."""
    pick = analysis["pick"]
    product = info.get("product") or f"{pick.get('brand', '')} {pick['name']}".strip()
    channel = info.get("channel") or analysis.get("channel") or yt.get("channel") or ""
    tl, k = [], 0
    for s in d["timeline"]:
        if s["type"] == "cut":
            seg = {"type": "cut", "a": round(s["a"], 2), "b": round(s["b"], 2), "x0": s["x0"], "subs": []}
            for sb in s["subs"]:
                item = {"t": round(sb["t"], 2), "text": sb["text"]}
                if sb["em"]:
                    item["em"] = True
                if sb["sfx"]:
                    item["sfx"] = sb["sfx"]
                seg["subs"].append(item)
        else:
            k += 1
            seg = {"type": "tts", "text": s["text"].strip(), "audio": f"tts{k}.mp3"}
            if s["image"]:
                seg["image"] = s["image"]
            else:
                seg.update(still_t=round(s["still_t"], 2), x0=s["x0"])
        if s["sfx"]:
            seg["sfx"] = s["sfx"]
        tl.append(seg)
    comments = yt.get("comments") or []
    cards = []
    for c in d["cards"]:
        if 0 <= c["comment"] < len(comments):
            src = comments[c["comment"]]
            cards.append({"seg": c["seg"], "offset": round(c["offset"], 2), "dur": round(c["dur"], 2),
                          "text": src["text"], "likes": src.get("likes_label", str(src.get("likes", ""))),
                          "heart": bool(c["heart"]), "pos": c["pos"]})
    top = d["combos"][0]
    plan = {
        "product": product, "brand": pick.get("brand", ""), "channel": channel,
        "source_text": f"출처 : 유튜브 '{channel}'" if channel else "",
        "title": [top["top1"], top["top2"]],
        "crop": {"size": d["crop"]["size"], "y0": 0, "x_min": d["crop"]["x_min"], "x_max": d["crop"]["x_max"]},
        "timeline": tl, "cards": cards,
        "thumbnail": {"t": round(d["thumbnail"]["t"], 2), "x0": d["thumbnail"]["x0"]},
    }
    copy = {"product": product,
            "combos": [{"top": [c["top1"], c["top2"]], "title": c["title"]} for c in d["combos"][:3]],
            "description": d["description"], "pin_question": d["pin_question"], "notes": d["notes"],
            "revision": d.get("revision", "")}
    return plan, copy


def repair_request(problems: list[str]) -> list:
    return [{"type": "text", "text": "방금 설계를 규칙 검사기에 넣었더니 아래 문제가 나왔습니다. "
             "이 문제들을 고친 전체 설계를 같은 형식으로 다시 주세요. 문제없는 부분은 그대로 둡니다.\n\n"
             + "\n".join(f"- {p}" for p in problems)}]


# ------------------------------------------------------------------ 3) 화면 검수
REVIEW_SCHEMA = _obj({
    "ok": B,
    "issues": _arr(_obj({
        "seg": I, "problem": S,
        "fix": {"type": "string", "enum": ["x0", "card_pos", "none"]},
        "x0": I, "card": I, "pos": {"type": "string", "enum": ["top", "mid", "bottom"]},
    })),
})


def review(resolved: dict, plan: dict, sheets: list, meta: dict, crop_size: int) -> dict:
    ask = f"""완성본을 1초 간격으로 뽑은 프레임입니다(각 프레임 위 숫자는 완성본 시각). 끝났다고 하기 전의 화면 검수를 합니다.
- 원본에 박혀 있던 자막·브랜드 라벨·광고 고지 문구가 1:1 영상 안에 들어왔는가 (거울반전돼 뒤집힌 글자로 보입니다)
- 자막이 얼굴을 가리는가, 댓글 카드가 얼굴을 덮는가
- 인물이나 제품이 화면 밖으로 잘렸는가

구간 정보(완성본 시각 → 원본 구간과 x0): {json.dumps(resolved['segments'], ensure_ascii=False)}
댓글 카드: {json.dumps(resolved['cards'], ensure_ascii=False)}
원본 너비 {meta['width']}, 크롭 한 변 {crop_size}. 거울반전이므로 완성본에서 왼쪽으로 치우친 것은 원본에서는 오른쪽에 있습니다.

문제가 없으면 ok=true, issues=[]. 문제가 있으면 구간(seg)마다 하나씩:
fix "x0" 는 그 구간의 새 x0(원본 픽셀), fix "card_pos" 는 card(카드 순번, 0부터)와 새 pos, 고칠 방법이 없으면 "none".
쓰지 않는 숫자 칸은 -1, pos는 "top"."""
    data, _ = ask_json(_sheets(sheets, "완성본 프레임 시트") + [{"type": "text", "text": ask}], REVIEW_SCHEMA)
    return data


def apply_review(plan: dict, rv: dict, meta: dict, crop_size: int) -> list[str]:
    """검수에서 나온 수정 지시를 plan에 반영한다. 한 일 목록을 돌려준다."""
    done = []
    c = plan.get("crop") or {}
    lo, hi = int(c.get("x_min", 0) or 0), int(c.get("x_max", 0) or meta["width"]) - crop_size
    for it in rv.get("issues", []):
        if it["fix"] == "x0" and 0 <= it["seg"] < len(plan["timeline"]) and it["x0"] >= 0:
            seg = plan["timeline"][it["seg"]]
            if "x0" in seg:
                new = max(lo, min(hi, it["x0"]))
                if new != seg["x0"]:
                    done.append(f"구간 {it['seg']}: x0 {seg['x0']} → {new} ({it['problem']})")
                    seg["x0"] = new
        elif it["fix"] == "card_pos" and 0 <= it["card"] < len(plan.get("cards", [])):
            card = plan["cards"][it["card"]]
            if card.get("pos") != it["pos"]:
                done.append(f"댓글 카드 {it['card']}: 위치 {card.get('pos')} → {it['pos']} ({it['problem']})")
                card["pos"] = it["pos"]
    return done
