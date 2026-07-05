// [임시 진단용] 요청 시점 표준데이터 호출이 왜 실패하는지 확인. 확인 후 삭제.
export const dynamic = "force-dynamic";

async function tryFetch(numOfRows, mode) {
  const apiKey = process.env.TOUR_API_KEY || "";
  let serviceKey = apiKey;
  try {
    serviceKey = decodeURIComponent(apiKey);
  } catch {}
  const base =
    "https://api.data.go.kr/openapi/tn_pubr_public_cltur_fstvl_api";
  const params = new URLSearchParams({
    serviceKey,
    pageNo: "1",
    numOfRows: String(numOfRows),
    type: "json",
  });
  const opts =
    mode === "revalidate"
      ? { next: { revalidate: 86400 } }
      : { cache: "no-store" };
  try {
    const res = await fetch(`${base}?${params.toString()}`, opts);
    const text = await res.text();
    let resultCode = null;
    let count = 0;
    try {
      const j = JSON.parse(text);
      resultCode = j?.response?.header?.resultCode;
      let raw = j?.response?.body?.items;
      if (raw && raw.item) raw = raw.item;
      count = Array.isArray(raw) ? raw.length : raw ? 1 : 0;
    } catch (e) {
      return { mode, numOfRows, httpStatus: res.status, parseError: e.message, bytes: text.length, preview: text.slice(0, 120) };
    }
    return { mode, numOfRows, httpStatus: res.status, resultCode, count, bytes: text.length };
  } catch (err) {
    return { mode, numOfRows, fetchError: err.message };
  }
}

export async function GET() {
  const results = [];
  results.push(await tryFetch(1000, "revalidate"));
  results.push(await tryFetch(1000, "nostore"));
  results.push(await tryFetch(300, "nostore"));
  return Response.json({ results });
}
