import { Egg } from "lucide-react";
import type { ReactNode } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export function AuthFrame({ title, description, children }: { title: string; description: string; children: ReactNode }) {
  return (
    <main className="grid min-h-dvh place-content-center px-4 py-8">
      <div className="w-full min-w-0 sm:w-[26rem]">
        <div className="mb-4 flex items-center justify-center gap-2.5">
          <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary text-primary-foreground"><Egg aria-hidden="true" className="size-5" /></span>
          <span className="font-semibold">Kandang Pagi</span>
        </div>
        <Card>
          <CardHeader>
            <CardTitle><h1 className="text-xl">{title}</h1></CardTitle>
            <CardDescription className="text-sm/6">{description}</CardDescription>
          </CardHeader>
          <CardContent>{children}</CardContent>
        </Card>
      </div>
    </main>
  );
}
