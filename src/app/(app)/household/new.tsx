import { useLocalSearchParams } from 'expo-router';
import { HouseholdForm } from '@/screens/household-form';

export default function NewHouseholdRoute() {
  const { member } = useLocalSearchParams<{ member?: string }>();
  return <HouseholdForm firstMemberId={member} />;
}
