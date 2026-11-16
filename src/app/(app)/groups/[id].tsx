import { useLocalSearchParams } from 'expo-router';
import { GroupDetail } from '@/screens/ministry';

export default function GroupRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <GroupDetail id={id} />;
}
