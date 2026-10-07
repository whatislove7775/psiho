import { CoupleAppointment } from "@/components/couples/CoupleAppointment";
export default function Page({ params }: { params: { id: string } }) {
  return <CoupleAppointment id={params.id} />;
}
