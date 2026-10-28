"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { Plus } from "lucide-react";

export function NewProjectButton({ size = "xl" }: { size?: "default" | "lg" | "xl" | "sm" }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const create = async () => {
    setBusy(true);
    try {
      const res = await fetch("/api/projects", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
      const data = (await res.json()) as { project: { id: string } };
      router.push(`/studio/${data.project.id}`);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Button size={size} onClick={create} disabled={busy} data-testid="new-project">
      {busy ? <Spinner /> : <Plus />} 새 곡 만들기
    </Button>
  );
}
