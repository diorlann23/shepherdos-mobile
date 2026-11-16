import { useLocalSearchParams } from 'expo-router';
import { getRecord } from '@/lib/db';
import { useLocalQuery } from '@/hooks/use-local-query';
import { EntryForm } from '@/screens/finance-forms';
import type { Sheet } from '@/lib/finance';

export default function EntryRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const q = useLocalQuery(() => getRecord<Sheet>('batches', id), ['records:batches'], [id]);
  return q.data ? <EntryForm sheet={q.data} /> : null;
}
