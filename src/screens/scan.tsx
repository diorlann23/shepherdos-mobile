import { useRef, useState } from 'react';
import { Linking, StyleSheet, View } from 'react-native';
import { Stack } from 'expo-router';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { Button, EmptyState, Text } from '@/components/ui';
import { scanCard, type ScanResult, type Service } from '@/lib/attendance';
import { radius, space, useTheme } from '@/theme';

/** Point the camera at member cards one after another; each is checked in as it's read. */
export function ScanScreen({ service }: { service: Service }) {
  const { colors } = useTheme();
  const [permission, requestPermission] = useCameraPermissions();
  const [last, setLast] = useState<ScanResult | null>(null);
  const [count, setCount] = useState(0);
  const busy = useRef(false);
  const recent = useRef(new Map<string, number>());

  const onScan = async ({ data }: { data: string }) => {
    // The camera reads the same card many times a second: handle each card once every few seconds.
    const now = Date.now();
    if (busy.current || (recent.current.get(data) ?? 0) > now - 4000) return;
    busy.current = true;
    recent.current.set(data, now);
    try {
      const result = await scanCard(service.id, data);
      setLast(result);
      if (result.kind === 'checked-in') {
        if (!result.already) setCount((c) => c + 1);
        void Haptics.notificationAsync(result.already ? Haptics.NotificationFeedbackType.Warning : Haptics.NotificationFeedbackType.Success);
      } else {
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      }
    } finally {
      busy.current = false;
    }
  };

  if (!permission) return null;
  if (!permission.granted) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', padding: space.xl }}>
        <Stack.Screen options={{ title: 'Scan cards' }} />
        <EmptyState icon="camera-outline" title="Camera needed" text="ShepherdOS uses the camera only to read members’ QR cards. Nothing is recorded or kept.">
          <Button
            title={permission.canAskAgain ? 'Allow camera' : 'Open Settings to allow the camera'}
            onPress={() => void (permission.canAskAgain ? requestPermission() : Linking.openSettings())}
          />
        </EmptyState>
      </View>
    );
  }

  const tone =
    last?.kind === 'error'
      ? { bg: colors.dangerSoft, fg: colors.danger, icon: 'close-circle' as const }
      : last?.kind === 'checked-in' && last.already
        ? { bg: colors.warningSoft, fg: colors.warning, icon: 'information-circle' as const }
        : { bg: colors.successSoft, fg: colors.success, icon: 'checkmark-circle' as const };

  return (
    <View style={{ flex: 1, backgroundColor: '#000' }}>
      <Stack.Screen options={{ title: `Scan cards · ${count}` }} />
      <CameraView style={StyleSheet.absoluteFill} facing="back" barcodeScannerSettings={{ barcodeTypes: ['qr'] }} onBarcodeScanned={(r) => void onScan(r)} />
      <View pointerEvents="none" style={styles.frameWrap}>
        <View style={styles.frame} />
        <Text style={{ color: '#fff', marginTop: space.lg }}>Hold a member card inside the square</Text>
      </View>
      {last ? (
        <View style={[styles.result, { backgroundColor: tone.bg }]}>
          <Ionicons name={tone.icon} size={28} color={tone.fg} />
          <View style={{ flex: 1 }}>
            {last.kind === 'checked-in' ? (
              <>
                <Text weight="700" style={{ color: tone.fg }}>
                  {last.name}
                </Text>
                <Text size="small" style={{ color: tone.fg }}>
                  {last.already ? 'Already checked in' : last.verified ? 'Checked in' : 'Checked in on this phone · card checked when online'}
                </Text>
              </>
            ) : (
              <Text weight="600" style={{ color: tone.fg }}>
                {last.message}
              </Text>
            )}
          </View>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  frameWrap: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, alignItems: 'center', justifyContent: 'center' },
  frame: { width: 240, height: 240, borderRadius: radius.lg, borderWidth: 3, borderColor: '#fff' },
  result: { position: 'absolute', left: space.lg, right: space.lg, bottom: space.xxl, borderRadius: radius.lg, padding: space.lg, flexDirection: 'row', gap: space.md, alignItems: 'center' },
});
