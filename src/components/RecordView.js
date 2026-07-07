"use client";

import { useEffect } from "react";
import { addRecent } from "@/lib/recentFestivals";

// 상세페이지 방문 시 '최근 본 축제'에 조용히 기록합니다 (화면에 아무것도 안 그림).
export default function RecordView({ festival }) {
  useEffect(() => {
    addRecent(festival);
  }, [festival]);
  return null;
}
