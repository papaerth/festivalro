// Open-Meteo가 돌려주는 날씨 코드(WMO code)를 한글 하늘 상태 + 이모지로 바꿔줍니다.
// 참고: https://open-meteo.com/en/docs (WMO Weather interpretation codes)
export function describeWeather(code) {
  const map = {
    0: { text: "맑음", emoji: "☀️" },
    1: { text: "대체로 맑음", emoji: "🌤️" },
    2: { text: "구름 조금", emoji: "⛅" },
    3: { text: "흐림", emoji: "☁️" },
    45: { text: "안개", emoji: "🌫️" },
    48: { text: "짙은 안개", emoji: "🌫️" },
    51: { text: "약한 이슬비", emoji: "🌦️" },
    53: { text: "이슬비", emoji: "🌦️" },
    55: { text: "강한 이슬비", emoji: "🌧️" },
    61: { text: "약한 비", emoji: "🌦️" },
    63: { text: "비", emoji: "🌧️" },
    65: { text: "강한 비", emoji: "🌧️" },
    66: { text: "얼음비", emoji: "🌧️" },
    67: { text: "강한 얼음비", emoji: "🌧️" },
    71: { text: "약한 눈", emoji: "🌨️" },
    73: { text: "눈", emoji: "❄️" },
    75: { text: "강한 눈", emoji: "❄️" },
    77: { text: "싸락눈", emoji: "🌨️" },
    80: { text: "약한 소나기", emoji: "🌦️" },
    81: { text: "소나기", emoji: "🌧️" },
    82: { text: "강한 소나기", emoji: "🌧️" },
    85: { text: "약한 눈보라", emoji: "🌨️" },
    86: { text: "강한 눈보라", emoji: "❄️" },
    95: { text: "천둥번개", emoji: "⛈️" },
    96: { text: "천둥번개(우박)", emoji: "⛈️" },
    99: { text: "강한 천둥번개", emoji: "⛈️" },
  };
  return map[code] || { text: "정보 없음", emoji: "❓" };
}
