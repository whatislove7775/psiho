import { t } from "@/lib/i18n";
import type { Metadata } from "next";
import { GroupRoom } from "@/components/circles/GroupRoom";

export function generateMetadata(): Metadata {
  return {
    title: t("Встреча круга"),
    robots: { index: false, follow: false },
  };
}

export default function CircleRoomPage({ params }: { params: { id: string } }) {
  return <GroupRoom meetingId={params.id} />;
}
