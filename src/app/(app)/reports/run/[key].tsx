import { useLocalSearchParams } from 'expo-router';
import { ReportRunScreen } from '@/screens/reports';

export default function ReportRunRoute() {
  const { key } = useLocalSearchParams<{ key: string }>();
  return <ReportRunScreen reportKey={key} />;
}
