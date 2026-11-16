import { useLocalSearchParams } from 'expo-router';
import { getRecord } from '@/lib/db';
import { useLocalQuery } from '@/hooks/use-local-query';
import { MemberForm } from '@/screens/member-form';
import type { MemberRow } from '@/lib/types';

export default function EditMemberRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const q = useLocalQuery(() => getRecord<MemberRow>('members', id), [], [id]);
  return q.loading ? null : <MemberForm member={q.data} />;
}
