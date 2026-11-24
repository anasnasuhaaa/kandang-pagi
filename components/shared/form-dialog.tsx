"use client";

import { Plus } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger,
} from "@/components/ui/sheet";
import { useRowAction } from "./row-actions";
import { useIsMobile } from "@/hooks/use-mobile";

export function FormDialog({
  open, onOpenChange, title, description, children, triggerVariant,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  children: ReactNode;
  triggerVariant?: React.ComponentProps<typeof Button>["variant"];
}) {
  const isMobile = useIsMobile();
  const rowAction = useRowAction();
  const trigger = <Button variant={triggerVariant} className="min-h-10 max-w-full whitespace-normal" />;
  const triggerContent = <>{triggerVariant !== "outline" && <Plus aria-hidden="true" />}{title}</>;
  if (isMobile) {
    return (
      <Sheet open={open} onOpenChange={onOpenChange}>
        {!rowAction && <SheetTrigger render={trigger}>{triggerContent}</SheetTrigger>}
        <SheetContent side="bottom" finalFocus={rowAction?.trigger} className="h-dvh max-h-dvh overflow-y-auto">
          <SheetHeader><SheetTitle>{title}</SheetTitle><SheetDescription>{description}</SheetDescription></SheetHeader>
          <div className="px-4 pb-6">{children}</div>
        </SheetContent>
      </Sheet>
    );
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {!rowAction && <DialogTrigger render={trigger}>{triggerContent}</DialogTrigger>}
      <DialogContent finalFocus={rowAction?.trigger} className="max-h-[90dvh] overflow-y-auto sm:max-w-xl">
        <DialogHeader><DialogTitle>{title}</DialogTitle><DialogDescription>{description}</DialogDescription></DialogHeader>
        {children}
      </DialogContent>
    </Dialog>
  );
}
