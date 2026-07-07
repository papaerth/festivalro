"use client";

import { useEffect } from "react";
import { addRecent } from "@/lib/recentFestivals";
import { trackEvent } from "@/lib/analytics";

// 상세페이지 방문 시 '최근 본 축제' 기록 + 방문 이벤트 집계 (화면엔 아무것도 안 그림).
export default function RecordView({ festival }) {
  useEffect(() => {
    addRecent(festival);
    trackEvent("festival_view", {
      festival_id: festival?.id,
      festival_name: festival?.name,
    });
  }, [festival]);
  return null;
}
