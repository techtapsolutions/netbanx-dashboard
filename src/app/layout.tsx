import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/contexts/AuthContext";
import { getResourceHints } from "@/lib/cdn-config";
import { CDNMonitor } from "@/components/CDNMonitor";

// Optimize font loading with display swap and preload
const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
  display: 'swap',
  preload: true,
  fallback: ['system-ui', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'sans-serif'],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  display: 'swap',
  preload: true,
  fallback: ['ui-monospace', 'SFMono-Regular', 'Consolas', 'monospace'],
});

export const metadata: Metadata = {
  title: "Netbanx Dashboard",
  description: "Webhook monitoring and transaction analytics dashboard for Netbanx",
  // Enable web app manifest for PWA capabilities
  manifest: '/manifest.json',
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#ffffff' },
    { media: '(prefers-color-scheme: dark)', color: '#000000' },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Generate resource hints for optimal loading
  const resourceHints = getResourceHints();

  return (
    <html lang="en">
      <head>
        {/* DNS Prefetch and Preconnect for optimal performance */}
        {resourceHints.map((hint, index) => (
          <link
            key={index}
            rel={hint.rel}
            href={hint.href}
            {...(hint.crossOrigin && { crossOrigin: hint.crossOrigin })}
          />
        ))}
        
        {/* PWA meta tags */}
        <link rel="apple-touch-icon" href="/icon-192.svg" />
        <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <meta name="apple-mobile-web-app-title" content="Netbanx" />
        <meta name="application-name" content="Netbanx Dashboard" />
        <meta name="format-detection" content="telephone=no" />
        
        {/* Enable resource hints */}
        <meta httpEquiv="x-dns-prefetch-control" content="on" />
        
        {/* Optimize rendering */}
        <meta name="renderer" content="webkit" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge,chrome=1" />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <AuthProvider>
          <CDNMonitor />
          {children}
        </AuthProvider>
      </body>
    </html>
  );
}
