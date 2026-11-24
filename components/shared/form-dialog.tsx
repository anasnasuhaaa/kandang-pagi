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
  const trigger = <Button variant={triggerVariant} className="min-h-11 max-w-full whitespace-normal sm:min-h-10" />;
  const triggerContent = <>{triggerVariant !== "outline" && <Plus aria-hidden="true" />}{title}</>;
  if (isMobile) {
    return (
      <Sheet open={open} onOpenChange={onOpenChange}>
        {!rowAction && <SheetTrigger render={trigger}>{triggerContent}</SheetTrigger>}
        <SheetContent side="bottom" finalFocus={rowAction?.trigger} className="max-h-dvh overflow-y-auto overscroll-contain data-[side=bottom]:h-dvh">
          <SheetHeader className="pr-16"><SheetTitle>{title}</SheetTitle><SheetDescription>{description}</SheetDescription></SheetHeader>
          <div className="px-4 pb-6">{children}</div>
        </SheetContent>
      </Sheet>
    );
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {!rowAction && <DialogTrigger render={trigger}>{triggerContent}</DialogTrigger>}
      <DialogContent finalFocus={rowAction?.trigger} className="max-h-[90dvh] overflow-y-auto sm:max-w-xl">
        <DialogHeader className="pr-10"><DialogTitle>{title}</DialogTitle><DialogDescription>{description}</DialogDescription></DialogHeader>
        {children}
      </DialogContent>
    </Dialog>
  );
}
