import { useLocalSearchParams } from 'expo-router';
import { FollowUpDetail } from '@/screens/ministry';

export default function FirstTimerRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <FollowUpDetail id={id} />;
}
