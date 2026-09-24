import type { Metadata } from "next";
import { Room } from "@/components/room/Room";

export const metadata: Metadata = {
  title: "Сессия",
  robots: { index: false, follow: false },
};

export default function RoomPage({ params }: { params: { id: string } }) {
  return <Room sessionId={params.id} />;
}
