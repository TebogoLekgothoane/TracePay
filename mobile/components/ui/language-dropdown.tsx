import React, { useState } from "react";
import { View, StyleSheet, Pressable, Modal, FlatList } from "react-native";
import { Feather } from "@expo/vector-icons";
import Animated, { FadeInDown } from "react-native-reanimated";
import * as Haptics from "expo-haptics";

import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { Language } from "@/types/navigation";
import { Spacing, BorderRadius } from "@/constants/theme";

interface LanguageOption {
  code: Language;
  name: string;
  nativeName: string;
}

const LANGUAGES: LanguageOption[] = [
  { code: "en", name: "English", nativeName: "English" },
  { code: "xh", name: "IsiXhosa", nativeName: "IsiXhosa" },
  { code: "zu", name: "IsiZulu", nativeName: "IsiZulu" },
  { code: "af", name: "Afrikaans", nativeName: "Afrikaans" },
  { code: "st", name: "Sesotho", nativeName: "Sesotho" },
  { code: "tn", name: "Setswana", nativeName: "Setswana" },
  { code: "nso", name: "Sepedi", nativeName: "Sepedi" },
  { code: "ts", name: "Xitsonga", nativeName: "Xitsonga" },
  { code: "ve", name: "Tshivenda", nativeName: "Tshivenda" },
  { code: "nr", name: "IsiNdebele", nativeName: "IsiNdebele" },
  { code: "ss", name: "SiSwati", nativeName: "SiSwati" },
];

interface LanguageDropdownProps {
  selectedLanguage: Language;
  onSelect: (language: Language) => void;
}

export function LanguageDropdown({ selectedLanguage, onSelect }: LanguageDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const selected = LANGUAGES.find((lang) => lang.code === selectedLanguage) || LANGUAGES[0];

  const handleSelect = async (language: Language) => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    onSelect(language);
    setIsOpen(false);
  };

  return (
    <>
      <Pressable
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          setIsOpen(true);
        }}
        className="bg-blue border border-blue/20"
        style={styles.dropdownButton}
      >
        <View style={styles.dropdownContent}>
          <View style={styles.dropdownTextContainer}>
            <ThemedText type="h3" className="text-white">
              {selected.name}
            </ThemedText>
            <ThemedText type="small" className="text-white/90">
              {selected.nativeName}
            </ThemedText>
          </View>
          <Feather name="chevron-down" size={20} color="#FFFFFF" />
        </View>
      </Pressable>

      <Modal
        visible={isOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setIsOpen(false)}
      >
        <Pressable
          style={styles.modalOverlay}
          onPress={() => setIsOpen(false)}
        >
          <Animated.View
            entering={FadeInDown.springify()}
            className="bg-blue"
            style={styles.modalContent}
          >
            <View style={styles.modalHeader}>
              <ThemedText type="h3" className="text-white">
                Select Language
              </ThemedText>
              <Pressable
                onPress={() => setIsOpen(false)}
                style={styles.closeButton}
              >
                <Feather name="x" size={24} color="#FFFFFF" />
              </Pressable>
            </View>

            <FlatList
              data={LANGUAGES}
              keyExtractor={(item) => item.code}
              renderItem={({ item }) => {
                const isSelected = item.code === selectedLanguage;
                return (
                  <Pressable
                    onPress={() => handleSelect(item.code)}
                    className={isSelected ? "bg-white/20" : ""}
                    style={[
                      styles.languageItem,
                      isSelected && styles.languageItemSelected,
                    ]}
                  >
                    <View style={styles.languageItemContent}>
                      <ThemedText type="body" className="text-white">
                        {item.name}
                      </ThemedText>
                      <ThemedText type="small" className="text-white/90">
                        {item.nativeName}
                      </ThemedText>
                    </View>
                    {isSelected && (
                      <Feather name="check" size={20} color="#FFFFFF" />
                    )}
                  </Pressable>
                );
              }}
              ItemSeparatorComponent={() => <View style={styles.separator} />}
            />
          </Animated.View>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  dropdownButton: {
    width: "100%",
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
    marginBottom: Spacing.lg,
  },
  dropdownContent: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  dropdownTextContainer: {
    flex: 1,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.7)",
    justifyContent: "center",
    alignItems: "center",
    padding: Spacing.lg,
  },
  modalContent: {
    width: "100%",
    maxWidth: 400,
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
    maxHeight: "80%",
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: Spacing.lg,
  },
  closeButton: {
    padding: Spacing.xs,
  },
  languageItem: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: Spacing.md,
    borderRadius: BorderRadius.sm,
  },
  languageItemSelected: {
    borderWidth: 1,
    borderColor: "#FFFFFF",
  },
  languageItemContent: {
    flex: 1,
  },
  separator: {
    height: 1,
    backgroundColor: "rgba(255, 255, 255, 0.1)",
    marginVertical: Spacing.xs,
  },
});
