'use client';

import { useCreatePage } from '@/hooks/use-create-page';

export default function Home() {
  const createPage = useCreatePage();

  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 p-8">
      <h1 className="text-2xl font-semibold text-zinc-900">Memoire</h1>
      <p className="text-sm text-zinc-500">Select a page, or create your first one.</p>
      <button
        onClick={() => createPage.mutate({})}
        className="mt-2 rounded-md bg-zinc-900 px-3 py-1.5 text-sm text-white hover:bg-zinc-700"
      >
        New page
      </button>
    </div>
  );
}
