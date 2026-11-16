import { useLocalSearchParams } from 'expo-router';
import { SavedRunScreen } from '@/screens/reports';

export default function SavedRunRoute() {
  const { index } = useLocalSearchParams<{ index: string }>();
  return <SavedRunScreen index={Number(index) || 0} />;
}
