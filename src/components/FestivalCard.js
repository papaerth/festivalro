import Link from "next/link";
import { SEASONS, REGIONS } from "@/lib/seasons";
import { formatPeriod, getStatus } from "@/lib/format";

// 축제 하나를 카드 형태로 보여줍니다.
export default function FestivalCard({ festival }) {
  const season = SEASONS[festival.season] || SEASONS.spring;
  const status = getStatus(festival.startDate, festival.endDate);
  const regionName = REGIONS[festival.region] || "";

  return (
    <Link href={`/festival/${festival.id}`} className="card">
      <div
        className="card-thumb"
        style={{
          background: festival.image
            ? "#eee"
            : `linear-gradient(135deg, ${season.color}, ${season.color}cc)`,
        }}
      >
        {festival.image ? (
          // 실데이터(TourAPI) 이미지가 있으면 사진, 없으면 계절 이모지
          // eslint-disable-next-line @next/next/no-img-element
          <img src={festival.image} alt={festival.name} loading="lazy" />
        ) : (
          <span>{season.emoji}</span>
        )}
      </div>
      <div className="card-body">
        <span className={`badge ${status.key}`}>{status.label}</span>
        <p className="card-title">{festival.name}</p>
        <p className="card-meta">{formatPeriod(festival.startDate, festival.endDate)}</p>
        <span className="card-region">
          {season.emoji} {regionName} · {festival.sigungu}
        </span>
      </div>
    </Link>
  );
}
