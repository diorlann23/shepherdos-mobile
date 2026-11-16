import { useLocalSearchParams } from 'expo-router';
import { PastoralForm } from '@/screens/ministry';

export default function NewPastoralRoute() {
  const { kind } = useLocalSearchParams<{ kind?: string }>();
  return <PastoralForm kind={kind === 'visits' ? 'visits' : 'prayer'} />;
}
