"use client";

import { getImageProps } from "next/image";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useId, useState } from "react";
import { Boxes, ChevronDown, Moon, Sun, UserRound } from "lucide-react";
import { toast } from "sonner";
import { useTheme } from "next-themes";
import {
  Breadcrumb, BreadcrumbItem, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { roleLabels, type Theme } from "@/lib/roles";
import { saveThemeAction } from "@/server/auth/actions";
import {
  Sidebar, SidebarContent, SidebarFooter, SidebarGroup, SidebarGroupContent,
  SidebarHeader, SidebarInset, SidebarMenu, SidebarMenuButton, SidebarMenuItem,
  SidebarMenuSub, SidebarMenuSubButton, SidebarMenuSubItem,
  SidebarProvider, SidebarTrigger, useSidebar,
} from "@/components/ui/sidebar";
import { canViewModule, feedSection, feedSections, feedTabSchema, modules, type Role } from "@/lib/navigation";

export type WorkspaceUser = { name: string; role: Role; theme: Theme };

const { props: { src: sidebarLogo } } = getImageProps({ src: "/logo.png", alt: "", width: 40, height: 40 });

function FeedNavigation({ active, close }: { active: boolean; close: () => void }) {
  const id = useId();
  const [expanded, setExpanded] = useState(active);
  return (
    <SidebarMenuItem>
      <SidebarMenuButton type="button" isActive={active} aria-expanded={expanded} aria-controls={id}
        className="h-11 gap-3 rounded-lg px-3 text-sm data-active:bg-primary/10 data-active:text-danger-fg md:h-10 dark:data-active:text-primary"
        onClick={() => setExpanded((value) => !value)}>
        <Boxes aria-hidden="true" />
        <span>Pakan</span>
        <ChevronDown aria-hidden="true" className={expanded ? "ml-auto rotate-180" : "ml-auto"} />
      </SidebarMenuButton>
      <SidebarMenuSub id={id} className={expanded ? undefined : "hidden"}>
        <Suspense>
          {expanded && <FeedSectionLinks active={active} close={close} />}
        </Suspense>
      </SidebarMenuSub>
    </SidebarMenuItem>
  );
}

function FeedSectionLinks({ active, close }: { active: boolean; close: () => void }) {
  const params = useSearchParams();
  const selected = active ? feedSection(feedTabSchema.parse(params.get("tab"))) : undefined;
  return feedSections.map(({ value, label, href }) => (
    <SidebarMenuSubItem key={value}>
      <SidebarMenuSubButton isActive={selected === value} className="h-11 md:h-8"
        render={<Link href={href} aria-current={selected === value ? "page" : undefined} onClick={close} />}>
        <span>{label}</span>
      </SidebarMenuSubButton>
    </SidebarMenuSubItem>
  ));
}

function Navigation({ user }: { user?: WorkspaceUser }) {
  const pathname = usePathname();
  const { setOpenMobile } = useSidebar();
  const visible = user ? modules.filter((module) => canViewModule(user.role, module)) : modules;
  const home = user?.role === "reseller" ? "/reseller" : "/dashboard";

  return (
    <Sidebar collapsible="offcanvas">
      <SidebarHeader className="h-16 justify-center border-b border-sidebar-border px-4">
        <Link href={home} onClick={() => setOpenMobile(false)} className="flex min-h-11 w-fit items-center gap-1.5 rounded-lg text-sidebar-primary focus-visible:outline-2 focus-visible:outline-ring">
          <span
            aria-hidden="true"
            className="size-10 shrink-0 bg-current mask-contain mask-center mask-no-repeat"
            style={{ maskImage: `url("${sidebarLogo}")` }}
          />
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
                  if (slug === "pakan") return <FeedNavigation key={active ? "pakan-active" : "pakan"} active={active} close={() => setOpenMobile(false)} />;
                  return (
                    <SidebarMenuItem key={slug}>
                      <SidebarMenuButton
                        isActive={active}
                        className="h-11 gap-3 rounded-lg px-3 text-sm data-active:bg-primary/10 data-active:text-danger-fg md:h-10 dark:data-active:text-primary"
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
        {user && <AccountMenu user={user} close={setOpenMobile} />}
      </SidebarFooter>
    </Sidebar>
  );
}

function AccountMenu({ user, close }: { user: WorkspaceUser; close: (open: boolean) => void }) {
  const router = useRouter();

  async function signOut() {
    try {
      const response = await fetch("/api/auth/sign-out", { method: "POST" });
      if (!response.ok) throw new Error("Keluar gagal");
      router.replace("/masuk");
      router.refresh();
    } catch {
      toast.error("Gagal keluar. Coba lagi.");
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="ghost" className="h-12 w-full justify-start px-2" aria-label="Menu akun" />}>
        <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground"><UserRound className="size-4" aria-hidden="true" /></span>
        <span className="min-w-0 flex-1 text-left">
          <span className="block truncate">{user.name}</span>
          <span className="block truncate text-xs text-muted-foreground">{roleLabels[user.role]}</span>
        </span>
      </DropdownMenuTrigger>
      <DropdownMenuContent side="top" align="start" className="min-w-44">
        <DropdownMenuItem render={<Link href="/pengaturan" onClick={() => close(false)} />}>Profil</DropdownMenuItem>
        <DropdownMenuItem onClick={signOut}>Keluar</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const [pending, setPending] = useState(false);

  async function toggle() {
    const value = resolvedTheme === "dark" ? "light" : "dark";
    setPending(true);
    try {
      const result = await saveThemeAction(value);
      if (result.ok) setTheme(value);
      else toast.error(result.message);
    } catch {
      toast.error("Tema gagal disimpan.");
    } finally {
      setPending(false);
    }
  }

  return (
    <Button type="button" size="icon" variant="outline" className="size-11 md:size-9" aria-label="Ganti tema terang atau gelap" onClick={toggle} disabled={pending}>
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
            <SidebarTrigger aria-label="Buka atau tutup navigasi" className="size-11 shrink-0 md:size-9 [&>.sr-only]:hidden" />
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
        <div id="konten" tabIndex={-1} className="mx-auto flex w-full max-w-384 min-w-0 flex-col gap-4 px-3 py-4 outline-none sm:gap-5 sm:px-6 sm:py-7 xl:px-8">
          {children}
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
