import { Linking, View } from 'react-native';
import { useMemo } from 'react';
import { parseMini, linkTarget, type Span } from '@/lib/mini-markdown';
import { getServer } from '@/lib/secure';
import { space, useTheme } from '@/theme';
import { Text } from './ui';

/** An AI answer: paragraphs, lists, bold, and links that open the guide on the website. */
function Spans({ spans }: { spans: Span[] }) {
  const { colors } = useTheme();
  return spans.map((s, i) => {
    const target = s.href ? linkTarget(s.href, getServer()) : null;
    return (
      <Text
        key={i}
        weight={s.bold ? '700' : undefined}
        style={target ? { color: colors.primary, textDecorationLine: 'underline' } : undefined}
        onPress={target ? () => void Linking.openURL(target) : undefined}
        accessibilityRole={target ? 'link' : undefined}
      >
        {s.text}
      </Text>
    );
  });
}

export function AiText({ text }: { text: string }) {
  const blocks = useMemo(() => parseMini(text), [text]);
  return (
    <View style={{ gap: space.sm }}>
      {blocks.map((b, i) =>
        b.type === 'paragraph' ? (
          <Text key={i}>
            <Spans spans={b.spans} />
          </Text>
        ) : (
          <View key={i} style={{ gap: space.xs }}>
            {b.items.map((item, j) => (
              <View key={j} style={{ flexDirection: 'row', gap: space.sm, paddingRight: space.sm }}>
                <Text tone="muted" style={{ minWidth: 18 }}>
                  {b.ordered ? `${j + 1}.` : '•'}
                </Text>
                <Text style={{ flex: 1 }}>
                  <Spans spans={item} />
                </Text>
              </View>
            ))}
          </View>
        ),
      )}
    </View>
  );
}
