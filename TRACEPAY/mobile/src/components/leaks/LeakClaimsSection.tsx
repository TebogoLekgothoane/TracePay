import type { ReactNode } from "react";
import { Text, View } from "react-native";

import type { LeakClaims } from "../../features/leak-intelligence/leak-intelligence.types";

const EFFECT_NOTE: Record<LeakClaims["user_effect"], string | null> = {
  none: null,
  strengthens: "Your answer makes this more worth a look.",
  weakens: "Your answer makes this less likely to be a problem.",
  resolves: "Your answer settles this finding.",
};

/**
 * Three kinds of claim, kept apart: what the statements prove, what the user
 * said, and what is only possible, with what a statement cannot show.
 */
export function LeakClaimsSection({ claims }: { claims?: LeakClaims | null }) {
  if (!claims) return null;
  const { confirmed, reported, possible } = claims;
  if (!confirmed.length && !reported.length && !possible.length) return null;
  const effect = EFFECT_NOTE[claims.user_effect];

  return (
    <View className="mt-5 gap-4">
      {confirmed.length ? (
        <Block title="What your statements show">
          {confirmed.map((fact) => (
            <Text key={fact.text} className="text-[14px] leading-5 text-foreground">
              {fact.text}
            </Text>
          ))}
        </Block>
      ) : null}

      {reported.length ? (
        <Block title="What you told us">
          {reported.map((fact) => (
            <Text
              key={`${fact.question_kind}:${fact.answer}`}
              className="text-[14px] leading-5 text-foreground"
            >
              {fact.text}
            </Text>
          ))}
          {effect ? <Text className="text-[13px] text-muted-foreground">{effect}</Text> : null}
        </Block>
      ) : null}

      {possible.length ? (
        <Block title="What may be true">
          {possible.map((item) => (
            <View key={item.text} className="gap-1">
              <Text className="text-[14px] font-semibold leading-5 text-foreground">{item.text}</Text>
              {item.cannot_see.map((line) => (
                <Text key={line} className="text-[12px] leading-4 text-muted-foreground">
                  {"We can't see: "}
                  {line}
                </Text>
              ))}
              {item.check ? (
                <Text className="text-[12px] leading-4 text-muted-foreground">
                  To check: {item.check}
                </Text>
              ) : null}
            </View>
          ))}
        </Block>
      ) : null}
    </View>
  );
}

function Block({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View>
      <Text className="mb-1.5 text-[12px] font-semibold uppercase tracking-[0.7px] text-muted-foreground">
        {title}
      </Text>
      <View className="gap-1.5">{children}</View>
    </View>
  );
}
