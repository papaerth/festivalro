"use client";

import { useEffect, useState } from "react";
import { useI18n } from "@/lib/I18nProvider";

const BL = {
  "zh-TW": { more: "在 Naver 部落格查看更多 →", loading: "正在載入部落格", error: "目前無法取得部落格評論。", noKey: "設定 Naver 搜尋金鑰後，部落格評論將顯示於此。", empty: "尚無部落格評論。", blogger: "部落格" },
  es: { more: "Ver más en Naver Blog →", loading: "Cargando blogs", error: "Las reseñas de blogs no están disponibles ahora mismo.", noKey: "Las reseñas de blogs aparecerán aquí una vez que se configure una clave de búsqueda de Naver.", empty: "Aún no hay reseñas de blogs.", blogger: "Blog" },
  fr: { more: "Voir plus sur Naver Blog →", loading: "Chargement des blogs", error: "Les avis de blog ne sont pas disponibles pour le moment.", noKey: "Les avis de blog apparaîtront ici une fois qu'une clé de recherche Naver sera configurée.", empty: "Aucun avis de blog pour l'instant.", blogger: "Blog" },
  ru: { more: "Смотреть больше на Naver Blog →", loading: "Загрузка блогов", error: "Отзывы из блогов сейчас недоступны.", noKey: "Отзывы из блогов появятся здесь после настройки ключа поиска Naver.", empty: "Пока нет отзывов из блогов.", blogger: "Блог" },
  de: { more: "Mehr auf Naver Blog ansehen →", loading: "Blogs werden geladen", error: "Blog-Rezensionen sind derzeit nicht verfügbar.", noKey: "Blog-Rezensionen erscheinen hier, sobald ein Naver-Suchschlüssel festgelegt ist.", empty: "Noch keine Blog-Rezensionen.", blogger: "Blog" },
  ar: { more: "شاهد المزيد على Naver Blog →", loading: "جارٍ تحميل المدونات", error: "مراجعات المدونة غير متوفرة حاليًا.", noKey: "تظهر مراجعات المدونة هنا بمجرد ضبط مفتاح بحث Naver.", empty: "لا توجد مراجعات مدونة بعد.", blogger: "المدونة" },
  vi: { more: "Xem thêm trên Naver Blog →", loading: "Đang tải blog", error: "Hiện chưa có bài đánh giá blog.", noKey: "Bài đánh giá blog sẽ hiển thị ở đây khi đã thiết lập khóa tìm kiếm Naver.", empty: "Chưa có bài đánh giá blog.", blogger: "Blog" },
  id: { more: "Lihat lebih banyak di Naver Blog →", loading: "Memuat blog", error: "Ulasan blog sedang tidak tersedia saat ini.", noKey: "Ulasan blog akan muncul di sini setelah kunci pencarian Naver disetel.", empty: "Belum ada ulasan blog.", blogger: "Blog" },
  th: { more: "ดูเพิ่มเติมบน Naver Blog →", loading: "กำลังโหลดบล็อก", error: "ขณะนี้ไม่มีรีวิวบล็อก", noKey: "รีวิวบล็อกจะปรากฏที่นี่เมื่อมีการตั้งค่าคีย์การค้นหา Naver", empty: "ยังไม่มีรีวิวบล็อก", blogger: "บล็อก" },
  ko: {
    more: "네이버 블로그에서 더 보기 →", loading: "블로그 불러오는 중",
    error: "블로그 후기를 잠시 불러올 수 없어요.",
    noKey: "블로그 후기 목록은 네이버 검색 키를 등록하면 이 자리에 표시돼요.",
    empty: "아직 등록된 후기가 없어요.", blogger: "블로그",
  },
  en: {
    more: "See more on Naver Blog →", loading: "Loading blogs",
    error: "Blog reviews are unavailable right now.",
    noKey: "Blog reviews appear here once a Naver search key is set.",
    empty: "No blog reviews yet.", blogger: "Blog",
  },
  ja: {
    more: "NAVERブログでもっと見る →", loading: "ブログを読み込み中",
    error: "ブログのレビューを読み込めませんでした。",
    noKey: "NAVER検索キーを設定すると、ここにブログのレビューが表示されます。",
    empty: "まだレビューがありません。", blogger: "ブログ",
  },
  zh: {
    more: "在 NAVER 博客查看更多 →", loading: "正在加载博客",
    error: "暂时无法获取博客点评。",
    noKey: "设置 NAVER 搜索密钥后，这里会显示博客点评。",
    empty: "暂无博客点评。", blogger: "博客",
  },
};

