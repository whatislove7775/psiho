"use client";

import { Suspense } from "react";
import { Messenger } from "@/components/chat/Messenger";

export default function Page() {
  return (
    <Suspense fallback={null}>
      <Messenger mode="specialist" />
    </Suspense>
  );
}
