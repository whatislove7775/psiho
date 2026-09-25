"use client";

import { RequirePerm } from "@/components/admin/AdminShell";
import { LabPage } from "@/components/admin/lab/LabPage";

export default function Page_() {
  return (
    <RequirePerm perm="lab.use">
      <LabPage />
    </RequirePerm>
  );
}
