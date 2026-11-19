import type { Metadata } from "next";
import { Poppins } from "next/font/google";
import { Providers } from "@/components/layout/providers";
import "./globals.css";

const poppins = Poppins({
  variable: "--font-poppins",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

export const metadata: Metadata = {
  title: { default: "Kandang Pagi", template: "%s · Kandang Pagi" },
  description: "Ruang kerja operasional peternakan ayam petelur Kandang Pagi.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="id" suppressHydrationWarning className={`${poppins.variable} h-full antialiased`}>
      <body className="min-h-full">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
