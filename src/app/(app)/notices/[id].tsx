import { useLocalSearchParams } from 'expo-router';
import { NoticeDetail } from '@/screens/ministry';

export default function NoticeRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <NoticeDetail id={id} />;
}
