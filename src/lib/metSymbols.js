// 노르웨이 기상청(MET Norway)의 날씨 기호(symbol_code)를 한글 + 이모지로 변환.
// 예: "clearsky_day", "lightrainshowers_day", "heavysnow" 등
// 키워드 방식으로 처리해 수많은 조합을 안정적으로 커버합니다.
export function describeMetSymbol(code) {
  if (!code) return { text: "정보 없음", emoji: "❓" };
  const c = String(code).toLowerCase();
  const heavy = c.includes("heavy");
  const light = c.includes("light");
  const pre = heavy ? "강한 " : light ? "약한 " : "";

  if (c.includes("thunder")) return { text: "천둥번개", emoji: "⛈️" };
  if (c.includes("snow")) return { text: pre + "눈", emoji: heavy ? "❄️" : "🌨️" };
  if (c.includes("sleet")) return { text: pre + "진눈깨비", emoji: "🌨️" };
  if (c.includes("rain")) return { text: pre + "비", emoji: heavy ? "🌧️" : "🌦️" };
  if (c.includes("fog")) return { text: "안개", emoji: "🌫️" };
  if (c.includes("partlycloudy")) return { text: "구름 조금", emoji: "⛅" };
  if (c.includes("cloudy")) return { text: "흐림", emoji: "☁️" };
  if (c.includes("fair")) return { text: "대체로 맑음", emoji: "🌤️" };
  if (c.includes("clearsky")) return { text: "맑음", emoji: "☀️" };
  return { text: "정보 없음", emoji: "❓" };
}
