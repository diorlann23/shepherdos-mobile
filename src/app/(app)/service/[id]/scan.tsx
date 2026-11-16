import { useRouteService } from '@/hooks/use-service';
import { ScanScreen } from '@/screens/scan';

export default function ScanRoute() {
  const q = useRouteService();
  return q.data ? <ScanScreen service={q.data} /> : null;
}
