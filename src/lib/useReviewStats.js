"use client";

import { useState, useEffect } from "react";
import { supabase } from "./supabaseClient";

// 축제별 평균 별점/후기 수를 DB 집계 뷰(review_stats)에서 한 번에 가져옵니다.
// 반환: { [festival_id]: { avg: number, count: number } }
export function useReviewStats() {
  const [stats, setStats] = useState({});

  useEffect(() => {
    if (!supabase) return;
    let alive = true;
    supabase
      .from("review_stats")
      .select("festival_id,avg_rating,review_count")
      .then(({ data }) => {
        if (!alive || !data) return;
        const m = {};
        for (const row of data) {
          m[row.festival_id] = {
            avg: Number(row.avg_rating),
            count: row.review_count,
          };
        }
        setStats(m);
      });
    return () => {
      alive = false;
    };
  }, []);

  return stats;
}
