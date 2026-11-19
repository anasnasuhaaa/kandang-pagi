import { Suspense } from "react";
import { AppShell } from "@/components/layout/app-shell";
import { ModuleSkeleton } from "@/components/shared/module";
import { workspaceActor } from "@/server/auth/workspace";

async function AuthorizedWorkspace({ children }: { children: React.ReactNode }) {
  const actor = await workspaceActor();
  return <AppShell user={{ name: actor.name, role: actor.role, theme: actor.theme }}>{children}</AppShell>;
}

export default function WorkspaceLayout({ children }: { children: React.ReactNode }) {
  return <Suspense fallback={<div className="p-5"><ModuleSkeleton /></div>}><AuthorizedWorkspace>{children}</AuthorizedWorkspace></Suspense>;
}
