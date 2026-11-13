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
    modules: string[];
  } | null;
  orgs: { id: string; name: string; slug: string; access: string }[];
  roles: string[];
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
  updatedAt: string;
}

export interface HouseholdRow {
  id: string;
  name: string;
  branch: string;
  address: string | null;
  phone: string | null;
  headName: string | null;
}
