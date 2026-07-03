"use client";

import { useState, useEffect, useCallback } from "react";

// 즐겨찾기를 브라우저(localStorage)에 저장하는 훅.
//  - 로그인/DB 없이 이 브라우저에만 저장됩니다.
//  - 같은 탭의 여러 컴포넌트가 동기화되도록 커스텀 이벤트를 사용합니다.
const KEY = "chukjero:favorites";
const EVENT = "chukjero-fav-change";

function readFavorites() {
  if (typeof window === "undefined") return [];
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || "[]");
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

export function useFavorites() {
  const [favorites, setFavorites] = useState([]);
  const [ready, setReady] = useState(false); // 마운트 후 true (SSR 불일치 방지)

  useEffect(() => {
    setFavorites(readFavorites());
    setReady(true);
    const sync = () => setFavorites(readFavorites());
    window.addEventListener(EVENT, sync); // 같은 탭 내 다른 컴포넌트
    window.addEventListener("storage", sync); // 다른 탭
    return () => {
      window.removeEventListener(EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  const toggle = useCallback((id) => {
    const cur = readFavorites();
    const next = cur.includes(id)
      ? cur.filter((x) => x !== id)
      : [...cur, id];
    localStorage.setItem(KEY, JSON.stringify(next));
    window.dispatchEvent(new Event(EVENT));
  }, []);

  const isFavorite = useCallback((id) => favorites.includes(id), [favorites]);

  return { favorites, isFavorite, toggle, ready };
}
