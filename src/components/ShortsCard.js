"use client";

import { useState } from "react";
import { formatViews, relativeTime } from "@/lib/videoFormat";
import { trackEvent } from "@/lib/analytics";

// 쇼츠 썸네일: 세로(9:16) 원본 썸네일(oardefault)이 있으면 그것으로 카드를
// 꽉 채우고, 없으면(일반 16:9 썸네일) 기존 썸네일로, 그것도 없으면 자리표시로.
function Thumb({ id, thumb }) {
  const [src, setSrc] = useState(
    id ? `https://i.ytimg.com/vi/${id}/oardefault.jpg` : thumb || null
  );
  const [dead, setDead] = useState(false);
  if (dead || !src) return <span className="sf-thumb-empty">🎬</span>;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt=""
      loading="lazy"
      onError={() => {
        if (src.indexOf("oardefault") !== -1 && thumb) setSrc(thumb);
        else setDead(true);
      }}
    />
  );
}

// 유튜브 쇼츠 피드와 같은 정보 구조의 카드.
//  - 세로형(9:16) 썸네일이 카드 상단을 채움(모서리=디자인 토큰)
//  - 썸네일 아래 영역에: 영상 제목(최대 2줄·말줄임) + 조회수·업로드시점(회색 작은 글씨)
//  - 채널명은 표시하지 않음(공간 절약, 유튜브 쇼츠 피드와 동일)
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
