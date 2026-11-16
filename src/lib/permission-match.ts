/**
 * Permission strings as the server writes them: "member.create", "member.*",
 * "*" (everything), with ":self" for "only my own record" (e.g. "member.edit:self").
 * Same rules as the website's permissionCovers.
 */
export function covers(granted: string, wanted: string): boolean {
  const [body] = granted.split(':');
  if (body === '*') return true;
  const [resource, action = '*'] = body.split('.');
  const [wantResource, wantAction] = wanted.split('.');
  return resource === wantResource && (action === '*' || action === wantAction);
}

/** Held somewhere, not just over the person's own record. */
export const holds = (permissions: string[], wanted: string) => permissions.some((p) => !p.endsWith(':self') && covers(p, wanted));
