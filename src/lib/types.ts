/** The parts of the server's /auth/me answer the app uses. */
export interface Subscription {
  plan: string;
  planName: string;
  state: 'none' | 'active' | 'expiring' | 'grace' | 'locked';
  endsAt: string;
  graceEndsAt: string;
  daysLeft: number;
  daysToLock: number;
}
export interface RenewalContact {
  email?: string | null;
  phone?: string | null;
  whatsapp?: string | null;
  hours?: string | null;
}
export interface Me {
  user: { id: string; name: string; email: string; phone: string | null; twoFactorEnabled: boolean };
  session: { mfa: 'none' | 'pending' | 'verified'; demo: boolean };
  org: {
    id: string;
    name: string;
    slug: string;
    access: 'open' | 'pending' | 'rejected' | 'suspended' | 'locked';
    statusReason: string | null;
    subscription: Subscription | null;
    renewalContact: RenewalContact | null;
    currency: string;
    timezone: string;
    defaultPhoneCountry: string;
    modules: string[];
    settings: { memberFormRequired: string[]; memberFormHidden: string[] };
  } | null;
  orgs: { id: string; name: string; slug: string; access: string }[];
  roles: string[];
  /** Every permission held somewhere, e.g. "member.create". */
  permissions: string[];
  /** Where some actions are allowed: everywhere, or these places (with everything under them). */
  scopes: Record<string, 'all' | string[]>;
  /** The part of the church this person may know about. */
  nodes: OrgNode[];
  rootNodeId: string | null;
  /** This person's own member record, if they have one. */
  memberId: string | null;
}

export interface OrgNode {
  id: string;
  name: string;
  kind: string;
  parentId: string | null;
  category: string | null;
  isActive: boolean;
}

export interface MemberRow {
  id: string;
  memberNumber: string;
  fullName: string;
  firstName: string;
  lastName: string;
  gender: string | null;
  phone: string | null;
  email: string | null;
  status: string;
  nodeId: string;
  branchName: string;
  groups: { id: string; name: string; role?: string }[];
  householdId: string | null;
  householdRole: string | null;
  dateOfBirth: string | null;
  age: number | null;
  dateJoined: string | null;
  lastAttendedAt: string | null;
  area: string | null;
  middleName?: string | null;
  maritalStatus?: string | null;
  secondaryPhone?: string | null;
  whatsapp?: string | null;
  occupation?: string | null;
  updatedAt: string;
  /** Added on this phone and not on the server yet. */
  pending?: boolean;
}

export interface HouseholdRow {
  id: string;
  name: string;
  nodeId: string;
  branch: string;
  address: string | null;
  phone: string | null;
  headName: string | null;
  pending?: boolean;
}
