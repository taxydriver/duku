// apps/duku-ui/src/app/layout.tsx
import "./globals.css";
import { Sidebar } from "@/components/shell/Sidebar";
import { Toaster } from "sonner";

export const metadata = {
  title: "Duku",
  description: "Movie discovery through play",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="antialiased">
        <div className="flex min-h-screen">
          <Sidebar />
          <main className="flex-1 p-6 max-w-[1400px] mx-auto">{children}</main>
        </div>
        <Toaster richColors />
      </body>
    </html>
  );
}