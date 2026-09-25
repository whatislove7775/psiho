import type { Metadata } from "next";
import { Room } from "@/components/room/Room";

export const metadata: Metadata = {
  title: "Сессия",
  robots: { index: false, follow: false },
};

export default function RoomPage({ params, searchParams }: { params: { id: string }; searchParams: { lab?: string } }) {
  // ?lab=<signed invite> — a staff test room from /admin/lab (see components/admin/lab)
  const lab = typeof searchParams.lab === "string" && searchParams.lab ? searchParams.lab : undefined;
  return <Room sessionId={params.id} labToken={lab} />;
}
