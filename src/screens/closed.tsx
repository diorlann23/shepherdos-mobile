import { Linking, View } from 'react-native';
import { Button, Text } from '@/components/ui';
import { AuthShell } from '@/components/auth-shell';
import { useAuth } from '@/lib/auth';
import { formatDate } from '@/lib/format';
import { space } from '@/theme';

/** The church can't be used: waiting for approval, suspended, or the subscription ran out. */
export function Closed() {
  const { me, refresh, signOut } = useAuth();
  const org = me?.org;
  const contact = org?.renewalContact;
  const copy = {
    pending: ['Waiting for approval', 'The ShepherdOS team is reviewing your church. You’ll get an email when it’s approved.'],
    rejected: ['Church not approved', org?.statusReason ?? 'Contact the ShepherdOS team for details.'],
    suspended: ['Church suspended', 'This church account has been suspended. Contact the ShepherdOS team.'],
    locked: [
      'Subscription expired',
      `${org?.name ?? 'This church'}’s subscription ended${org?.subscription ? ` on ${formatDate(org.subscription.endsAt)}` : ''}. Nothing has been deleted: everything opens again as soon as it’s renewed.`,
    ],
    open: ['', ''],
  }[org?.access ?? 'open'];
  const message = encodeURIComponent(`Hello, I'd like to renew ShepherdOS for ${org?.name ?? 'our church'}.`);
  return (
    <AuthShell title={copy[0]} subtitle={copy[1]}>
      {org?.access === 'locked' && contact ? (
        <View style={{ gap: space.md }}>
          {contact.whatsapp ? <Button title="WhatsApp the ShepherdOS team" icon="logo-whatsapp" onPress={() => void Linking.openURL(`https://wa.me/${contact.whatsapp!.replace(/\D/g, '')}?text=${message}`)} /> : null}
          {contact.phone ? <Button title="Call" icon="call-outline" variant="secondary" onPress={() => void Linking.openURL(`tel:${contact.phone}`)} /> : null}
          {contact.email ? <Button title="Email" icon="mail-outline" variant="secondary" onPress={() => void Linking.openURL(`mailto:${contact.email}?subject=${encodeURIComponent('Renew ShepherdOS')}&body=${message}`)} /> : null}
          {contact.hours ? (
            <Text size="small" tone="muted" style={{ textAlign: 'center' }}>
              {contact.hours}
            </Text>
          ) : null}
        </View>
      ) : null}
      <Button title="Check again" variant="ghost" icon="refresh" onPress={() => void refresh()} />
      {(me?.orgs.length ?? 0) > 1 ? <Text size="small" tone="muted" style={{ textAlign: 'center' }}>You can switch to another church from the website.</Text> : null}
      <Button title="Sign out" variant="ghost" onPress={() => void signOut()} />
    </AuthShell>
  );
}
