"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export function OpenPlayLiveRefresh({ publicId }: { publicId: string }) {
  const router = useRouter();

  useEffect(() => {
    const stream = new EventSource(`/api/open-play/${publicId}/stream`);
    stream.addEventListener("snapshot", () => router.refresh());
    return () => stream.close();
  }, [publicId, router]);

  return null;
}
