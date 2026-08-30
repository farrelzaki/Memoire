'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { api, type CreatePageInput } from '@/lib/api';

export function useCreatePage() {
  const router = useRouter();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CreatePageInput) => api.createPage(input),
    onSuccess: (page) => {
      queryClient.invalidateQueries({ queryKey: ['pages'] });
      router.push(`/${page.id}`);
    },
  });
}
