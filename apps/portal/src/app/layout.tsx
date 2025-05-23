import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Create Next App",
  description: "Generated by create next app",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <div className="relative flex min-h-screen flex-col">
          <div className="flex-1">
            {/* Import is done dynamically to avoid issues with client components in server context */}
            <HeaderWrapper />
            <main>{children}</main>
          </div>
        </div>
      </body>
    </html>
  );
}

// Wrapper to handle client component in server context
async function HeaderWrapper() {
  const { Header } = await import('@/components/header');
  return <Header />;
}
