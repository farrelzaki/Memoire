import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

/** Combines conditional classes and resolves Tailwind conflicts (last wins) — the standard shadcn/ui helper. */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
