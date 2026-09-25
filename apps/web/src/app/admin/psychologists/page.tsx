"use client";

import { Suspense, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Spinner } from "@/ui";

/** Old address of the verification queue: now «Специалисты». */
function Redirect() {
  const router = useRouter();
  const params = useSearchParams();
  useEffect(() => {
    const status = params.get("status");
    router.replace(`/admin/specialists${status ? `?status=${encodeURIComponent(status)}` : ""}`);
  }, [params, router]);
  return <Spinner />;
}

export default function Page() {
  return (
    <Suspense fallback={null}>
      <Redirect />
    </Suspense>
  );
}
