import { useLocalSearchParams } from 'expo-router';
import { VisitDetail } from '@/screens/ministry';

export default function VisitRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <VisitDetail id={id} />;
}
