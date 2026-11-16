import { useRouteService } from '@/hooks/use-service';
import { VisitorForm } from '@/screens/service-forms';

export default function VisitorRoute() {
  const q = useRouteService();
  return q.data ? <VisitorForm service={q.data} /> : null;
}
