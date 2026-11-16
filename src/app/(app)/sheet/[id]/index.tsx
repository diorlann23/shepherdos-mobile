import { useLocalSearchParams } from 'expo-router';
import { SheetScreen } from '@/screens/sheet';

export default function SheetRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <SheetScreen id={id} />;
}
