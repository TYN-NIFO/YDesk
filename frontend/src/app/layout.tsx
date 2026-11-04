import type { Metadata } from "next";
import { Providers } from "./providers";
import "./globals.css";
import "./workspace.css";
import TopNav from "./components/TopNav";

export const metadata: Metadata = {
  title: "YDesk",
  description: "Internal reimbursement system",
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
