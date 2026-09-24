import { AppShell } from "@/components/shell/AppShell";

export default function Layout({ children }: { children: React.ReactNode }) {
  return <AppShell role="admin">{children}</AppShell>;
}
