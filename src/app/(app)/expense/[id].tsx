import { useLocalSearchParams } from 'expo-router';
import { ExpenseDetail } from '@/screens/finance-forms';

export default function ExpenseRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <ExpenseDetail id={id} />;
}
