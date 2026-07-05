// [임시 진단용] 전국문화축제표준데이터 API 실제 응답 확인. 확인 후 삭제.
export async function GET() {
  const apiKey = process.env.TOUR_API_KEY || "";
  let serviceKey = apiKey;
  try {
    serviceKey = decodeURIComponent(apiKey);
  } catch {
    serviceKey = apiKey;
  }
  const base =
    "https://api.data.go.kr/openapi/tn_pubr_public_cltur_fstvl_api";
  const params = new URLSearchParams({
    serviceKey,
    pageNo: "1",
    numOfRows: "3",
    type: "json",
  });

  try {
    const res = await fetch(`${base}?${params.toString()}`, { cache: "no-store" });
    const text = await res.text();
    let header = null;
    let items = [];
    let firstKeys = null;
    try {
      const j = JSON.parse(text);
      header = j?.response?.header;
      let raw = j?.response?.body?.items;
      if (raw && raw.item) raw = raw.item;
      items = Array.isArray(raw) ? raw : raw ? [raw] : [];
      firstKeys = items[0] ? Object.keys(items[0]) : null;
    } catch {}
    return Response.json({
      httpStatus: res.status,
      contentType: res.headers.get("content-type"),
      header,
      itemCount: items.length,
      firstItemKeys: firstKeys,
      firstItem: items[0] || null,
      bodyPreview: text.slice(0, 300),
    });
  } catch (err) {
    return Response.json({ fetchError: err.message });
  }
}
