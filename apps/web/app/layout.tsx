import type { Metadata } from 'next';
import { KeyboardShortcuts } from '@/components/keyboard-shortcuts';
import { OfflineManager } from '@/components/offline-manager';
import { Toaster } from '@/components/ui/toaster';
import { CommandPalette } from '@/features/command-palette/command-palette';
import { Sidebar } from '@/features/sidebar/sidebar';
import { Providers } from './providers';
import './globals.css';

export const metadata: Metadata = {
  title: 'Memoire',
  description: 'Personal knowledge workspace',
  manifest: '/manifest.json',
  icons: { icon: '/icon.svg' },
};

export const viewport = {
  themeColor: '#18181b',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        {/* KaTeX (§29A, Sprint 16): self-hosted from public/katex/, copied
            from node_modules at build time — never a CDN link (§29A.1
            forbids the app fetching third-party assets client-side outside
            explicit media/embeds). Must live inside an explicit <head> —
            rendering it as a direct child of <html> is invalid HTML and
            triggers a hydration-mismatch dev overlay that then blocks every
            click underneath it (confirmed by hand: every e2e test failed
            with "<nextjs-portal> intercepts pointer events" until this was
            fixed). */}
        <link rel="stylesheet" href="/katex/katex.min.css" />
      </head>
      <body className="h-screen bg-white text-zinc-900 antialiased dark:bg-zinc-950 dark:text-zinc-100">
        <Providers>
          <KeyboardShortcuts />
          <div className="flex h-full">
            <div className="no-print contents">
              <Sidebar />
            </div>
            <main className="min-w-0 flex-1 overflow-y-auto">{children}</main>
          </div>
          <div className="no-print">
            <CommandPalette />
            <OfflineManager />
            <Toaster />
          </div>
        </Providers>
      </body>
    </html>
  );
}
