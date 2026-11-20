"""실제 유튜브 댓글창을 브라우저로 열어, 고른 댓글을 화면 그대로 캡처한다.

  python pipeline/capture.py <유튜브 링크> <출력 폴더> "댓글 원문 1" "댓글 원문 2"

다시 그리지 않는다. 캡처한 그림에서 프로필 사진과 아이디 자리만 모자이크할 수 있게 좌표를 함께 돌려준다.
PC에 깔린 Edge 나 Chrome 을 화면 없이 띄운다(pip install playwright 만 필요, 브라우저를 따로 받지 않는다).
"""
from __future__ import annotations

import hashlib
import os
import re
import sys
from pathlib import Path

if __package__ in (None, ""):
    sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from pipeline import util  # noqa: E402
from pipeline.comments import video_id  # noqa: E402

SCALE = 3          # 화면 배율(선명하게 찍으려고)
VIEW_W = 520       # 폰 화면에 가까운 너비로 열어 댓글이 폰에서처럼 줄바꿈되게 한다
THREAD = "ytd-comment-thread-renderer"
HIDE_CSS = ("#masthead-container, ytd-popup-container, tp-yt-paper-dialog, ytd-consent-bump-v2-lightbox, "
            "ytd-mealbar-promo-renderer, #clarify-box { display: none !important; }")
EMOJI = re.compile("[\U0001F000-\U0001FAFF\U00002600-\U000027BF\U0001F1E6-\U0001F1FF\U00002B00-\U00002BFF"
                   "\U0000FE00-\U0000FE0F\U0000200D]")

# 댓글 목록에서 글과 위치를 읽는 스크립트(유튜브 화면 구조가 바뀌면 여기를 고친다)
READ_JS = """
() => Array.from(document.querySelectorAll('ytd-comment-thread-renderer')).map(t => {
  const c = t.querySelector('#content-text');
  let text = '';
  if (c) c.childNodes.forEach(function walk(n) {
    if (n.nodeType === 3) text += n.textContent;
    else if (n.tagName === 'IMG') text += (n.alt || '');
    else n.childNodes.forEach(walk);
  });
  return text;
})
"""


def norm(text: str) -> str:
    return re.sub(r"\s+", "", EMOJI.sub("", str(text)))


def card_file(text: str) -> str:
    return "card_" + hashlib.md5(norm(text).encode("utf-8")).hexdigest()[:10] + ".png"


def available() -> bool:
    if os.environ.get("SHORTS_CAPTURE", "1").strip() in ("0", "off", "no"):
        return False
    import importlib.util
    return importlib.util.find_spec("playwright") is not None


def _launch(p):
    """PC에 깔린 Edge → Chrome → (있으면) 플레이라이트 브라우저 순으로 띄운다."""
    exe = os.environ.get("SHORTS_BROWSER")
    tries = [dict(executable_path=exe)] if exe else []
    tries += [dict(channel="msedge"), dict(channel="chrome"), {}]
    last = None
    for kw in tries:
        try:
            return p.chromium.launch(headless=True, args=["--mute-audio"], **kw)
        except Exception as e:   # 그 브라우저가 없으면 다음 것을 써 본다
            last = e
    raise RuntimeError(f"브라우저를 띄우지 못했습니다(Edge 나 Chrome 이 필요합니다): {last}")


