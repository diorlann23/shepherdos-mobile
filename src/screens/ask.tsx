import { useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { IconTile, Text } from '@/components/ui';
import { AiText } from '@/components/ai-text';
import { askGuide, type GuideTurn } from '@/lib/ai';
import { OfflineError, errorMessage } from '@/lib/api';
import { radius, space, useTheme } from '@/theme';

const SUGGESTIONS = ['How do I check people in with the phone?', 'How do I count the offering?', 'What works without internet?'];

interface Turn extends GuideTurn {
  error?: string;
  pending?: boolean;
}

/**
 * "Ask a question": answers written by AI from the ShepherdOS user guide, in
 * the person's own words and language. Only the question is sent, never the
 * church's records. Needs a connection.
 */
export function Ask() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [turns, setTurns] = useState<Turn[]>([]);
  const [question, setQuestion] = useState('');
  const scroll = useRef<React.ComponentRef<typeof ScrollView>>(null);
  const busy = turns.some((t) => t.pending);

  const ask = async (q: string) => {
    const text = q.trim();
    if (text.length < 3 || busy) return;
    const history = turns.filter((t) => !t.pending && !t.error).map(({ question: qq, answer }) => ({ question: qq, answer }));
    setTurns((all) => [...all, { question: text, answer: '', pending: true }]);
    setQuestion('');
    const finish = (patch: Partial<Turn>) => setTurns((all) => all.map((t, i) => (i === all.length - 1 ? { ...t, ...patch, pending: false } : t)));
    try {
      const res = await askGuide(text, history);
      finish({ answer: res.text });
    } catch (e) {
      finish({ error: e instanceof OfflineError ? 'You’re offline. Connect to the internet to ask a question.' : errorMessage(e) });
    }
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0} style={{ flex: 1 }}>
      <ScrollView ref={scroll} contentContainerStyle={styles.wrap} onContentSizeChange={() => scroll.current?.scrollToEnd({ animated: true })} keyboardShouldPersistTaps="handled">
        {turns.length === 0 ? (
          <View style={{ gap: space.lg }}>
            <View style={{ alignItems: 'center', gap: space.md, paddingVertical: space.lg }}>
              <IconTile icon="sparkles" tone="accent" size={56} />
              <Text size="heading" style={{ textAlign: 'center' }}>
                Ask a question
              </Text>
              <Text tone="muted" style={{ textAlign: 'center' }}>
                Ask how to do something in ShepherdOS, in your own words: English, Twi, Ewe or Hausa. Answers come from the user guide.
              </Text>
            </View>
            {SUGGESTIONS.map((s) => (
              <Pressable key={s} accessibilityRole="button" onPress={() => void ask(s)} style={({ pressed }) => [styles.suggestion, { borderColor: colors.border, backgroundColor: pressed ? colors.muted : colors.card }]}>
                <Ionicons name="chatbubble-ellipses-outline" size={18} color={colors.primary} />
                <Text style={{ flex: 1 }}>{s}</Text>
              </Pressable>
            ))}
          </View>
        ) : (
          turns.map((t, i) => (
            <View key={i} style={{ gap: space.sm }}>
              <View style={[styles.mine, { backgroundColor: colors.primary }]}>
                <Text style={{ color: colors.onPrimary }}>{t.question}</Text>
              </View>
              <View style={[styles.theirs, { backgroundColor: colors.card, borderColor: colors.border }]}>
                {t.pending ? (
                  <Text tone="muted">Reading the guide…</Text>
                ) : t.error ? (
                  <Text tone="danger">{t.error}</Text>
                ) : (
                  <AiText text={t.answer} />
                )}
              </View>
            </View>
          ))
        )}
        <Text size="tiny" tone="muted" style={{ textAlign: 'center', marginTop: space.md }}>
          Written by AI from the user guide, so check important steps. Don’t include personal details.
        </Text>
      </ScrollView>
      <View style={[styles.bar, { borderTopColor: colors.border, backgroundColor: colors.card, paddingBottom: Math.max(insets.bottom, space.sm) }]}>
        <TextInput
          value={question}
          onChangeText={setQuestion}
          placeholder={turns.length ? 'Ask a follow-up…' : 'How do I…?'}
          placeholderTextColor={colors.textMuted}
          multiline
          maxLength={1000}
          accessibilityLabel="Your question"
          style={[styles.input, { color: colors.text, backgroundColor: colors.muted }]}
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Ask"
          disabled={busy || question.trim().length < 3}
          onPress={() => void ask(question)}
          style={[styles.send, { backgroundColor: colors.primary, opacity: busy || question.trim().length < 3 ? 0.4 : 1 }]}
        >
          <Ionicons name="arrow-up" size={22} color={colors.onPrimary} />
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  wrap: { padding: space.lg, gap: space.lg, paddingBottom: space.xl },
  suggestion: { flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.md, borderRadius: radius.md, borderWidth: StyleSheet.hairlineWidth },
  mine: { alignSelf: 'flex-end', maxWidth: '85%', borderRadius: radius.lg, borderBottomRightRadius: 6, paddingHorizontal: space.md, paddingVertical: space.sm },
  theirs: { alignSelf: 'stretch', borderRadius: radius.lg, borderBottomLeftRadius: 6, borderWidth: StyleSheet.hairlineWidth, padding: space.md },
  bar: { flexDirection: 'row', alignItems: 'flex-end', gap: space.sm, paddingHorizontal: space.md, paddingTop: space.sm, borderTopWidth: StyleSheet.hairlineWidth },
  input: { flex: 1, minHeight: 44, maxHeight: 120, borderRadius: radius.md, paddingHorizontal: space.md, paddingTop: 11, paddingBottom: 11, fontSize: 16 },
  send: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
});
