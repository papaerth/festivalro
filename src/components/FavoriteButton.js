"use client";

import { useFavorites } from "@/lib/useFavorites";

// 즐겨찾기 하트 버튼.
//  - variant "icon"    : 카드 위에 얹는 동그란 하트 (기본)
//  - variant "labeled" : 상세 페이지용 "즐겨찾기/저장됨" 알약 버튼
export default function FavoriteButton({ id, variant = "icon" }) {
  const { isFavorite, toggle, ready } = useFavorites();
  const fav = ready && isFavorite(id);

  const handle = (e) => {
    // 카드(링크) 안에 있을 때 페이지 이동을 막고 하트만 토글
    e.preventDefault();
    e.stopPropagation();
    toggle(id);
  };

  const label = fav ? "즐겨찾기 해제" : "즐겨찾기 추가";

  if (variant === "labeled") {
    return (
      <button
        className={`fav-btn-labeled ${fav ? "active" : ""}`}
        onClick={handle}
        aria-pressed={fav}
        aria-label={label}
      >
        {fav ? "❤️ 저장됨" : "🤍 즐겨찾기"}
      </button>
    );
  }

  return (
    <button
      className={`fav-btn ${fav ? "active" : ""}`}
      onClick={handle}
      aria-pressed={fav}
      aria-label={label}
      title={label}
    >
      {fav ? "❤️" : "🤍"}
    </button>
  );
}
