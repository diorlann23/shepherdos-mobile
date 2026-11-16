import { useLocalSearchParams } from 'expo-router';
import { MemberForm } from '@/screens/member-form';

export default function NewMemberRoute() {
  const { quick } = useLocalSearchParams<{ quick?: string }>();
  return <MemberForm quick={quick === '1'} />;
}
