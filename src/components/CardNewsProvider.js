"use client";

import { createContext, useContext, useState, useCallback, useRef } from "react";
import CardNewsModal from "./CardNewsModal";
import { trackEvent } from "@/lib/analytics";

const CardNewsContext = createContext(null);

// 앱 전역에서 어떤 축제 카드든 클릭하면 카드뉴스 뷰어를 띄울 수 있게 합니다.
export function CardNewsProvider({ children }) {
  const [festival, setFestival] = useState(null);
  const onCloseRef = useRef(null); // 닫힐 때 1회 실행할 콜백(지도 팝업에서 열면 지도 복귀용)
  // open(f) 또는 open(f, { onClose }) — onClose는 카드가 닫힐 때 1회 실행.
  const open = useCallback((f, opts) => {
    trackEvent("cardnews_open", { festival_id: f?.id, festival_name: f?.name });
    onCloseRef.current = opts && typeof opts.onClose === "function" ? opts.onClose : null;
    setFestival(f);
  }, []);
  const close = useCallback(() => {
    setFestival(null);
    const cb = onCloseRef.current;
    onCloseRef.current = null;
    if (cb) cb();
  }, []);

  return (
    <CardNewsContext.Provider value={{ open }}>
      {children}
      {festival && <CardNewsModal festival={festival} onClose={close} />}
    </CardNewsContext.Provider>
  );
}

export function useCardNews() {
  return useContext(CardNewsContext) || { open: () => {} };
}
