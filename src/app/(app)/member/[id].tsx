import { useLocalSearchParams } from 'expo-router';
import { MemberDetail } from '@/screens/member-detail';

export default function MemberRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <MemberDetail id={id} />;
}
