/**
 * Notifications carry the website link they open (the same one as in the bell
 * on the website). This turns it into the matching screen in the app, so a
 * tap goes straight to the task, expense, counting sheet or report.
 */
export function routeForLink(link: string | undefined | null): string {
  if (!link) return '/';
  let url: URL;
  try {
    url = new URL(link, 'https://app.invalid');
  } catch {
    return '/';
  }
  const q = url.searchParams;
  const id = (v: string | null | undefined) => (v && /^[A-Za-z0-9_-]{1,64}$/.test(v) ? v : null);
  const parts = url.pathname.split('/').filter(Boolean);
  switch (parts[0]) {
    case 'tasks': {
      const task = id(q.get('task'));
      return task ? `/tasks/${task}` : '/tasks';
    }
    case 'expenses': {
      const open = id(q.get('open'));
      return open ? `/expense/${open}` : '/finance';
    }
    case 'giving': {
      const sheet = parts[1] === 'batches' ? id(parts[2]) : null;
      return sheet ? `/sheet/${sheet}` : '/finance';
    }
    case 'events': {
      const event = id(parts[1]);
      return event ? `/events/${event}` : '/events';
    }
    case 'visitors':
      return '/firsttimers';
    case 'submissions': {
      const open = id(q.get('open'));
      return open ? `/reports/branch/${open}` : '/reports/branch';
    }
    case 'communication':
      return '/notices';
    case 'members': {
      const member = id(parts[1]);
      return member ? `/member/${member}` : '/members';
    }
    default:
      return '/';
  }
}