def capture_comments(url: str, texts: list[str], out_dir, max_scrolls: int = 30, log=util.log) -> dict:
    """texts 의 각 댓글을 찾아 캡처한다. {원문: {"image": 파일명, "mosaic": [[x,y,w,h], …]}} (못 찾은 것은 빠진다)."""
    from playwright.sync_api import sync_playwright
    out_dir = Path(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    page_url = os.environ.get("SHORTS_CAPTURE_URL") or f"https://www.youtube.com/watch?v={video_id(url)}&hl=ko&gl=KR"
    want = {norm(t): t for t in texts if norm(t)}
    found: dict = {}
    with sync_playwright() as p:
        browser = _launch(p)
        try:
            ctx = browser.new_context(viewport={"width": VIEW_W, "height": 1500}, device_scale_factor=SCALE,
                                      locale="ko-KR", color_scheme="light",
                                      extra_http_headers={"Accept-Language": "ko-KR,ko;q=0.9"})
            page = ctx.new_page()
            page.set_default_timeout(20000)
            page.goto(page_url, wait_until="domcontentloaded", timeout=45000)
            for label in ("모두 수락", "모두 거부", "Accept all", "Reject all"):   # 쿠키 동의 창이 뜨는 지역
                try:
                    btn = page.get_by_role("button", name=label)
                    if btn.count():
                        btn.first.click(timeout=2000)
                        break
                except Exception:
                    pass
            page.add_style_tag(content=HIDE_CSS)
            try:
                page.evaluate("() => { const v = document.querySelector('video'); if (v) { v.pause(); v.muted = true; } }")
            except Exception:
                pass
            index: dict = {}
            for step in range(max_scrolls):
                page.mouse.wheel(0, 2200)
                page.wait_for_timeout(900)
                try:
                    listed = page.evaluate(READ_JS)
                except Exception:
                    listed = []
                for i, t in enumerate(listed):
                    k = norm(t)
                    if k in want and k not in index:
                        index[k] = i
                if len(index) == len(want):
                    break
                if step == 6 and not listed:
                    log("[캡처] 댓글 목록이 나타나지 않습니다(댓글이 막힌 영상이거나, 화면 구조가 바뀌었을 수 있습니다).")
            for k, i in index.items():
                thread = page.locator(THREAD).nth(i)
                box_el = thread.locator("#comment").first
                if not box_el.count():
                    box_el = thread
                box_el.scroll_into_view_if_needed()
                page.wait_for_timeout(400)
                bb = box_el.bounding_box()
                if not bb:
                    continue
                rects = []
                # 가릴 곳: 프로필 사진, 아이디(채널 주인 표시 포함). 앞의 것부터 찾아 있는 것을 쓴다
                for group in (("#author-thumbnail img", "#author-thumbnail yt-img-shadow", "#author-thumbnail .av",
                               "#author-thumbnail"),
                              ("#header-author #author-text", "#author-text"), ("#author-comment-badge",)):
                    r = None
                    for sel in group:
                        el = box_el.locator(sel).first
                        try:
                            r = el.bounding_box() if el.count() else None
                        except Exception:
                            r = None
                        if r:
                            break
                    if r and r["width"] > 2 and r["height"] > 2:
                        rects.append([int((r["x"] - bb["x"]) * SCALE) - 4, int((r["y"] - bb["y"]) * SCALE) - 4,
                                      int(r["width"] * SCALE) + 8, int(r["height"] * SCALE) + 8])
                name = card_file(want[k])
                box_el.screenshot(path=str(out_dir / name))
                found[want[k]] = {"image": name, "mosaic": rects}
        finally:
            browser.close()
    return found


def capture_for_plan(plan: dict, url: str, inp_dir, log=util.log) -> list[str]:
    """plan 의 댓글 카드마다 실제 캡처를 붙인다(이미 캡처가 있으면 그대로 둔다). 한 일을 글로 돌려준다."""
    inp_dir = Path(inp_dir)
    todo = []
    for c in plan.get("cards") or []:
        if not c.get("text") or c.get("on_video") or c.get("no_capture"):
            continue
        f = card_file(c["text"])
        if c.get("image") == f and (inp_dir / f).exists():
            continue
        if (inp_dir / f).exists() and c.get("mosaic"):
            c["image"] = f
            continue
        todo.append(c)
    if not todo:
        return []
    if not available():
        return ["실제 댓글 캡처를 건너뜁니다(pip install playwright 가 필요합니다). 그린 댓글 상자를 씁니다."]
    if not video_id(url) and not os.environ.get("SHORTS_CAPTURE_URL"):
        return ["유튜브 링크가 없어 실제 댓글을 캡처하지 못했습니다. 그린 댓글 상자를 씁니다."]
    log(f"[캡처] 유튜브 댓글창에서 댓글 {len(todo)}개를 찾는 중…")
    try:
        got = capture_comments(url, [c["text"] for c in todo], inp_dir, log=log)
    except Exception as e:      # 캡처는 꾸밈일 뿐이니 실패해도 영상은 만든다
        return [f"실제 댓글 캡처에 실패해 그린 댓글 상자를 씁니다: {str(e).splitlines()[0][:160]}"]
    notes = []
    for c in todo:
        hit = got.get(c["text"])
        if hit:
            c.update(hit)
        else:
            notes.append(f"댓글창에서 이 댓글을 찾지 못해 그린 상자를 씁니다: {c['text'][:20]}")
    log(f"[캡처] {len(got)}개 캡처했습니다.")
    return notes


if __name__ == "__main__":
    if len(sys.argv) < 4:
        util.die('사용법: python pipeline/capture.py <유튜브 링크> <출력 폴더> "댓글 원문" …')
    res = capture_comments(sys.argv[1], sys.argv[3:], sys.argv[2])
    for t, v in res.items():
        print(v["image"], v["mosaic"], t)
    if len(res) < len(sys.argv) - 3:
        print("찾지 못한 댓글이 있습니다.")
