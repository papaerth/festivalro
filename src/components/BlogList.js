"use client";

import { useEffect, useState } from "react";

// "20240715" → "2024.07.15"
function prettyPostDate(s) {
  if (!s || s.length !== 8) return "";
  return `${s.slice(0, 4)}.${s.slice(4, 6)}.${s.slice(6, 8)}`;
}

// 축제 이름으로 네이버 블로그(최근 3년, 정확도순)를 불러와 보여줍니다.
// 키가 없으면 '네이버에서 검색' 링크로 자동 대체됩니다.
export default function BlogList({ query, fallbackUrl }) {
  const [state, setState] = useState({ status: "loading" });

  useEffect(() => {
    let alive = true;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10000);

    fetch(`/api/blog?query=${encodeURIComponent(query)}`, {
      signal: controller.signal,
    })
      .then((res) => {
        if (!res.ok) throw new Error("blog fetch failed");
        return res.json();
      })
      .then((data) => {
        if (!alive) return;
        clearTimeout(timer);
        setState({
          status: "ok",
          configured: data.configured,
          items: data.items || [],
        });
      })
      .catch(() => {
        if (alive) setState({ status: "error" });
      });

    return () => {
      alive = false;
      clearTimeout(timer);
      controller.abort();
    };
  }, [query]);

  // 네이버 블로그 검색으로 바로 연결하는 카드 (대체/보조 링크)
  const fallbackCard = (
    <a
      className="weather-cta"
      href={fallbackUrl}
      target="_blank"
      rel="noopener noreferrer"
    >
      <span className="weather-cta-lead">
        더 많은 후기가 궁금하신가요?
      </span>
      <span className="weather-cta-main">
        <span>📝 네이버 블로그에서 검색해 보기</span>
        <span className="weather-cta-arrow">→</span>
      </span>
    </a>
  );

  if (state.status === "loading") {
    return <div className="weather-loading">블로그 후기를 불러오는 중…</div>;
  }

  if (state.status === "error") {
    return (
      <div>
        <div className="weather-error">블로그 후기를 잠시 불러올 수 없어요.</div>
        {fallbackCard}
      </div>
    );
  }

  // 키 미설정 → 링크아웃 안내
  if (!state.configured) {
    return (
      <div>
        <p className="blog-note">
          💡 블로그 후기 목록은 네이버 검색 키를 등록하면 이 자리에 바로 표시돼요.
          지금은 아래 버튼으로 네이버 블로그에서 확인하실 수 있어요.
        </p>
        {fallbackCard}
      </div>
    );
  }

  // 키는 있으나 최근 3년 글이 없는 경우
  if (state.items.length === 0) {
    return (
      <div>
        <p className="blog-note">최근 3년 이내의 블로그 후기를 찾지 못했어요.</p>
        {fallbackCard}
      </div>
    );
  }

  return (
    <div>
      <p className="blog-note">
        최근 3년간 이 축제를 다룬 블로그 후기예요. (정확도순 상위 {state.items.length}개)
      </p>
      {state.items.map((post, i) => (
        <a
          key={post.link || i}
          className="blog-card"
          href={post.link}
          target="_blank"
          rel="noopener noreferrer"
        >
          <p className="blog-title">{post.title}</p>
          {post.description && <p className="blog-desc">{post.description}</p>}
          <p className="blog-meta">
            ✍️ {post.blogger || "블로그"} · {prettyPostDate(post.postdate)}
          </p>
        </a>
      ))}
      {fallbackCard}
    </div>
  );
}
