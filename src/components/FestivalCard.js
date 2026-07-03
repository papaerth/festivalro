import Link from "next/link";
import { SEASONS, REGIONS } from "@/lib/seasons";
import { formatPeriod, getStatus } from "@/lib/format";
import CoverImage from "./CoverImage";

// 축제 하나를 카드 형태로 보여줍니다. (상단 대표 이미지 + 정보)
export default function FestivalCard({ festival }) {
  const season = SEASONS[festival.season] || SEASONS.spring;
  const status = getStatus(festival.startDate, festival.endDate);
  const regionName = REGIONS[festival.region] || "";

  return (
    <Link href={`/festival/${festival.id}`} className="card">
      <CoverImage
        className="card-cover"
        src={festival.image}
        alt={festival.name}
        accent={season.color}
        emoji={season.emoji}
      />
      <span className={`badge card-badge ${status.key}`}>{status.label}</span>
      <div className="card-body">
        <p className="card-title">{festival.name}</p>
        <p className="card-meta">{formatPeriod(festival.startDate, festival.endDate)}</p>
        <span className="card-region">
          {season.emoji} {regionName} · {festival.sigungu}
        </span>
      </div>
    </Link>
  );
}
