import { useLocalSearchParams } from 'expo-router';
import { EventDetail } from '@/screens/events';

export default function EventRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <EventDetail id={id} />;
}
