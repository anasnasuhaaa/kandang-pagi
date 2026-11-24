import type { LucideIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export const semanticStyles = {
  success: "border-success-border bg-success-bg text-success-fg",
  warning: "border-warning-border bg-warning-bg text-warning-fg",
  danger: "border-danger-border bg-danger-bg text-danger-fg",
  info: "border-info-border bg-info-bg text-info-fg",
  neutral: "border-neutral-border bg-neutral-bg text-neutral-fg",
  adjustment: "border-adjustment-border bg-adjustment-bg text-adjustment-fg",
  earth: "border-earth-border bg-earth-bg text-earth-fg",
} as const;

export type SemanticTone = keyof typeof semanticStyles;
export type StatusPresentation = { label: string; tone: SemanticTone };

export function statusPresentation(mapping: Readonly<Record<string, StatusPresentation>>, value: string): StatusPresentation {
  return Object.hasOwn(mapping, value) ? mapping[value] : { tone: "neutral", label: "Status tidak diketahui" };
}

export function StatusBadge({ label, tone = "neutral", icon: Icon }: {
  label: string;
  tone?: SemanticTone;
  icon?: LucideIcon;
}) {
  return <Badge variant="outline" className={cn("h-auto min-h-5 gap-1 rounded-full px-2 py-0.5 text-xs leading-tight", semanticStyles[tone])}>
    {Icon && <Icon aria-hidden="true" className="size-3" />}
    {label}
  </Badge>;
}
