import { useRouteService } from '@/hooks/use-service';
import { HeadcountForm } from '@/screens/service-forms';

export default function HeadcountRoute() {
  const q = useRouteService();
  return q.data ? <HeadcountForm service={q.data} /> : null;
}
