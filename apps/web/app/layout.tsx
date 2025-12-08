import "./globals.css";
import type { ReactNode } from "react";
import Providers from "./providers";
import { AppShell } from "./ui-shell";

export const metadata = {
  title: "Nexus Enterprise",
  description: "Nexus project management portal"
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Providers>
          <AppShell>{children}</AppShell>
        </Providers>
      </body>
    </html>
  );
}
