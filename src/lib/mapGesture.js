// 지도 제스처 핸들링 (구글맵 임베드식): 터치 기기에서 한 손가락=페이지 스크롤,
//  두 손가락=지도 이동·확대, 한 손가락 시 안내 문구 표시. PC(마우스)는 기존 동작 유지.
//  · 이 모듈을 import하면 Leaflet에 핸들러가 한 번만 등록됩니다(side-effect).
//  · 지도 컴포넌트는 isTouchDevice()로 터치일 때만 gestureHandling 옵션을 켭니다.

import L from "leaflet";
import { GestureHandling } from "leaflet-gesture-handling";
import "leaflet-gesture-handling/dist/leaflet-gesture-handling.css";

if (typeof window !== "undefined" && !window.__ghRegistered) {
  L.Map.addInitHook("addHandler", "gestureHandling", GestureHandling);
  window.__ghRegistered = true;
}

export function isTouchDevice() {
  if (typeof window === "undefined") return false;
  return "ontouchstart" in window || (navigator.maxTouchPoints || 0) > 0;
}
