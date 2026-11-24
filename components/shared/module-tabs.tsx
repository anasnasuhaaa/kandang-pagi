"use client";

import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export function ModuleTabs({ path, tab, tabs, children, action, summary }: {
  path: string; tab: string; tabs: readonly { value: string; label: string }[];
  children: ReactNode; action?: ReactNode; summary?: ReactNode;
}) {
  const router = useRouter();
  function navigate(value: string | null) {
    if (value && value !== tab) router.push(`${path}?tab=${encodeURIComponent(value)}`, { scroll: false });
  }

  if (tabs.length === 1) return <div className="min-w-0">{children}</div>;

  return (
    <Tabs value={tab} className="min-w-0 gap-4" onValueChange={navigate}>
      <div className="order-1 flex min-w-0 flex-col gap-2 md:order-2 md:flex-row md:flex-wrap md:items-center md:justify-between">
        <div className="md:hidden">
            <Select items={tabs} value={tab} onValueChange={navigate}>
              <SelectTrigger aria-label="Bagian modul" className="min-h-11 w-full"><SelectValue /></SelectTrigger>
              <SelectContent alignItemWithTrigger={false}>
                {tabs.map(({ value, label }) => <SelectItem key={value} value={value} className="min-h-11">{label}</SelectItem>)}
              </SelectContent>
            </Select>
        </div>
        <div className="hidden min-w-0 max-w-full overflow-x-auto px-0.5 py-1 md:block">
            <TabsList aria-label="Bagian modul" className="min-h-10">
              {tabs.map(({ value, label }) => <TabsTrigger key={value} value={value} className="px-3">{label}</TabsTrigger>)}
            </TabsList>
        </div>
        {action && <div className="flex min-w-0 flex-wrap items-center gap-2">{action}</div>}
      </div>
      {summary && <div className="order-2 min-w-0 md:order-1">{summary}</div>}
      <TabsContent value={tab} aria-label={tabs.find(({ value }) => value === tab)?.label} className="order-3 min-w-0">{children}</TabsContent>
    </Tabs>
  );
}
