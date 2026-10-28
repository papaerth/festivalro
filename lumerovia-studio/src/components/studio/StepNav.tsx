"use client";
import { STEPS } from "@/components/studio/types";
import { cn } from "@/lib/utils";
import { Check } from "lucide-react";

export function StepNav({ current, maxReached, onSelect }: { current: number; maxReached: number; onSelect: (n: number) => void }) {
  return (
    <nav aria-label="제작 단계" className="-mx-4 overflow-x-auto px-4 scrollbar-thin sm:mx-0 sm:px-0">
      <ol className="flex min-w-max gap-2 sm:grid sm:min-w-0 sm:grid-cols-6">
        {STEPS.map((s) => {
          const active = s.n === current;
          const done = s.n < maxReached && !active;
          return (
            <li key={s.n}>
              <button
                type="button"
                onClick={() => onSelect(s.n)}
                data-testid={`step-${s.n}`}
                aria-current={active ? "step" : undefined}
                className={cn(
                  "flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition sm:flex-col sm:items-start sm:gap-1",
                  active ? "border-gold-500/70 bg-gold-500/10 shadow-gold" : "border-border/60 bg-card/60 hover:border-gold-500/40",
                )}
              >
                <span className={cn("flex h-7 w-7 shrink-0 items-center justify-center rounded-full border font-serif text-sm", active ? "border-gold-400 bg-gold-500 text-navy-900" : done ? "border-emerald-500/60 text-emerald-300" : "border-border text-ivory-400")}>
                  {done ? <Check className="h-4 w-4" /> : s.n}
                </span>
                <span className="min-w-0">
                  <span className={cn("block text-sm font-medium", active ? "text-ivory" : "text-ivory-300")}>{s.ko}</span>
                  <span className="hidden text-[11px] text-muted-foreground sm:block">{s.desc}</span>
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
