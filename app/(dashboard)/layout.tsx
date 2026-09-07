import { AppShell } from "../../components/layout/AppShell.js";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return <AppShell>{children}</AppShell>;
}
