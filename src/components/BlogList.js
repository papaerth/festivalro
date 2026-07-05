"use client";

import { useEffect, useState } from "react";
import { useI18n } from "@/lib/I18nProvider";

const BL = {
  ko: {
    more: "네이버 블로그에서 더 보기 →", loading: "블로그 불러오는 중",
    error: "블로그 후기를 잠시 불러올 수 없어요.",
    noKey: "블로그 후기 목록은 네이버 검색 키를 등록하면 이 자리에 표시돼요.",
    empty: "아직 등록된 후기가 없어요.", blogger: "블로그",
  },
  en: {
    more: "See more on Naver Blog →", loading: "Loading blogs",
    error: "Blog reviews are unavailable right now.",
    noKey: "Blog reviews appear here once a Naver search key is set.",
    empty: "No blog reviews yet.", blogger: "Blog",
  },
  ja: {
    more: "NAVERブログでもっと見る →", loading: "ブログを読み込み中",
    error: "ブログのレビューを読み込めませんでした。",
    noKey: "NAVER検索キーを設定すると、ここにブログのレビューが表示されます。",
    empty: "まだレビューがありません。", blogger: "ブログ",
  },
  zh: {
    more: "在 NAVER 博客查看更多 →", loading: "正在加载博客",
    error: "暂时无法获取博客点评。",
    noKey: "设置 NAVER 搜索密钥后，这里会显示博客点评。",
    empty: "暂无博客点评。", blogger: "博客",
  },
};

// "20240715" → "2024.07.15"
function prettyPostDate(s) {
  if (!s || s.length !== 8) return "";
  return `${s.slice(0, 4)}.${s.slice(4, 6)}.${s.slice(6, 8)}`;
}

// 대표 이미지 썸네일 (이미지 없거나 로딩 실패하면 계절색 자리표시)
//  - 네이버 이미지는 외부 표시가 차단되므로 우리 서버(/api/img)를 경유해 표시
function BlogThumb({ src, accent }) {
  const [failed, setFailed] = useState(false);
  if (!src || failed) {
    return (
      <div
        className="blog-thumb blog-thumb-empty"
        style={{ background: `linear-gradient(135deg, ${accent}, ${accent}cc)` }}
      >
        📷
      </div>
    );
  }
  const proxied = `/api/img?url=${encodeURIComponent(src)}`;
  return (
    <div className="blog-thumb">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={proxied}
        alt=""
        loading="lazy"
        onError={() => setFailed(true)}
      />
    </div>
  );
}

// 축제 이름으로 네이버 블로그(최근 3년, 정확도순) 5개를 보여줍니다.
export default function BlogList({ query, accent = "#c2578a" }) {
  const { locale } = useI18n();
  const b = BL[locale] || BL.ko;
  const [state, setState] = useState({ status: "loading" });
  const [isMobile, setIsMobile] = useState(false);

  // 접속 기기에 맞는 네이버 '블로그검색' 결과 페이지 주소를 만듭니다.
  //  - PC:    search.naver.com   ?ssc=tab.blog.all
  //  - 모바일: m.search.naver.com ?ssc=tab.m_blog.all
  useEffect(() => {
    setIsMobile(/Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent));
  }, []);

  const enc = encodeURIComponent(query);
  const moreUrl = isMobile
    ? `https://m.search.naver.com/search.naver?ssc=tab.m_blog.all&query=${enc}`
    : `https://search.naver.com/search.naver?ssc=tab.blog.all&query=${enc}`;

  useEffect(() => {
    let alive = true;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 12000);

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

  // 맨 아래 "네이버 블로그에서 더 보기" 버튼
  const moreButton = (
    <a
      className="blog-more-btn"
      href={moreUrl}
      target="_blank"
      rel="noopener noreferrer"
    >
      {b.more}
    </a>
  );

  if (state.status === "loading") {
    return (
      <div className="skel-blog" aria-label={b.loading}>
        <div className="skeleton" />
        <div className="skeleton" />
        <div className="skeleton" />
      </div>
    );
  }

  if (state.status === "error") {
    return (
      <div>
        <p className="blog-empty-msg">{b.error}</p>
        {moreButton}
      </div>
    );
  }

  // 키 미설정 안내 (키를 넣으면 자동으로 목록이 표시됨)
  if (!state.configured) {
    return (
      <div>
        <p className="blog-empty-msg">{b.noKey}</p>
        {moreButton}
      </div>
    );
  }

  // 후기 0개 → 안내 + 더 보기 버튼만
  if (state.items.length === 0) {
    return (
      <div>
        <p className="blog-empty-msg">{b.empty}</p>
        {moreButton}
      </div>
    );
  }

  // 후기 목록 (최대 5개)
  return (
    <div>
      {state.items.map((post, i) => (
        <a
          key={post.link || i}
          className="blog-card"
          href={post.link}
          target="_blank"
          rel="noopener noreferrer"
        >
          <BlogThumb src={post.image} accent={accent} />
          <div className="blog-card-body">
            <p className="blog-title">{post.title}</p>
            <p className="blog-meta">
              ✍️ {post.blogger || b.blogger} · {prettyPostDate(post.postdate)}
            </p>
          </div>
        </a>
      ))}
      {moreButton}
    </div>
  );
}
