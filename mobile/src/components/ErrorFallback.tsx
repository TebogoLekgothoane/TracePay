import { Feather } from "@expo/vector-icons";
import { reloadAppAsync } from "expo";
import React, { useState } from "react";
import {
  Modal,
  ScrollView,
  Text,
  View,
} from "react-native";

import { Button } from "@/components/Button";
import { useScreenInsets } from "@/hooks/useScreenInsets";

export type ErrorFallbackProps = {
  error: Error;
  resetError: () => void;
};

export function ErrorFallback({ error, resetError }: ErrorFallbackProps) {
  const { insets, contentPadding } = useScreenInsets("compact");

  const [isModalVisible, setIsModalVisible] = useState(false);

  const handleRestart = async () => {
    try {
      await reloadAppAsync();
    } catch (restartError) {
      console.error("Failed to restart app:", restartError);
      resetError();
    }
  };

  const formatErrorDetails = (): string => {
    let details = `Error: ${error.message}\n\n`;
    if (error.stack) {
      details += `Stack Trace:\n${error.stack}`;
    }
    return details;
  };

  return (
    <View className="screen w-full h-full justify-center items-center p-6">
      {__DEV__ ? (
        <View className="absolute right-4 z-10" style={{ top: insets.top + 16 }}>
          <Button
            variant="outline"
            size="icon"
            onPress={() => setIsModalVisible(true)}
            accessibilityLabel="View error details"
            className="w-11 h-11 rounded-lg bg-white"
          >
            <Feather name="alert-circle" size={20} color="#111827" />
          </Button>
        </View>
      ) : null}

      <View className="items-center justify-center gap-4 w-full max-w-[600px]">
        <Text className="heading-xl text-center leading-10">
          Something went wrong
        </Text>

        <Text className="text-base font-sans text-gray-500 text-center leading-6">
          Please reload the app to continue.
        </Text>

        <Button onPress={handleRestart} className="min-w-[200px]">
          Try Again
        </Button>
      </View>

      {__DEV__ ? (
        <Modal
          visible={isModalVisible}
          animationType="slide"
          transparent={true}
          onRequestClose={() => setIsModalVisible(false)}
        >
          <View className="flex-1 bg-black/50 justify-end">
            <View className="w-full h-[90%] rounded-t-2xl bg-white">
              <View className="flex-row justify-between items-center px-4 pt-4 pb-3 border-b border-border">
                <Text className="text-xl font-semibold text-gray-900">
                  Error Details
                </Text>
                <Button
                  variant="ghost"
                  size="icon"
                  onPress={() => setIsModalVisible(false)}
                  accessibilityLabel="Close error details"
                  className="w-11 h-11"
                >
                  <Feather name="x" size={24} color="#111827" />
                </Button>
              </View>

              <ScrollView
                className="flex-1"
                contentContainerClassName="p-4"
                contentContainerStyle={{ paddingBottom: contentPadding.paddingBottom }}
                showsVerticalScrollIndicator
              >
                <View className="w-full rounded-lg overflow-hidden p-4 bg-gray-50">
                  <Text className="text-xs leading-[18px] w-full text-gray-900 font-mono-error" selectable>
                    {formatErrorDetails()}
                  </Text>
                </View>
              </ScrollView>
            </View>
          </View>
        </Modal>
      ) : null}
    </View>
  );
}
