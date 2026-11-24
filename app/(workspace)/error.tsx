"use client";

import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/module";

export default function WorkspaceError({ reset }: { reset: () => void }) {
  return <div role="alert"><EmptyState title="Halaman gagal dimuat" description="Muat ulang halaman untuk mencoba kembali." action={<Button onClick={reset}>Coba lagi</Button>} /></div>;
}
