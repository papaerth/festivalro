"use client";

import { createContext, useContext, useState, useCallback } from "react";
import CardNewsModal from "./CardNewsModal";

const CardNewsContext = createContext(null);

// 앱 전역에서 어떤 축제 카드든 클릭하면 카드뉴스 뷰어를 띄울 수 있게 합니다.
export function CardNewsProvider({ children }) {
  const [festival, setFestival] = useState(null);
  const open = useCallback((f) => setFestival(f), []);
  const close = useCallback(() => setFestival(null), []);

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
