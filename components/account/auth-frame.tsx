import Image from "next/image";
import type { ReactNode } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export function AuthFrame({ title, description, children }: { title: string; description: string; children: ReactNode }) {
  return (
    <main className="flex min-h-dvh items-center justify-center px-4 py-8">
      <div className="w-full min-w-0 max-w-md">
        <div className="mb-6 flex items-center justify-center gap-2">
          <Image
            src="/logo.png"
            alt=""
            width={48}
            height={48}
            className="size-12 shrink-0 object-contain"
            loading="eager"
          />
          <span className="text-xl font-bold tracking-tight text-foreground">Kandang Pagi</span>
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
