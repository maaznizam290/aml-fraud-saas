import type { Metadata } from "next";

import { SessionProvider } from "../lib/auth/session.js";
import "./globals.css";

export const metadata: Metadata = {
  title: "Meridian AML | AI-Assisted Fraud & AML Investigation",
  description:
    "Explainable, human-in-the-loop AML and fraud investigation for banks, fintechs, and payment companies.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <SessionProvider>{children}</SessionProvider>
      </body>
    </html>
  );
}
