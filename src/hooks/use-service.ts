import { useLocalSearchParams } from 'expo-router';
import { getRecord } from '@/lib/db';
import type { Service } from '@/lib/attendance';
import { useLocalQuery } from './use-local-query';

/** The service named in the route (/service/[id]/…), from the phone. */
export function useRouteService() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return useLocalQuery(() => getRecord<Service>('services', id), ['records:services', 'records'], [id]);
}
