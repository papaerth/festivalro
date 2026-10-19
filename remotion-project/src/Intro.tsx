import {
  AbsoluteFill,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";

// 9:16 세로 10초 인트로 — 검은 배경에 흰 글자.
// 제목이 한 줄씩 떠오르고, 마지막 1초에 전체가 페이드아웃된다.
export const Intro: React.FC<{ lines: string[] }> = ({ lines }) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();

  const fadeOut = interpolate(
    frame,
    [durationInFrames - fps, durationInFrames],
    [1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );

  return (
    <AbsoluteFill
      style={{
        backgroundColor: "#000000",
        justifyContent: "center",
        alignItems: "center",
        opacity: fadeOut,
      }}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 40 }}>
        {lines.map((text, i) => {
          const delay = i * fps * 0.8;
          const progress = spring({
            frame: frame - delay,
            fps,
            config: { damping: 200 },
          });
          const translateY = interpolate(progress, [0, 1], [80, 0]);
          return (
            <div
              key={i}
              style={{
                color: "#FFFFFF",
                fontFamily: "sans-serif",
                fontWeight: 700,
                fontSize: i === 0 ? 120 : 72,
                textAlign: "center",
                opacity: progress,
                transform: `translateY(${translateY}px)`,
              }}
            >
              {text}
            </div>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};
