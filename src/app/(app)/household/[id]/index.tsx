import { useLocalSearchParams } from 'expo-router';
import { HouseholdDetail } from '@/screens/household-detail';

export default function HouseholdRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <HouseholdDetail id={id} />;
}
