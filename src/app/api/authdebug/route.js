// [임시 진단용] Supabase 환경변수가 서버에 들어와 있는지 확인. 확인 후 삭제.
export async function GET() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || null;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || null;
  return Response.json({
    hasUrl: !!url,
    urlLen: url ? url.length : 0,
    urlStartsHttps: url ? /^https:\/\//.test(url) : false,
    urlHasQuote: url ? url.includes('"') || url.includes("'") : false,
    urlHasSpace: url ? /\s/.test(url) : false,
    hasKey: !!key,
    keyLen: key ? key.length : 0,
    keyStart: key ? key.slice(0, 15) : null,
    keyHasQuote: key ? key.includes('"') || key.includes("'") : false,
    keyHasSpace: key ? /\s/.test(key) : false,
  });
}
