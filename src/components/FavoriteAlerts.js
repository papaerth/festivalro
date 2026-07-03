"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useFavorites } from "@/lib/useFavorites";
import { getStatusInfo } from "@/lib/format";

const WINDOW_DAYS = 7; // 시작 7일 이내를 '곧 시작'으로 봄
const NOTIFY_KEY = "chukjero:lastNotified";

// 즐겨찾기한 축제 중 '진행중' 또는 '곧 시작(7일 이내)'을 모아 보여주고,
// (선택) 브라우저 알림 권한을 켜면 하루 한 번 요약 알림을 띄웁니다.
export default function FavoriteAlerts({ festivals }) {
  const { favorites, ready } = useFavorites();
  const [permission, setPermission] = useState("unsupported");

  useEffect(() => {
    if (typeof window !== "undefined" && "Notification" in window) {
      setPermission(Notification.permission);
    }
  }, []);

  const alerts = ready
    ? festivals
        .filter((f) => favorites.includes(f.id))
        .map((f) => ({ f, s: getStatusInfo(f.startDate, f.endDate) }))
        .filter(
          ({ s }) =>
            s.key === "ongoing" || (s.key === "upcoming" && s.dday <= WINDOW_DAYS)
        )
        .sort((a, b) => {
          const rank = (x) => (x.s.key === "ongoing" ? -1 : x.s.dday);
          return rank(a) - rank(b);
        })
    : [];

  // 권한이 있으면 하루 한 번 요약 알림
  useEffect(() => {
    if (!ready || permission !== "granted" || alerts.length === 0) return;
    if (typeof window === "undefined" || !("Notification" in window)) return;
    let last = null;
    try {
      last = localStorage.getItem(NOTIFY_KEY);
    } catch {}
    const today = new Date().toISOString().slice(0, 10);
    if (last === today) return;
    try {
      new Notification("축제로 · 즐겨찾기 알림", {
        body: `곧 시작하거나 진행 중인 즐겨찾기 축제가 ${alerts.length}곳 있어요!`,
      });
      localStorage.setItem(NOTIFY_KEY, today);
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, permission, alerts.length]);

  if (!ready || alerts.length === 0) return null;

  const enableNotify = async () => {
    if (typeof window === "undefined" || !("Notification" in window)) return;
    try {
      const p = await Notification.requestPermission();
      setPermission(p);
    } catch {}
  };

  return (
    <div className="fav-alert">
      <div className="fav-alert-head">
        <span className="fav-alert-title">🔔 즐겨찾기한 축제 알림</span>
        {permission === "granted" ? (
          <span className="fav-alert-on">알림 켜짐 ✓</span>
        ) : permission !== "unsupported" ? (
          <button className="fav-alert-btn" onClick={enableNotify}>
            시작 알림 받기
          </button>
        ) : null}
      </div>
      <ul className="fav-alert-list">
        {alerts.map(({ f, s }) => (
          <li key={f.id}>
            <Link href={`/festival/${f.id}`}>
              <span className={`fav-alert-dday ${s.key}`}>
                {s.key === "ongoing" ? "진행중" : s.label}
              </span>
              <span className="fav-alert-name">{f.name}</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
