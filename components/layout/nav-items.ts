import type { LucideIcon } from "lucide-react";
import {
  BarChart3,
  Bell,
  Brain,
  Database,
  FolderKanban,
  History,
  LayoutDashboard,
  PlayCircle,
  Settings,
} from "lucide-react";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

export const NAV_ITEMS: NavItem[] = [
  { href: "/dashboard", label: "Executive Dashboard", icon: LayoutDashboard },
  { href: "/alerts", label: "Alert Center", icon: Bell },
  { href: "/cases", label: "Cases", icon: FolderKanban },
  { href: "/analytics", label: "Analytics", icon: BarChart3 },
  { href: "/audit", label: "Audit Trail", icon: History },
  { href: "/learning", label: "AI Learning", icon: Brain },
  { href: "/models", label: "Model Registry", icon: Database },
  { href: "/demo", label: "Demo Simulator", icon: PlayCircle },
  { href: "/settings", label: "Settings", icon: Settings },
];
