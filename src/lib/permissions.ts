import type { Me, OrgNode } from './types';
import { holds } from './permission-match';

/**
 * What the signed-in person may do, from their profile. The server checks
 * every change again; this only decides which buttons to show.
 */
export const can = (me: Me | null, permission: string) => !!me && (!!me.scopes[permission] || holds(me.permissions, permission));

/** Allowed at this place (or one of these places)? */
export function allowedAt(me: Me | null, permission: string, nodeIds: (string | null | undefined)[]) {
  const scope = me?.scopes[permission];
  if (!scope) return false;
  if (scope === 'all') return true;
  return nodeIds.some((id) => !!id && scope.includes(id));
}

/** Groups and departments: what a member can join, as opposed to where they belong (HQ, region, branch). */
export const isGroup = (n: OrgNode) => n.kind === 'group' || n.kind === 'department';

/** Branches (and other non-group places) where this person may add people, nearest-named first. */
export function placesFor(me: Me | null, permission: string): OrgNode[] {
  if (!me) return [];
  return me.nodes.filter((n) => n.isActive && !isGroup(n) && allowedAt(me, permission, [n.id])).sort((a, b) => a.name.localeCompare(b.name));
}

/** Groups and ministries a member can be put in. */
export function groupsOf(me: Me | null): OrgNode[] {
  return (me?.nodes ?? []).filter((n) => n.isActive && isGroup(n)).sort((a, b) => a.name.localeCompare(b.name));
}

export const nodeName = (me: Me | null, id: string | null | undefined) => me?.nodes.find((n) => n.id === id)?.name ?? '';
