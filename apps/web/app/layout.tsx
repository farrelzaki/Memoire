import type { Metadata } from 'next';
import { KeyboardShortcuts } from '@/components/keyboard-shortcuts';
import { CommandPalette } from '@/features/command-palette/command-palette';
import { Sidebar } from '@/features/sidebar/sidebar';
import { Providers } from './providers';
import './globals.css';

export const metadata: Metadata = {
  title: 'Memoire',
  description: 'Personal knowledge workspace',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="h-screen bg-white text-zinc-900 antialiased dark:bg-zinc-950 dark:text-zinc-100">
        <Providers>
          <KeyboardShortcuts />
          <div className="flex h-full">
            <Sidebar />
            <main className="min-w-0 flex-1 overflow-y-auto">{children}</main>
          </div>
          <CommandPalette />
        </Providers>
      </body>
    </html>
  );
}
