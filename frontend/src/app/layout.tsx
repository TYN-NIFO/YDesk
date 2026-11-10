import type { Metadata } from "next";
import { Providers } from "./providers";
import "./globals.css";
import "./workspace.css";
import TopNav from "./components/TopNav";

export const metadata: Metadata = {
  title: "YDesk",
  description: "Your team workspace for expenses, time off and feedback",
  icons: { icon: "/icon.svg", shortcut: "/icon.svg" },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        <Providers>
          <TopNav />
          <main id="main-content">{children}</main>
        </Providers>
      </body>
    </html>
  );
}
