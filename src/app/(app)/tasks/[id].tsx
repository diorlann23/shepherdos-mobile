import { useLocalSearchParams } from 'expo-router';
import { TaskDetail } from '@/screens/tasks';

export default function TaskRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <TaskDetail id={id} />;
}
