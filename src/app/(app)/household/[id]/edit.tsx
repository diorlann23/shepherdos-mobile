import { useLocalSearchParams } from 'expo-router';
import { getRecord } from '@/lib/db';
import { useLocalQuery } from '@/hooks/use-local-query';
import { HouseholdForm } from '@/screens/household-form';
import type { HouseholdRow } from '@/lib/types';

export default function EditHouseholdRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const q = useLocalQuery(() => getRecord<HouseholdRow>('households', id), [], [id]);
  return q.loading ? null : <HouseholdForm household={q.data} />;
}
