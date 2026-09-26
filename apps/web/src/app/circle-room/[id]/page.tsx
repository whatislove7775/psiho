import type { Metadata } from "next";
import { GroupRoom } from "@/components/circles/GroupRoom";

export const metadata: Metadata = {
  title: "Встреча круга",
  robots: { index: false, follow: false },
};

export default function CircleRoomPage({ params }: { params: { id: string } }) {
  return <GroupRoom meetingId={params.id} />;
}
