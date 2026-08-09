import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Mortal Locks",
  description: "Pick the line. Own the board.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Oswald:wght@500;600;700&family=Inter:wght@400;500;600&family=IBM+Plex+Mono:wght@500;600&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="bg-field text-ink font-body min-h-screen">
        <div className="max-w-3xl mx-auto px-5 py-10">{children}</div>
      </body>
    </html>
  );
}
