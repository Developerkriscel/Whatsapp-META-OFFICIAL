import { useQuery } from '@tanstack/react-query';
import { api } from '../api/client';

export function useAIStatus() {
  return useQuery({
    queryKey: ['ai-status'],
    queryFn: async () => {
      const response = await api.get('/ai/status');
      return response.data.data as { available: boolean };
    },
    staleTime: Infinity,
  });
}
