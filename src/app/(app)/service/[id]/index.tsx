import { useLocalSearchParams } from 'expo-router';
import { ServiceScreen } from '@/screens/service';

export default function ServiceRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <ServiceScreen id={id} />;
}
