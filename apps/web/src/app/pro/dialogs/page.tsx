"use client";

import { Suspense } from "react";
import { DialogsApp } from "@/components/dialogs/DialogsApp";

export default function Page() {
  return (
    <Suspense fallback={null}>
      <DialogsApp mode="specialist" />
    </Suspense>
  );
}
