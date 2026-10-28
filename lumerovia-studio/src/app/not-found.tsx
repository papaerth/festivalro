import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-[60vh] max-w-xl flex-col items-center justify-center px-4 text-center">
      <h1 className="font-serif text-4xl text-ivory">페이지를 찾을 수 없습니다</h1>
      <p className="mt-3 text-ivory-400">삭제된 곡이거나 잘못된 주소입니다.</p>
      <Link href="/" className={buttonVariants({ className: "mt-6" })}>대시보드로</Link>
    </main>
  );
}
