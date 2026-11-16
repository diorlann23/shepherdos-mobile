import { useLocalSearchParams } from 'expo-router';
import { PrayerDetail } from '@/screens/ministry';

export default function PrayerRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <PrayerDetail id={id} />;
}
