import Link from "next/link";
import { cn } from "@/lib/utils";

export function BrandMark({ className, compact = false }: { className?: string; compact?: boolean }) {
  return (
    <Link href="/" className={cn("group inline-flex items-center gap-3", className)}>
      <span className="relative flex h-9 w-9 items-center justify-center rounded-full border border-gold-500/60 bg-navy-700 shadow-gold">
        <span className="font-serif text-lg font-semibold text-gold-300">L</span>
      </span>
      <span className="flex flex-col leading-tight">
        <span className="font-serif text-lg font-semibold tracking-[0.18em] text-ivory">LUMEROVIA</span>
        {!compact && <span className="text-[10px] uppercase tracking-[0.3em] text-gold-400">Where Memories Become Melodies</span>}
      </span>
    </Link>
  );
}
