"use client";

import dynamic from "next/dynamic";

// 지도는 브라우저 전용이라 ssr:false 로 감싸서 불러옵니다.
const MiniMap = dynamic(() => import("./MiniMap"), {
  ssr: false,
  loading: () => <div className="skeleton skel-minimap" />,
});

export default function DetailMap(props) {
  return <MiniMap {...props} />;
}
