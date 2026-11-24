"use client";

import { Check, Ellipsis, FileText, History, Pencil, Plus, Shield, X } from "lucide-react";
import { createContext, Fragment, useContext, useRef, useState, type ReactNode, type RefObject } from "react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

const icons = { check: Check, file: FileText, history: History, edit: Pencil, add: Plus, access: Shield, cancel: X };
export type RowAction = {
  id: string;
  label: string;
  icon: keyof typeof icons;
  destructive?: boolean;
  content: ReactNode;
};
type DialogLaunch = {
  open: boolean;
  close: () => void;
  trigger: RefObject<HTMLButtonElement | null>;
  requestKey: string;
};
const RowActionContext = createContext<DialogLaunch | null>(null);

export function useRowAction() {
  return useContext(RowActionContext);
}

export function RowActions({ actions }: { actions: RowAction[] }) {
  const trigger = useRef<HTMLButtonElement>(null);
  const queued = useRef<string>(null);
  const [launch, setLaunch] = useState<{ id: string; open: boolean; requestKey: string }>();
  const choice = actions.find(({ id }) => id === launch?.id);
  if (!actions.length) return null;
  return <>
    <DropdownMenu onOpenChangeComplete={(open) => {
      if (open || !queued.current) return;
      setLaunch({ id: queued.current, open: true, requestKey: crypto.randomUUID() });
      queued.current = null;
    }}>
      <DropdownMenuTrigger ref={trigger} render={<Button type="button" size="icon" variant="ghost" className="size-11 sm:size-9" aria-label="Buka tindakan" />}>
        <Ellipsis aria-hidden="true" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-max min-w-40 max-w-[calc(100vw-1rem)]"
        finalFocus={() => queued.current ? false : trigger.current}>
        {actions.map(({ id, label, icon, destructive }, index) => {
          const Icon = icons[icon];
          return <Fragment key={id}>
            {destructive && index > 0 && !actions[index - 1].destructive && <DropdownMenuSeparator />}
            <DropdownMenuItem variant={destructive ? "destructive" : "default"} className="min-h-11 px-2 sm:min-h-9"
              onClick={() => { queued.current = id; }}>
              <Icon aria-hidden="true" />{label}
            </DropdownMenuItem>
          </Fragment>;
        })}
      </DropdownMenuContent>
    </DropdownMenu>
    {choice && launch && <RowActionContext.Provider key={launch.requestKey} value={{
      open: launch.open,
      requestKey: launch.requestKey,
      trigger,
      close: () => setLaunch((current) => current && { ...current, open: false }),
    }}>{choice.content}</RowActionContext.Provider>}
  </>;
}
