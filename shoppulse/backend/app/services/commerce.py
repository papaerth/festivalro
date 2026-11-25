"""상품 판매처 조회 커넥터(공식 API만 사용).

- 네이버 쇼핑 검색 API: NAVER_CLIENT_ID / NAVER_CLIENT_SECRET (developers.naver.com 에서 애플리케이션 등록, '검색' API)
- 쿠팡 파트너스 Open API: COUPANG_ACCESS_KEY / COUPANG_SECRET_KEY (partners.coupang.com → 추가 기능 → Open API 키 발급)
키가 없으면 각 소스는 'not_configured' 로 보고하고 조용히 건너뛴다. 가격·재고는 조회 시점 기준이다.
"""
from __future__ import annotations

import hashlib
import hmac
import html
import re
from datetime import datetime, timezone
from urllib.parse import quote, urlencode

import httpx

from ..config import get_settings


def _strip_tags(s: str | None) -> str:
    return html.unescape(re.sub(r"<[^>]+>", "", s or ""))


def naver_status() -> str:
    s = get_settings()
    return "configured" if (s.naver_client_id and s.naver_client_secret) else "not_configured"


def coupang_status() -> str:
    s = get_settings()
    return "configured" if (s.coupang_access_key and s.coupang_secret_key) else "not_configured"


def search_naver(query: str, limit: int = 10) -> dict:
    s = get_settings()
    if naver_status() != "configured":
        return {"source": "naver", "status": "not_configured", "items": [], "note": "NAVER_CLIENT_ID/SECRET 미설정"}
    try:
        r = httpx.get("https://openapi.naver.com/v1/search/shop.json", params={"query": query, "display": min(limit, 100), "sort": "sim"},
                      headers={"X-Naver-Client-Id": s.naver_client_id, "X-Naver-Client-Secret": s.naver_client_secret}, timeout=10.0)
        if r.status_code != 200:
            return {"source": "naver", "status": "error", "items": [], "note": f"HTTP {r.status_code}: {r.text[:200]}"}
        items = []
        for it in r.json().get("items", []):
            items.append({
                "seller": f"네이버쇼핑 · {it.get('mallName') or '판매처 미표기'}", "title": _strip_tags(it.get("title")), "url": it.get("link"),
                "price": int(it["lprice"]) if it.get("lprice") else None, "image": it.get("image"), "brand": it.get("brand") or it.get("maker"),
                "category": " > ".join(x for x in [it.get("category1"), it.get("category2"), it.get("category3")] if x),
                "affiliate_available": None, "affiliate_program": None, "product_id": it.get("productId"),
            })
        return {"source": "naver", "status": "ok", "items": items, "checked_at": datetime.now(timezone.utc).isoformat(),
                "note": "네이버 쇼핑 검색 API. 최저가(lprice) 기준, 조회 시점 가격."}
    except httpx.HTTPError as e:
        return {"source": "naver", "status": "error", "items": [], "note": f"네트워크 오류: {e}"}


def _coupang_auth(method: str, path: str, query: str) -> str:
    s = get_settings()
    signed_date = datetime.now(timezone.utc).strftime("%y%m%dT%H%M%SZ")
    message = signed_date + method + path + query
    signature = hmac.new(s.coupang_secret_key.encode(), message.encode(), hashlib.sha256).hexdigest()
    return f"CEA algorithm=HmacSHA256, access-key={s.coupang_access_key}, signed-date={signed_date}, signature={signature}"


def search_coupang(query: str, limit: int = 10) -> dict:
    if coupang_status() != "configured":
        return {"source": "coupang", "status": "not_configured", "items": [], "note": "COUPANG_ACCESS_KEY/SECRET 미설정"}
    path = "/v2/providers/affiliate_open_api/apis/openapi/products/search"
    qs = urlencode({"keyword": query, "limit": min(limit, 50)}, quote_via=quote)
    try:
        r = httpx.get(f"https://api-gateway.coupang.com{path}?{qs}",
                      headers={"Authorization": _coupang_auth("GET", path, qs), "Content-Type": "application/json;charset=UTF-8"}, timeout=10.0)
        if r.status_code != 200:
            return {"source": "coupang", "status": "error", "items": [], "note": f"HTTP {r.status_code}: {r.text[:200]}"}
        j = r.json()
        if j.get("rCode") not in (None, "0"):
            return {"source": "coupang", "status": "error", "items": [], "note": f"{j.get('rCode')}: {j.get('rMessage')}"}
        data = j.get("data") or {}
        items = []
        for it in data.get("productData", []):
            items.append({
                "seller": "쿠팡" + (" · 로켓배송" if it.get("isRocket") else ""), "title": it.get("productName"), "url": it.get("productUrl"),
                "price": it.get("productPrice"), "image": it.get("productImage"), "brand": None, "category": it.get("categoryName"),
                "affiliate_available": True, "affiliate_program": "쿠팡 파트너스", "product_id": it.get("productId"),
            })
        return {"source": "coupang", "status": "ok", "items": items, "checked_at": datetime.now(timezone.utc).isoformat(),
                "note": "쿠팡 파트너스 Open API. productUrl 은 제휴(파트너스) 링크이며 사용 시 제휴 고지가 필요합니다. 조회 시점 가격."}
    except httpx.HTTPError as e:
        return {"source": "coupang", "status": "error", "items": [], "note": f"네트워크 오류: {e}"}


def search_offers(query: str, limit: int = 10) -> dict:
    return {"query": query, "naver": search_naver(query, limit), "coupang": search_coupang(query, limit)}