// "20240715" → "2024.07.15"
function prettyPostDate(s) {
  if (!s || s.length !== 8) return "";
  return `${s.slice(0, 4)}.${s.slice(4, 6)}.${s.slice(6, 8)}`;
}

// 대표 이미지 썸네일 (이미지 없거나 로딩 실패하면 계절색 자리표시)
//  - 네이버 이미지는 외부 표시가 차단되므로 우리 서버(/api/img)를 경유해 표시
function BlogThumb({ src, accent }) {
  const [failed, setFailed] = useState(false);
  if (!src || failed) {
    return (
      <div
        className="blog-thumb blog-thumb-empty"
        style={{ background: `linear-gradient(135deg, ${accent}, ${accent}cc)` }}
      >
        📷
      </div>
    );
  }
  const proxied = `/api/img?url=${encodeURIComponent(src)}`;
  return (
    <div className="blog-thumb">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={proxied}
        alt=""
        loading="lazy"
        onError={() => setFailed(true)}
      />
    </div>
  );
}

// 축제 이름으로 네이버 블로그(최근 3년, 정확도순) 5개를 보여줍니다.
export default function BlogList({ query, accent = "#c2578a" }) {
  const { locale } = useI18n();
  const b = BL[locale] || BL.ko;
  const [state, setState] = useState({ status: "loading" });
  const [isMobile, setIsMobile] = useState(false);

  // 접속 기기에 맞는 네이버 '블로그검색' 결과 페이지 주소를 만듭니다.
  //  - PC:    search.naver.com   ?ssc=tab.blog.all
  //  - 모바일: m.search.naver.com ?ssc=tab.m_blog.all
  useEffect(() => {
    setIsMobile(/Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent));
  }, []);

  const enc = encodeURIComponent(query);
  const moreUrl = isMobile
    ? `https://m.search.naver.com/search.naver?ssc=tab.m_blog.all&query=${enc}`
    : `https://search.naver.com/search.naver?ssc=tab.blog.all&query=${enc}`;

  useEffect(() => {
    let alive = true;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 12000);

    fetch(`/api/blog?query=${encodeURIComponent(query)}`, {
      signal: controller.signal,
    })
      .then((res) => {
        if (!res.ok) throw new Error("blog fetch failed");
        return res.json();
      })
      .then((data) => {
        if (!alive) return;
        clearTimeout(timer);
        setState({
          status: "ok",
          configured: data.configured,
          items: data.items || [],
        });
      })
      .catch(() => {
        if (alive) setState({ status: "error" });
      });

    return () => {
      alive = false;
      clearTimeout(timer);
      controller.abort();
    };
  }, [query]);

  // 맨 아래 "네이버 블로그에서 더 보기" 버튼
  const moreButton = (
    <a
      className="blog-more-btn"
      href={moreUrl}
      target="_blank"
      rel="noopener noreferrer"
    >
      {b.more}
    </a>
  );

  if (state.status === "loading") {
    return (
      <div className="skel-blog" aria-label={b.loading}>
        <div className="skeleton" />
        <div className="skeleton" />
        <div className="skeleton" />
      </div>
    );
  }

  if (state.status === "error") {
    return (
      <div>
        <p className="blog-empty-msg">{b.error}</p>
        {moreButton}
      </div>
    );
  }

  // 키 미설정 안내 (키를 넣으면 자동으로 목록이 표시됨)
  if (!state.configured) {
    return (
      <div>
        <p className="blog-empty-msg">{b.noKey}</p>
        {moreButton}
      </div>
    );
  }

  // 후기 0개 → 안내 + 더 보기 버튼만
  if (state.items.length === 0) {
    return (
      <div>
        <p className="blog-empty-msg">{b.empty}</p>
        {moreButton}
      </div>
    );
  }

  // 후기 목록 (최대 5개)
  return (
    <div>
      {state.items.map((post, i) => (
        <a
          key={post.link || i}
          className="blog-card"
          href={post.link}
          target="_blank"
          rel="noopener noreferrer"
        >
          <BlogThumb src={post.image} accent={accent} />
          <div className="blog-card-body">
            <p className="blog-title">{post.title}</p>
            <p className="blog-meta">
              ✍️ {post.blogger || b.blogger} · {prettyPostDate(post.postdate)}
            </p>
          </div>
        </a>
      ))}
      {moreButton}
    </div>
  );
}
