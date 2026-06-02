/**
 * Voice modal: type-only chat (no native speech recognition / mic input).
 */
import React, { useState, useEffect, useRef, useMemo } from "react";
import {
  View,
  Pressable,
  TextInput,
  FlatList,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import Animated, {
  FadeIn,
  FadeInUp,
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withSequence,
  withTiming,
  Easing,
} from "react-native-reanimated";
import * as Speech from "expo-speech";
import * as Haptics from "expo-haptics";
import { Image } from "expo-image";

import { ThemedView } from "@/components/themed-view";
import { ThemedText } from "@/components/themed-text";
import { useTheme } from "@/hooks/use-theme-color";
import { useApp } from "@/context/app-context";
import { Spacing, BorderRadius } from "@/constants/theme";
import { voiceChat, type VoiceChatMessage } from "@/lib/backend-client";
import { mockAnalysisDataWithMomo } from "@/data/mock-analysis";

type ChatEntry = { id: string; role: "user" | "assistant"; content: string };

function VoiceModalTypeOnly() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { theme, isDark } = useTheme();
  const { t, language, analysisData } = useApp();

  const [messages, setMessages] = useState<ChatEntry[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const flatListRef = useRef<FlatList>(null);
  const messagesRef = useRef<ChatEntry[]>([]);
  messagesRef.current = messages;

  const waveScale1 = useSharedValue(1);
  const waveScale2 = useSharedValue(1);
  const waveScale3 = useSharedValue(1);

  /** Rich context from analysis or mock data so the assistant only uses real numbers and leaks */
  const voiceContext = useMemo(() => {
    const data = analysisData ?? mockAnalysisDataWithMomo;
    const total = data?.totalLoss ?? 0;
    const categories = [...(data?.categories ?? [])].sort((a, b) => b.amount - a.amount);
    const summary =
      data?.summary?.[language as "en" | "xh"] || data?.summary?.en || "";
    const leakList = categories
      .map((c) => `${c.name} R${c.amount.toLocaleString()}`)
      .join(", ");
    const biggest = categories[0];
    const lines: string[] = [];
    lines.push(`Total lost this month: R ${total.toLocaleString()}.`);
    if (leakList) lines.push(`Leak breakdown: ${leakList}.`);
    if (biggest) lines.push(`Biggest leak: ${biggest.name}, R ${biggest.amount.toLocaleString()}.`);
    if (data?.momoData && data.momoData.potentialSavings > 0) {
      lines.push(
        `Potential savings on airtime and data (switch to monthly bundles): R ${data.momoData.potentialSavings.toLocaleString()}.`
      );
    }
    if (summary) lines.push(`Summary: ${summary}`);
    return lines.join(" ");
  }, [analysisData, language]);

  const langCode = language === "xh" ? "xh-ZA" : "en-ZA";

  useEffect(() => {
    return () => {
      void Speech.stop();
    };
  }, []);

  useEffect(() => {
    if (isPlaying) {
      waveScale1.value = withRepeat(
        withSequence(
          withTiming(1.3, { duration: 300, easing: Easing.inOut(Easing.ease) }),
          withTiming(1, { duration: 300, easing: Easing.inOut(Easing.ease) })
        ),
        -1,
        false
      );
      waveScale2.value = withRepeat(
        withSequence(
          withTiming(1.5, { duration: 400, easing: Easing.inOut(Easing.ease) }),
          withTiming(1, { duration: 400, easing: Easing.inOut(Easing.ease) })
        ),
        -1,
        false
      );
      waveScale3.value = withRepeat(
        withSequence(
          withTiming(1.4, { duration: 350, easing: Easing.inOut(Easing.ease) }),
          withTiming(1, { duration: 350, easing: Easing.inOut(Easing.ease) })
        ),
        -1,
        false
      );
    } else {
      waveScale1.value = withTiming(1, { duration: 200 });
      waveScale2.value = withTiming(1, { duration: 200 });
      waveScale3.value = withTiming(1, { duration: 200 });
    }
  }, [isPlaying]);

  const wave1Style = useAnimatedStyle(() => ({ transform: [{ scaleY: waveScale1.value }] }));
  const wave2Style = useAnimatedStyle(() => ({ transform: [{ scaleY: waveScale2.value }] }));
  const wave3Style = useAnimatedStyle(() => ({ transform: [{ scaleY: waveScale3.value }] }));

  const speak = (text: string) => {
    if (isPlaying) Speech.stop();
    if (!text.trim()) return;
    setIsPlaying(true);
    Speech.speak(text, {
      language: langCode,
      rate: 0.9,
      onStart: () => setIsPlaying(true),
      onDone: () => setIsPlaying(false),
      onStopped: () => setIsPlaying(false),
      onError: () => setIsPlaying(false),
    });
  };

  const sendMessage = async () => {
    const text = input.trim();
    if (!text || isLoading) return;

    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setInput("");

    const userEntry: ChatEntry = { id: `user-${Date.now()}`, role: "user", content: text };
    setMessages((prev) => [...prev, userEntry]);

    setIsLoading(true);
    const currentMessages = messagesRef.current;
    const chatHistory: VoiceChatMessage[] = [
      ...currentMessages.map((m) => ({ role: m.role, content: m.content })),
      { role: "user", content: text },
    ];
    try {
      const res = await voiceChat({
        messages: chatHistory,
        language: language === "xh" ? "xh" : "en",
        summary_context: voiceContext,
      });
      const assistantEntry: ChatEntry = {
        id: `assistant-${Date.now()}`,
        role: "assistant",
        content: res.message,
      };
      setMessages((prev) => [...prev, assistantEntry]);
      speak(res.message);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Something went wrong";
      setMessages((prev) => [
        ...prev,
        { id: `error-${Date.now()}`, role: "assistant", content: msg },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const handlePlayLastReply = () => {
    const last = [...messages].reverse().find((m) => m.role === "assistant");
    if (last) speak(last.content);
  };

  const handleClose = () => {
    Speech.stop();
    router.back();
  };

  const renderMessage = ({ item }: { item: ChatEntry }) => {
    const isUser = item.role === "user";
    return (
      <Animated.View
        entering={FadeInUp.duration(200)}
        style={{
          flexDirection: "row",
          marginBottom: Spacing.lg,
          justifyContent: isUser ? "flex-end" : "flex-start",
          paddingHorizontal: Spacing.md,
        }}
      >
        {!isUser && (
          <View
            style={{
              width: 32,
              height: 32,
              borderRadius: 16,
              backgroundColor: purpleTintStrong,
              marginRight: Spacing.sm,
              overflow: "hidden",
              alignSelf: "flex-end",
            }}
          >
            <Image
              source={require("../assets/images/voice-avatar.png")}
              style={{ width: 32, height: 32 }}
              contentFit="cover"
            />
          </View>
        )}
        <View
          style={{
            maxWidth: "80%",
            borderRadius: BorderRadius.lg,
            paddingHorizontal: Spacing.lg,
            paddingVertical: Spacing.md,
            backgroundColor: isUser
              ? purple
              : purpleTintStrong,
            borderTopLeftRadius: isUser ? BorderRadius.lg : 4,
            borderTopRightRadius: isUser ? 4 : BorderRadius.lg,
          }}
        >
          <ThemedText
            type="body"
            style={{
              color: isUser ? theme.buttonText : theme.text,
              lineHeight: 22,
            }}
          >
            {item.content}
          </ThemedText>
          {!isUser && item.content && (
            <Pressable
              onPress={() => speak(item.content)}
              style={{
                marginTop: Spacing.sm,
                flexDirection: "row",
                alignItems: "center",
                gap: 4,
              }}
            >
              <Feather name="volume-2" size={14} color={purple} />
              <ThemedText type="small" style={{ color: purple, fontSize: 12 }}>
                Play
              </ThemedText>
            </Pressable>
          )}
        </View>
      </Animated.View>
    );
  };

  // Purple accent (#6D28D9) tints for a cohesive, colorful UI
  const purple = isDark ? "rgba(139, 92, 246, 0.95)" : "#6D28D9";
  const purpleTintLight = isDark ? "rgba(139, 92, 246, 0.2)" : "rgba(109, 40, 217, 0.1)";
  const purpleTintStrong = isDark ? "rgba(139, 92, 246, 0.28)" : "rgba(109, 40, 217, 0.16)";
  const purpleTintBorder = isDark ? "rgba(139, 92, 246, 0.4)" : "rgba(109, 40, 217, 0.35)";
  const inputBg = isDark ? "rgba(139, 92, 246, 0.12)" : "rgba(109, 40, 217, 0.06)";
  const inputBorder = purpleTintBorder;
  const sendActive = purple;
  const sendDisabled = isDark ? "rgba(139, 92, 246, 0.35)" : "rgba(109, 40, 217, 0.35)";

  return (
    <ThemedView style={{ flex: 1 }}>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          paddingHorizontal: Spacing.lg,
          paddingTop: insets.top + Spacing.sm,
          paddingBottom: Spacing.md,
          borderBottomWidth: 2,
          borderBottomColor: purpleTintBorder,
          backgroundColor: purpleTintLight,
        }}
      >
        <View style={{ width: 32 }} />
        <ThemedText type="h3" style={{ color: theme.text, fontWeight: "600" }}>
          {t("voiceExplanation")}
        </ThemedText>
        <Pressable
          onPress={handleClose}
          style={{ padding: Spacing.sm }}
          testID="button-close-voice"
        >
          <Feather name="x" size={22} color={theme.text} />
        </Pressable>
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1, backgroundColor: theme.backgroundDefault }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={0}
      >
        <View style={{ flex: 1, paddingTop: Spacing.md, backgroundColor: theme.backgroundDefault }}>
          {messages.length === 0 && (
            <Animated.View
              entering={FadeIn.delay(100)}
              style={{
                flexDirection: "row",
                paddingHorizontal: Spacing.md,
                marginBottom: Spacing.lg,
              }}
            >
              <View
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 16,
                  backgroundColor: purpleTintStrong,
                  marginRight: Spacing.sm,
                  overflow: "hidden",
                }}
              >
                <Image
                  source={require("../assets/images/voice-avatar.png")}
                  style={{ width: 32, height: 32 }}
                  contentFit="cover"
                />
              </View>
              <View
                style={{
                  flex: 1,
                  borderRadius: BorderRadius.lg,
                  borderTopLeftRadius: 4,
                  paddingHorizontal: Spacing.lg,
                  paddingVertical: Spacing.md,
                  backgroundColor: purpleTintStrong,
                  borderWidth: 1,
                  borderColor: purpleTintBorder,
                }}
              >
                <ThemedText type="body" style={{ color: theme.text, marginBottom: Spacing.xs }}>
                  Ask about your spending or analysis. I’ll reply and read it out.
                </ThemedText>
                <ThemedText type="small" style={{ color: theme.textSecondary }}>
                  Try: "What’s my biggest leak?" or "Summarise my spending". I use your real autopsy data so answers match your numbers.
                </ThemedText>
              </View>
            </Animated.View>
          )}

          <FlatList
            ref={flatListRef}
            data={messages}
            keyExtractor={(item) => item.id}
            renderItem={renderMessage}
            onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: true })}
            onLayout={() => flatListRef.current?.scrollToEnd({ animated: false })}
            contentContainerStyle={{
              paddingBottom: Spacing.xl,
              flexGrow: 1,
            }}
            ListFooterComponent={
              isLoading ? (
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    paddingHorizontal: Spacing.md,
                    marginBottom: Spacing.lg,
                  }}
                >
                  <View
                    style={{
                      width: 32,
                      height: 32,
                      borderRadius: 16,
                      backgroundColor: purpleTintStrong,
                      marginRight: Spacing.sm,
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <Image
                      source={require("../assets/images/voice-avatar.png")}
                      style={{ width: 28, height: 28 }}
                      contentFit="cover"
                    />
                  </View>
                  <View
                    style={{
                      borderRadius: BorderRadius.lg,
                      borderTopLeftRadius: 4,
                      paddingHorizontal: Spacing.lg,
                      paddingVertical: Spacing.md,
                      backgroundColor: purpleTintStrong,
                      borderWidth: 1,
                      borderColor: purpleTintBorder,
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 6,
                    }}
                  >
                    <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: purple, opacity: 0.8 }} />
                    <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: purple, opacity: 0.8 }} />
                    <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: purple, opacity: 0.8 }} />
                  </View>
                </View>
              ) : null
            }
          />
        </View>

        {messages.some((m) => m.role === "assistant") && (
          <View
            style={{
              paddingHorizontal: Spacing.lg,
              paddingBottom: Spacing.sm,
              flexDirection: "row",
              justifyContent: "center",
            }}
          >
            <Pressable
              onPress={handlePlayLastReply}
              disabled={isPlaying}
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: Spacing.sm,
                paddingVertical: Spacing.sm,
                paddingHorizontal: Spacing.lg,
                borderRadius: BorderRadius.full,
                backgroundColor: purpleTintStrong,
                borderWidth: 1,
                borderColor: purpleTintBorder,
              }}
            >
              <View style={{ flexDirection: "row", alignItems: "center", height: 24, gap: 3 }}>
                <Animated.View
                  style={[
                    {
                      width: 4,
                      height: 14,
                      borderRadius: 2,
                      backgroundColor: purple,
                    },
                    wave1Style,
                  ]}
                />
                <Animated.View
                  style={[
                    {
                      width: 4,
                      height: 18,
                      borderRadius: 2,
                      backgroundColor: purple,
                    },
                    wave2Style,
                  ]}
                />
                <Animated.View
                  style={[
                    {
                      width: 4,
                      height: 14,
                      borderRadius: 2,
                      backgroundColor: purple,
                    },
                    wave3Style,
                  ]}
                />
              </View>
              <ThemedText type="small" style={{ color: purple, fontWeight: "500" }}>
                {isPlaying ? "Speaking…" : "Play last reply"}
              </ThemedText>
            </Pressable>
          </View>
        )}

        <View
          style={{
            flexDirection: "row",
            alignItems: "flex-end",
            gap: Spacing.sm,
            paddingHorizontal: Spacing.lg,
            paddingTop: Spacing.md,
            paddingBottom: insets.bottom + Spacing.lg,
            borderTopWidth: 2,
            borderTopColor: purpleTintBorder,
            backgroundColor: purpleTintLight,
          }}
        >
          <TextInput
            value={input}
            onChangeText={setInput}
            placeholder="Message TracePay…"
            placeholderTextColor={theme.textSecondary}
            multiline
            maxLength={500}
            editable={!isLoading}
            onSubmitEditing={sendMessage}
            returnKeyType="send"
            style={{
              flex: 1,
              borderRadius: BorderRadius.lg,
              paddingHorizontal: Spacing.lg,
              paddingVertical: Spacing.md,
              fontSize: 16,
              minHeight: 44,
              maxHeight: 100,
              backgroundColor: inputBg,
              borderWidth: 2,
              borderColor: inputBorder,
              color: theme.text,
            }}
          />
          <Pressable
            onPress={sendMessage}
            disabled={!input.trim() || isLoading}
            style={{
              width: 44,
              height: 44,
              borderRadius: BorderRadius.sm,
              backgroundColor: input.trim() && !isLoading ? sendActive : sendDisabled,
              alignItems: "center",
              justifyContent: "center",
            }}
            testID="button-send-voice"
          >
            <Feather
              name="send"
              size={20}
              color={input.trim() && !isLoading ? theme.buttonText : purple}
            />
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </ThemedView>
  );
}

export default function VoiceModalScreen() {
  return <VoiceModalTypeOnly />;
}
