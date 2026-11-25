"""설명란·채널 소개의 링크 페이지(인포크링크·링크트리 등)를 따라가 상품 링크를 모은다.

- 공개 웹페이지를 브라우저처럼 1회 GET 해 링크만 추출한다(로그인·우회·대량 수집 없음).
- 단축 링크(link.coupang.com, naver.me, bit.ly 등)는 리다이렉트를 따라 최종 주소를 확인한다.
- 유튜브 쇼핑 '제품 태그'는 공식 Data API 가 제공하지 않으므로 수집하지 않는다(사실대로 표시).
"""
from __future__ import annotations

import html as _html
import re
from datetime import datetime, timezone
from urllib.parse import urlparse

import httpx

LINK_HUB_HOSTS = ("inpock.link", "inpock.co.kr", "link.inpock.co.kr", "litt.ly", "linktr.ee", "bio.link", "lnk.bio", "linkbio.co",
                  "taplink.cc", "msha.ke", "campsite.bio", "beacons.ai", "solo.to", "linkin.bio", "lit.link", "allmylinks.com", "hoo.be")
SHORTENER_HOSTS = ("link.coupang.com", "coupa.ng", "naver.me", "bit.ly", "han.gl", "vo.la", "me2.do", "url.kr", "buly.kr", "c11.kr",
                   "tinyurl.com", "t.ly", "goo.gl", "is.gd", "abit.ly", "zrr.kr", "lrl.kr")
SHOP_HOSTS = ("coupang.com", "smartstore.naver.com", "brand.naver.com", "shopping.naver.com", "m.smartstore.naver.com", "oliveyoung.co.kr",
              "kurly.com", "musinsa.com", "29cm.co.kr", "ohou.se", "gmarket.co.kr", "auction.co.kr", "11st.co.kr", "ssg.com", "lotteon.com",
              "amazon.", "aliexpress.com", "temu.com", "zigzag.kr", "a-bly.com", "wconcept.co.kr", "cjonstyle.com", "hmall.com", "gsshop.com",
              "lotteimall.com", "wemakeprice.com", "tmon.co.kr", "idus.com", "ably.", "kakao.com/talk", "store.kakao.com", "gift.kakao.com",
              "shop.", "mall.", "store.", "cafe24.com", "imweb.me", "sixshop.com", "godo.co.kr", "makeshop.co.kr")
STATIC_EXT = (".js", ".css", ".png", ".jpg", ".jpeg", ".gif", ".svg", ".webp", ".ico", ".woff", ".woff2", ".ttf", ".json", ".xml", ".map")
UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) SHOPPULSE/3.0 (link preview)"
_URL_RE = re.compile(r"https?://[^\s<>\"'\\)\]}]+")
_A_RE = re.compile(r"<a\b[^>]*href=[\"']([^\"']+)[\"'][^>]*>(.*?)</a>", re.I | re.S)


def host_of(url: str) -> str:
    try:
        return (urlparse(url).hostname or "").lower()
    except ValueError:
        return ""


def is_link_hub(url: str) -> bool:
    h = host_of(url)
    return any(h == d or h.endswith("." + d) for d in LINK_HUB_HOSTS)


def is_shortener(url: str) -> bool:
    h = host_of(url)
    return any(h == d or h.endswith("." + d) for d in SHORTENER_HOSTS)


def is_shop(url: str) -> bool:
    h = host_of(url)
    u = url.lower()
    return any(d in h or d in u for d in SHOP_HOSTS)


def expand(url: str, timeout: float = 6.0) -> str:
    """단축 링크를 끝까지 따라가 최종 URL 을 돌려준다. 실패하면 원래 URL."""
    if not is_shortener(url):
        return url
    try:
        with httpx.Client(follow_redirects=True, timeout=timeout, headers={"User-Agent": UA}) as c:
            r = c.get(url)
            return str(r.url)
    except httpx.HTTPError:
        return url


def fetch_hub_links(url: str, timeout: float = 8.0) -> list[dict]:
    """링크 페이지의 링크(제목+주소) 추출. 앵커 + HTML 안의 URL 전체 스캔."""
    try:
        r = httpx.get(url, follow_redirects=True, timeout=timeout, headers={"User-Agent": UA, "Accept-Language": "ko,en;q=0.8"})
        if r.status_code != 200:
            return []
        body = r.text
    except httpx.HTTPError:
        return []
    page_host = host_of(str(url))
    out: dict[str, dict] = {}
    for href, inner in _A_RE.findall(body):
        if not href.startswith("http"):
            continue
        title = _html.unescape(re.sub(r"<[^>]+>", " ", inner)).strip()
        title = re.sub(r"\s+", " ", title)[:120]
        out.setdefault(href, {"title": title, "url": href})
    for u in _URL_RE.findall(body):
        u = u.rstrip(".,;")
        if u in out or u.lower().endswith(STATIC_EXT):
            continue
        h = host_of(u)
        if not h or h == page_host or h.endswith("." + page_host) or any(x in h for x in ("googleapis", "gstatic", "facebook", "fbcdn", "google-analytics", "googletagmanager", "cloudfront", "cdn.", "fonts.", "w3.org", "schema.org", "vercel", "sentry")):
            continue
        out[u] = {"title": "", "url": u}
    return list(out.values())


def resolve_video_links(description: str | None, channel_description: str | None = None, max_hubs: int = 3) -> dict:
    """영상 설명·채널 소개에서 링크 허브/상품/단축 링크를 모아 정리한다."""
    text = f"{description or ''}\n{channel_description or ''}"
    seen: set[str] = set()
    hubs, products, others = [], [], []
    for raw in _URL_RE.findall(text):
        u = raw.rstrip(".,;)")
        if u in seen:
            continue
        seen.add(u)
        if is_link_hub(u):
            hubs.append(u)
        else:
            final = expand(u)
            item = {"title": "", "url": u, "final_url": final, "host": host_of(final), "is_shopping": is_shop(final), "via": "description"}
            (products if item["is_shopping"] else others).append(item)
    hub_results = []
    for hub in hubs[:max_hubs]:
        links = fetch_hub_links(hub)
        got = []
        for l in links:
            final = expand(l["url"])
            if final in seen:
                continue
            seen.add(final)
            item = {"title": l["title"], "url": l["url"], "final_url": final, "host": host_of(final), "is_shopping": is_shop(final), "via": host_of(hub)}
            got.append(item)
            (products if item["is_shopping"] else others).append(item)
        hub_results.append({"hub": hub, "host": host_of(hub), "links_found": len(links), "shopping_links": sum(1 for g in got if g["is_shopping"])})
    return {"resolved_at": datetime.now(timezone.utc).isoformat(), "hubs": hub_results, "products": products,
            "others": [o for o in others if not o["url"].lower().endswith(STATIC_EXT)][:30],
            "note": "설명란·채널 소개·링크 페이지에서 수집한 공개 링크입니다. 유튜브 쇼핑 '제품 태그'는 공식 API 가 제공하지 않아 포함되지 않습니다."}
