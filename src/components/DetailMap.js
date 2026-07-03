"use client";

import dynamic from "next/dynamic";

// 지도는 브라우저 전용이라 ssr:false 로 감싸서 불러옵니다.
const MiniMap = dynamic(() => import("./MiniMap"), {
  ssr: false,
  loading: () => <div className="mini-map map-loading">지도를 불러오는 중…</div>,
});

export default function DetailMap(props) {
  return <MiniMap {...props} />;
}
