import { useLocalSearchParams } from 'expo-router';
import { SubmissionScreen } from '@/screens/reports';

export default function SubmissionRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <SubmissionScreen id={id} />;
}
