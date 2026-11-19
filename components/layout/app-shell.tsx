"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Egg, Moon, Sun, UserRound } from "lucide-react";
import { useTheme } from "next-themes";
import {
  Breadcrumb, BreadcrumbItem, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Button } from "@/components/ui/button";
import {
  Sidebar, SidebarContent, SidebarFooter, SidebarGroup, SidebarGroupContent,
  SidebarHeader, SidebarInset, SidebarMenu, SidebarMenuButton, SidebarMenuItem,
  SidebarProvider, SidebarTrigger, useSidebar,
} from "@/components/ui/sidebar";
import { canViewModule, modules, type Role } from "@/lib/navigation";

export type WorkspaceUser = { name: string; role: Role };

function Navigation({ user }: { user?: WorkspaceUser }) {
  const pathname = usePathname();
  const { setOpenMobile } = useSidebar();
  const visible = user ? modules.filter((module) => canViewModule(user.role, module)) : modules;
  const home = user?.role === "reseller" ? "/reseller" : "/dashboard";

  return (
    <Sidebar collapsible="offcanvas">
      <SidebarHeader className="h-16 justify-center border-b border-sidebar-border px-4">
        <Link href={home} onClick={() => setOpenMobile(false)} className="flex w-fit items-center gap-3 rounded-lg focus-visible:outline-2 focus-visible:outline-ring">
          <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary text-primary-foreground"><Egg aria-hidden="true" className="size-5" /></span>
          <span className="text-base font-semibold tracking-tight">Kandang Pagi</span>
        </Link>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup className="px-3 pt-4">
          <SidebarGroupContent>
            <nav aria-label="Modul utama">
              <SidebarMenu className="gap-1.5">
                {visible.map(({ slug, title, icon: Icon }) => {
                  const href = `/${slug}`;
                  const active = pathname === href || pathname.startsWith(`${href}/`);
                  return (
                    <SidebarMenuItem key={slug}>
                      <SidebarMenuButton
                        isActive={active}
                        className="h-10 gap-3 rounded-lg px-3 text-sm data-active:bg-primary/10 data-active:text-red-700 dark:data-active:text-primary"
                        render={<Link href={href} aria-current={active ? "page" : undefined} onClick={() => setOpenMobile(false)} />}
                      >
                        <Icon aria-hidden="true" />
                        <span>{title}</span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </nav>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter className="border-t border-sidebar-border p-3">
        <div className="flex items-center gap-3 rounded-lg px-2 py-1.5">
          <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground"><UserRound className="size-4" aria-hidden="true" /></span>
          <span className="truncate text-sm text-muted-foreground">{user?.name ?? "Belum masuk"}</span>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}

function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  return (
    <Button type="button" size="icon" variant="outline" className="size-9" aria-label="Ganti tema terang atau gelap" onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}>
      <Moon aria-hidden="true" className="dark:hidden" />
      <Sun aria-hidden="true" className="hidden dark:block" />
    </Button>
  );
}

export function AppShell({ children, user }: { children: React.ReactNode; user?: WorkspaceUser }) {
  const pathname = usePathname();
  const current = modules.find(({ slug }) => pathname.split("/")[1] === slug);
  return (
    <SidebarProvider>
      <a href="#konten" className="sr-only fixed z-50 rounded-md bg-card px-4 py-2 text-foreground focus:not-sr-only focus:left-3 focus:top-3">
        Lewati ke konten
      </a>
      <Navigation user={user} />
      <SidebarInset className="min-w-0 bg-background">
        <header className="sticky top-0 z-10 flex h-16 min-w-0 shrink-0 items-center justify-between gap-3 border-b bg-card px-3 sm:px-6">
          <div className="flex min-w-0 items-center gap-2 sm:gap-3">
            <SidebarTrigger aria-label="Buka atau tutup navigasi" className="size-9 shrink-0 [&>.sr-only]:hidden" />
            {current && (
              <Breadcrumb className="min-w-0" aria-label="Lokasi halaman">
                <BreadcrumbList className="flex-nowrap">
                  <BreadcrumbItem className="hidden lg:inline-flex">Ruang kerja</BreadcrumbItem>
                  <BreadcrumbSeparator className="hidden lg:block" />
                  <BreadcrumbItem className="min-w-0"><BreadcrumbPage className="truncate text-sm font-medium">{current.title}</BreadcrumbPage></BreadcrumbItem>
                </BreadcrumbList>
              </Breadcrumb>
            )}
          </div>
          <ThemeToggle />
        </header>
        <div id="konten" tabIndex={-1} className="mx-auto flex w-full max-w-384 min-w-0 flex-col gap-5 px-3 py-5 outline-none sm:px-6 sm:py-7 xl:px-8">
          {children}
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
