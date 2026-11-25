"""날씨: Open-Meteo 공개 API(키 불필요). 설정 지역 → 좌표 → 현재 기온·습도·강수·날씨코드 + 오늘 최고/최저·강수확률.
실패 시 {'status': 'unavailable'} 를 돌려주고 사이트는 계속 동작한다. 30분 캐시.
"""
from __future__ import annotations

import time

import httpx

REGIONS = {
    "서울": (37.5665, 126.9780), "부산": (35.1796, 129.0756), "대구": (35.8714, 128.6014), "인천": (37.4563, 126.7052),
    "광주": (35.1595, 126.8526), "대전": (36.3504, 127.3845), "울산": (35.5384, 129.3114), "세종": (36.4800, 127.2890),
    "경기": (37.4138, 127.5183), "수원": (37.2636, 127.0286), "강원": (37.8228, 128.1555), "춘천": (37.8813, 127.7298),
    "충북": (36.6357, 127.4917), "충남": (36.5184, 126.8000), "전북": (35.8203, 127.1088), "전남": (34.8161, 126.4629),
    "경북": (36.4919, 128.8889), "경남": (35.4606, 128.2132), "제주": (33.4996, 126.5312), "창원": (35.2281, 128.6811),
}
WMO = {0: "맑음", 1: "대체로 맑음", 2: "구름 조금", 3: "흐림", 45: "안개", 48: "안개(서리)", 51: "이슬비", 53: "이슬비", 55: "이슬비(강)",
       56: "어는 이슬비", 57: "어는 이슬비", 61: "비(약)", 63: "비", 65: "비(강)", 66: "어는 비", 67: "어는 비", 71: "눈(약)", 73: "눈",
       75: "눈(강)", 77: "싸락눈", 80: "소나기(약)", 81: "소나기", 82: "소나기(강)", 85: "소낙눈", 86: "소낙눈(강)", 95: "뇌우", 96: "뇌우(우박)", 99: "뇌우(우박)"}
_cache: dict[str, tuple[float, dict]] = {}
TTL = 1800


def fetch_weather(region: str) -> dict:
    key = region.strip() if region else "서울"
    lat, lon = REGIONS.get(key, REGIONS["서울"])
    now = time.time()
    if key in _cache and now - _cache[key][0] < TTL:
        return _cache[key][1]
    try:
        r = httpx.get("https://api.open-meteo.com/v1/forecast", params={
            "latitude": lat, "longitude": lon,
            "current": "temperature_2m,relative_humidity_2m,precipitation,weather_code,apparent_temperature",
            "daily": "temperature_2m_max,temperature_2m_min,precipitation_probability_max,weather_code",
            "timezone": "Asia/Seoul", "forecast_days": 2}, timeout=8.0)
        r.raise_for_status()
        j = r.json()
        cur, daily = j.get("current", {}), j.get("daily", {})
        code = cur.get("weather_code")
        out = {
            "status": "ok", "source": "Open-Meteo (open-meteo.com)", "region": key, "matched_region": key in REGIONS,
            "observed_at": cur.get("time"), "temperature": cur.get("temperature_2m"), "apparent": cur.get("apparent_temperature"),
            "humidity": cur.get("relative_humidity_2m"), "precipitation_mm": cur.get("precipitation"),
            "code": code, "label": WMO.get(code, "미확인"),
            "today_max": (daily.get("temperature_2m_max") or [None])[0], "today_min": (daily.get("temperature_2m_min") or [None])[0],
            "precip_prob_max": (daily.get("precipitation_probability_max") or [None])[0],
            "is_rain_or_snow": code is not None and code >= 51,
            "note": "실측이 아닌 기상 모델 값입니다. 지역은 설정의 기본 지역(시·도 단위)을 좌표로 변환해 조회합니다.",
        }
    except Exception as e:
        out = {"status": "unavailable", "source": "Open-Meteo", "region": key, "note": f"날씨 조회 실패: {e}"}
    _cache[key] = (now, out)
    return out
