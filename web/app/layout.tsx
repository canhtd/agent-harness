import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Agent Harness Dashboard",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body
        style={{
          fontFamily:
            'Inter, "SF Pro Display", "SF Pro", -apple-system, BlinkMacSystemFont, system-ui, sans-serif',
          backgroundColor: "#f7f7f8",
        }}
      >
        {children}
      </body>
    </html>
  );
}
