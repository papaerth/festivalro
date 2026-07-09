"use client";

import { useState } from "react";
import { formatViews, relativeTime } from "@/lib/videoFormat";
import { trackEvent } from "@/lib/analytics";

// 롱폼(가로 16:9) 썸네일: 고화질 maxres → sd → 기존(hq) 순으로 시도해
// 카드에 크고 선명하게 채웁니다(object-fit:cover). 모두 실패하면 자리표시.
function Thumb({ id, thumb }) {
  const candidates = [
    id ? `https://i.ytimg.com/vi/${id}/maxresdefault.jpg` : null, // 1280x720 고화질(있을 때)
    id ? `https://i.ytimg.com/vi/${id}/sddefault.jpg` : null, // 640x480
    thumb || (id ? `https://i.ytimg.com/vi/${id}/hqdefault.jpg` : null), // 항상 존재
  ].filter(Boolean);
  const [idx, setIdx] = useState(0);
  if (idx >= candidates.length) return <span className="sf-thumb-empty">🎬</span>;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={candidates[idx]}
      alt=""
      loading="lazy"
      onError={() => setIdx((i) => i + 1)}
    />
  );
}

// 유튜브 롱폼 영상 카드(가로 16:9).
//  - 가로(16:9) 썸네일이 카드 상단을 채움(모서리=디자인 토큰)
//  - 썸네일 아래 영역에: 영상 제목(최대 2줄·말줄임) + 조회수·업로드시점(회색 작은 글씨)
//  - 채널명은 표시하지 않음(공간 절약)
//  - 썸네일만 먼저 보이고, 클릭하는 순간에만 공식 플레이어 지연 로딩(기존 동작 유지)
//  - badge: 홈에서 좌상단에 얹을 축제명·D-day (우리 사이트 고유 정보)
//  - moreHref/moreLabel: 홈에서 축제 상세로 가는 링크
export default function ShortsCard({
  video,
  locale = "ko",
  watchLabel,
  badge = null,
  moreHref = null,
  moreLabel = "",
  onPlay = null,
}) {
  const [open, setOpen] = useState(false);
  const ytUrl = `https://www.youtube.com/watch?v=${video.id}`;

  return (
    <div className="sf-card">
      {open ? (
        <div className="sf-thumb">
          <iframe
            src={`https://www.youtube.com/embed/${video.id}?autoplay=1&playsinline=1`}
            title={video.title}
            allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
            allowFullScreen
            loading="lazy"
          />
        </div>
      ) : (
        <button
          className="sf-thumb sf-thumb-btn"
          onClick={() => {
            trackEvent("video_play", {
              video_id: video.id,
              video_title: video.title,
            });
            setOpen(true);
            if (onPlay) onPlay();
          }}
          title={video.title}
        >
          <Thumb id={video.id} thumb={video.thumb} />
          <span className="sf-play">▶</span>
          {badge}
        </button>
      )}

      {/* 썸네일 아래: 제목 + 조회수·업로드시점 (오버레이 아님) */}
      <div className="sf-meta">
        <p className="sf-title">{video.title}</p>
        <p className="sf-sub">
          {formatViews(video.views, locale)}
          {video.publishedAt ? ` · ${relativeTime(video.publishedAt, locale)}` : ""}
        </p>
        {open && watchLabel && (
          <a
            className="sf-watch"
            href={ytUrl}
            target="_blank"
            rel="noopener noreferrer"
          >
            ▶ {watchLabel}
          </a>
        )}
        {moreHref && (
          <a className="sf-more" href={moreHref}>
            {moreLabel} ›
          </a>
        )}
      </div>
    </div>
  );
}
