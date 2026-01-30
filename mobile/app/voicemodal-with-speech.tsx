/**
 * Voice modal with speech input. Only loaded when expo-speech-recognition native module is available (dev build).
 * In Expo Go this file is not loaded, so "native module not found" is avoided.
 */
import React, { useState, useEffect, useRef } from "react";
import {
  View,
  Pressable,
  TextInput,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Alert,
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
import {
  ExpoSpeechRecognitionModule,
  useSpeechRecognitionEvent,
} from "expo-speech-recognition";

import { ThemedView } from "@/components/themed-view";
import { ThemedText } from "@/components/themed-text";
import { useTheme } from "@/hooks/use-theme-color";
import { useApp } from "@/context/app-context";
import { Spacing, Colors } from "@/constants/theme";
import { voiceChat, type VoiceChatMessage } from "@/lib/backend-client";

type ChatEntry = { id: string; role: "user" | "assistant"; content: string };

export default function VoiceModalWithSpeech() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { theme, isDark } = useTheme();
  const { t, language, analysisData } = useApp();

  const [messages, setMessages] = useState<ChatEntry[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [listeningTranscript, setListeningTranscript] = useState("");
  const [error, setError] = useState<string | null>(null);
  const flatListRef = useRef<FlatList>(null);
  const lastFinalTranscriptRef = useRef("");
  const sendMessageWithTextRef = useRef<(text: string) => void>(() => {});
  const messagesRef = useRef<ChatEntry[]>([]);
  messagesRef.current = messages;

  const waveScale1 = useSharedValue(1);
  const waveScale2 = useSharedValue(1);
  const waveScale3 = useSharedValue(1);

  const summaryContext =
    analysisData?.summary[language as "en" | "xh"] || analysisData?.summary.en || "";
  const speechLang = language === "xh" ? "xh-ZA" : "en-ZA";

  useSpeechRecognitionEvent("result", (event) => {
    const transcript = (event.results?.map((r) => r.transcript).join(" ") ?? "").trim();
    if (event.isFinal && transcript) {
      lastFinalTranscriptRef.current = transcript;
      setInput((prev) => (prev ? `${prev} ${transcript}` : transcript));
      setListeningTranscript("");
    } else {
      setListeningTranscript(transcript);
    }
  });
  useSpeechRecognitionEvent("end", () => {
    setIsListening(false);
    setListeningTranscript("");
    const finalText = lastFinalTranscriptRef.current.trim();
    lastFinalTranscriptRef.current = "";
    if (finalText) {
      sendMessageWithTextRef.current?.(finalText);
    }
  });
  useSpeechRecognitionEvent("error", (event) => {
    setIsListening(false);
    setListeningTranscript("");
    if (event.error !== "aborted" && event.error !== "no-speech") {
      Alert.alert(
        "Speech recognition",
        event.message || "Could not recognize speech. Try again or type instead."
      );
    }
  });

  useEffect(() => {
    return () => {
      Speech.stop();
      try {
        ExpoSpeechRecognitionModule.stop();
      } catch (_) {}
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
  const langCode = language === "xh" ? "xh-ZA" : "en-ZA";

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

  const sendMessageWithText = async (text: string) => {
    if (!text.trim() || isLoading) return;
    setInput("");
    setError(null);
    const userEntry: ChatEntry = {
      id: `user-${Date.now()}`,
      role: "user",
      content: text.trim(),
    };
    setMessages((prev) => [...prev, userEntry]);
    setIsLoading(true);
    const currentMessages = messagesRef.current;
    const chatHistory: VoiceChatMessage[] = [
      ...currentMessages.map((m) => ({ role: m.role, content: m.content })),
      { role: "user", content: text.trim() },
    ];
    try {
      const res = await voiceChat({
        messages: chatHistory,
        language: language === "xh" ? "xh" : "en",
        summary_context: summaryContext || undefined,
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
      setError(msg);
      setMessages((prev) => [
        ...prev,
        {
          id: `error-${Date.now()}`,
          role: "assistant",
          content: msg,
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };
  sendMessageWithTextRef.current = sendMessageWithText;

  const sendMessage = async () => {
    const text = input.trim();
    if (!text || isLoading) return;
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setInput("");
    await sendMessageWithText(text);
  };

  const handlePlayLastReply = () => {
    const last = [...messages].reverse().find((m) => m.role === "assistant");
    if (last) speak(last.content);
  };

  const toggleListening = async () => {
    if (isListening) {
      try {
        ExpoSpeechRecognitionModule.stop();
      } catch (_) {}
      return;
    }
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      const { granted } = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
      if (!granted) {
        Alert.alert("Microphone", "Allow microphone access to speak your question.");
        return;
      }
      lastFinalTranscriptRef.current = "";
      ExpoSpeechRecognitionModule.start({
        lang: speechLang,
        interimResults: true,
        maxAlternatives: 1,
      });
      setIsListening(true);
    } catch (e) {
      Alert.alert("Speech", "Could not start listening. Try typing instead.");
    }
  };

  const handleClose = () => {
    Speech.stop();
    try {
      ExpoSpeechRecognitionModule.stop();
    } catch (_) {}
    router.back();
  };

  const renderMessage = ({ item }: { item: ChatEntry }) => {
    const isUser = item.role === "user";
    return (
      <Animated.View
        entering={FadeInUp.duration(200)}
        className={`mb-3 ${isUser ? "items-end" : "items-start"}`}
      >
        <View
          className="max-w-[85%] rounded-2xl px-4 py-3"
          style={{
            backgroundColor: isUser
              ? isDark
                ? Colors.dark.alarmRed
                : Colors.light.alarmRed
              : isDark
                ? "rgba(255,255,255,0.12)"
                : "rgba(0,0,0,0.08)",
          }}
        >
          <ThemedText
            type="body"
            className="leading-[22px]"
            style={{ color: isUser ? "#fff" : theme.text }}
          >
            {item.content}
          </ThemedText>
          {!isUser && item.content && (
            <Pressable
              onPress={() => speak(item.content)}
              className="mt-2 flex-row items-center gap-1 active:opacity-70"
            >
              <Feather name="volume-2" size={14} color={theme.textSecondary} />
              <ThemedText type="small" style={{ color: theme.textSecondary, fontSize: 12 }}>
                Play
              </ThemedText>
            </Pressable>
          )}
        </View>
      </Animated.View>
    );
  };

  return (
    <ThemedView className="flex-1">
      <View
        className="flex-row justify-between items-center px-4 py-4 border-b border-gray-200/10"
        style={{ paddingTop: insets.top + Spacing.sm }}
      >
        <ThemedText type="h3" className="text-text flex-1">
          {t("voiceExplanation")}
        </ThemedText>
        <Pressable
          onPress={handleClose}
          className="p-1 active:opacity-60"
          testID="button-close-voice"
        >
          <Feather name="x" size={24} color={theme.text} />
        </Pressable>
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={0}
      >
        <View className="flex-1 px-4 pt-4">
          <Animated.View entering={FadeIn.delay(100)} className="mb-4 flex-row items-center gap-3">
            <Image
              source={require("../assets/images/voice-avatar.png")}
              className="w-[48px] h-[48px]"
              contentFit="contain"
            />
            <View className="flex-1">
              <ThemedText type="body" className="text-text">
                Ask about your spending or analysis. I’ll reply and read it out.
              </ThemedText>
            </View>
          </Animated.View>

          {messages.length === 0 && (
            <Animated.View entering={FadeInUp.delay(200)} className="py-4">
              <ThemedText type="body" style={{ color: theme.textSecondary }}>
                Type or tap the mic to speak. Your analysis summary is shared with the assistant.
              </ThemedText>
            </Animated.View>
          )}

          <FlatList
            ref={flatListRef}
            data={messages}
            keyExtractor={(item) => item.id}
            renderItem={renderMessage}
            onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: true })}
            onLayout={() => flatListRef.current?.scrollToEnd({ animated: false })}
            contentContainerStyle={{ paddingBottom: Spacing.lg, flexGrow: 1 }}
            ListFooterComponent={
              isLoading ? (
                <View className="mb-3 flex-row items-center gap-2 py-2">
                  <View
                    className="h-2 w-2 rounded-full opacity-70"
                    style={{ backgroundColor: theme.textSecondary }}
                  />
                  <ThemedText type="small" style={{ color: theme.textSecondary }}>
                    Thinking…
                  </ThemedText>
                </View>
              ) : null
            }
          />
        </View>

        {messages.some((m) => m.role === "assistant") && (
          <View className="px-4 pb-2 flex-row justify-center">
            <Pressable
              onPress={handlePlayLastReply}
              disabled={isPlaying}
              className="flex-row items-center gap-2 py-2 px-3 rounded-full active:opacity-70"
              style={{
                backgroundColor: isDark ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.06)",
              }}
            >
              <View className="flex-row items-center gap-1 h-6">
                <Animated.View
                  className="w-1 h-4 rounded"
                  style={[
                    { backgroundColor: isDark ? Colors.dark.alarmRed : Colors.light.alarmRed },
                    wave1Style,
                  ]}
                />
                <Animated.View
                  className="w-1 h-5 rounded"
                  style={[
                    { backgroundColor: isDark ? Colors.dark.alarmRed : Colors.light.alarmRed },
                    wave2Style,
                  ]}
                />
                <Animated.View
                  className="w-1 h-4 rounded"
                  style={[
                    { backgroundColor: isDark ? Colors.dark.alarmRed : Colors.light.alarmRed },
                    wave3Style,
                  ]}
                />
              </View>
              <ThemedText type="small" style={{ color: theme.textSecondary }}>
                {isPlaying ? "Speaking…" : "Play last reply"}
              </ThemedText>
            </Pressable>
          </View>
        )}

        <View
          className="flex-row items-end gap-2 px-4 pb-4 pt-2 border-t border-gray-200/10"
          style={{ paddingBottom: insets.bottom + Spacing.md }}
        >
          <TextInput
            value={isListening ? listeningTranscript : input}
            onChangeText={setInput}
            placeholder={isListening ? "Listening…" : "Ask anything…"}
            placeholderTextColor={theme.textSecondary}
            multiline
            maxLength={500}
            editable={!isLoading && !isListening}
            onSubmitEditing={sendMessage}
            returnKeyType="send"
            className="flex-1 rounded-xl px-4 py-3 text-base min-h-[44px] max-h-[100px]"
            style={{
              backgroundColor: isDark ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.06)",
              color: theme.text,
            }}
          />
          <Pressable
            onPress={toggleListening}
            className="rounded-xl p-3 min-h-[44px] justify-center active:opacity-70"
            style={{
              backgroundColor: isListening
                ? isDark
                  ? Colors.dark.alarmRed
                  : Colors.light.alarmRed
                : isDark
                  ? "rgba(255,255,255,0.15)"
                  : "rgba(0,0,0,0.1)",
            }}
            testID="button-mic-voice"
          >
            <Feather
              name="mic"
              size={20}
              color={isListening ? "#fff" : theme.textSecondary}
            />
          </Pressable>
          <Pressable
            onPress={sendMessage}
            disabled={!input.trim() || isLoading || isListening}
            className="rounded-xl p-3 min-h-[44px] justify-center active:opacity-70"
            style={{
              backgroundColor:
                input.trim() && !isLoading && !isListening
                  ? isDark
                    ? Colors.dark.alarmRed
                    : Colors.light.alarmRed
                  : isDark
                    ? "rgba(255,255,255,0.15)"
                    : "rgba(0,0,0,0.1)",
            }}
            testID="button-send-voice"
          >
            <Feather
              name="send"
              size={20}
              color={input.trim() && !isLoading && !isListening ? "#fff" : theme.textSecondary}
            />
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </ThemedView>
  );
}
