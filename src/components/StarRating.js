"use client";

import { useState } from "react";

// 별점 표시/입력 부품.
//  - onChange 없으면 읽기 전용(표시), 있으면 클릭으로 점수 선택
export default function StarRating({ value = 0, onChange, size = 22, readOnly = false }) {
  const [hover, setHover] = useState(0);
  const active = hover || value;
  const interactive = !readOnly && typeof onChange === "function";

  return (
    <span className="stars" style={{ fontSize: `${size}px` }}>
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          className={`star ${n <= active ? "on" : ""}`}
          onMouseEnter={() => interactive && setHover(n)}
          onMouseLeave={() => interactive && setHover(0)}
          onClick={() => interactive && onChange(n)}
          disabled={!interactive}
          aria-label={`${n}점`}
          tabIndex={interactive ? 0 : -1}
        >
          ★
        </button>
      ))}
    </span>
  );
}
