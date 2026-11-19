"use client";

import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export function ModuleTabs({ path, tab, tabs, children }: {
  path: string; tab: string; tabs: readonly { value: string; label: string }[]; children: ReactNode;
}) {
  const router = useRouter();
  return (
    <Tabs value={tab} className="min-w-0 gap-4" onValueChange={(value) => router.push(`${path}?tab=${encodeURIComponent(value)}`, { scroll: false })}>
      <div className="max-w-full overflow-x-auto px-0.5 py-1">
        <TabsList aria-label="Bagian modul" className="h-10">
          {tabs.map(({ value, label }) => <TabsTrigger key={value} value={value} className="px-3">{label}</TabsTrigger>)}
        </TabsList>
      </div>
      <TabsContent value={tab} className="min-w-0">{children}</TabsContent>
    </Tabs>
  );
}
