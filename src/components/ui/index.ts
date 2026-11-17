"use client";

// ── KDS Components ─────────────────────────────────────────────────────────────
// Imported directly from design-system source during development.
// Replace with `@kaya/design-system` package imports before production.

export {
  Sidebar,
  SidebarProvider,
  useSidebar,
} from "@/components/Sidebar";
export type {
  SidebarProps,
  SidebarContextValue,
  SidebarProviderProps,
} from "@/components/Sidebar";

export { SidebarInset } from "@/components/SidebarInset";

export {
  SidebarMenuItem,
} from "@/components/SidebarMenuItem";
export type {
  SidebarMenuItemProps,
  SidebarMenuItemVariant,
} from "@/components/SidebarMenuItem";

export { SidebarProjectsSection } from "@/components/SidebarProjectsSection";

export { SidebarMenuSkeleton } from "@/components/SidebarMenuSkeleton";

// ── Flat sidebar (Souvenir V1.5) ──────────────────────────────────────────────
// New, separate primitives — the old Sidebar/SidebarMenuItem/SidebarProjectsSection
// above are left untouched and keep serving Brain/Admin/team-settings pages.
export { FlatSidebar } from "@/components/FlatSidebar";
export type { FlatSidebarProps } from "@/components/FlatSidebar";
export { FlatSidebarRow } from "@/components/FlatSidebarRow";
export type { FlatSidebarRowProps, FlatSidebarRowVariant } from "@/components/FlatSidebarRow";
export { FlatSidebarProjectGroup } from "@/components/FlatSidebarProjectGroup";
export type { FlatSidebarProjectGroupProps } from "@/components/FlatSidebarProjectGroup";
export { FlatSidebarSlackConnector } from "@/components/FlatSidebarSlackConnector";
export { FlatSidebarProfileRow } from "@/components/FlatSidebarProfileRow";

// The one Button / IconButton (plan decision D2).
export * from "@/components/ui/button";

export * from "@/components/Badge";


// ── Layout and type (plan Phase 3) ────────────────────────────────────────────
export * from "@/components/ui/text";
export * from "@/components/ui/layout";
export * from "@/components/ui/card";
export { Divider as Separator } from "@/components/Divider";
export type { DividerProps as SeparatorProps } from "@/components/Divider";

// ── Forms (plan Phase 4) ──────────────────────────────────────────────────────
export * from "@/components/ui/field";
export * from "@/components/ui/input";
export * from "@/components/ui/textarea";
export * from "@/components/ui/radio-group";
export * from "@/components/ui/segmented-control";
export * from "@/components/ui/select";
