"""날짜 기반 계절·소비 이벤트 맥락. 날씨 API 는 미연동이므로 '미확인' 으로 표시한다."""
from __future__ import annotations

from datetime import date

from sqlalchemy.orm import Session

from ..config import get_settings
from ..models import UserSetting

SEASONS = {12: "겨울", 1: "겨울", 2: "겨울", 3: "봄", 4: "봄", 5: "봄", 6: "여름", 7: "여름", 8: "여름", 9: "가을", 10: "가을", 11: "가을"}

FIXED_EVENTS = {
    (1, 1): "신정", (3, 1): "삼일절", (5, 5): "어린이날", (6, 6): "현충일", (8, 15): "광복절", (10, 3): "개천절",
    (10, 9): "한글날", (12, 25): "크리스마스", (2, 14): "밸런타인데이", (3, 14): "화이트데이", (5, 8): "어버이날",
    (5, 15): "스승의날", (11, 11): "빼빼로데이",
}
# 음력 명절(설·추석)은 연도별로 달라 자동 계산하지 않음 → 사용자 설정(user_settings.lunar_holidays)으로 입력
PERIODS = [
    ((2, 20), (3, 10), "신학기"), ((11, 20), (12, 31), "연말"), ((1, 1), (1, 10), "연초"),
    ((6, 1), (6, 30), "장마 대비"), ((7, 15), (8, 20), "휴가·폭염"), ((11, 1), (11, 30), "김장·난방 준비"),
    ((4, 1), (4, 20), "봄나들이"),
]


def season_context(d: date, db: Session | None = None) -> dict:
    region = get_settings().shoppulse_default_region
    lunar = []
    if db is not None:
        s = db.get(UserSetting, "default_region")
        if s:
            region = s.value.get("value", region)
        lh = db.get(UserSetting, "lunar_holidays")
        if lh and isinstance(lh.value.get("value"), list):
            lunar = [h for h in lh.value["value"] if h.get("date") == d.isoformat()]
    events = []
    if (d.month, d.day) in FIXED_EVENTS:
        events.append(FIXED_EVENTS[(d.month, d.day)])
    for (sm, sd), (em, ed), name in PERIODS:
        if (sm, sd) <= (d.month, d.day) <= (em, ed):
            events.append(name)
    events += [h.get("name", "명절") for h in lunar]
    from .weather import fetch_weather

    return {
        "date": d.isoformat(), "weekday": ["월", "화", "수", "목", "금", "토", "일"][d.weekday()],
        "season": SEASONS[d.month], "events": events, "region": region,
        "weather": fetch_weather(region),
        "note": "계절·이벤트는 날짜 기반 계산입니다. 설·추석은 설정에서 입력(lunar_holidays)하세요.",
    }
