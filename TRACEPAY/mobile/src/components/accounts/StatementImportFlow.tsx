import * as DocumentPicker from "expo-document-picker";
import { router, type Href } from "expo-router";
import { ChevronLeft, FileText, X } from "lucide-react-native";
import { useColorScheme } from "nativewind";
import { useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { SetupBrandHeader } from "../auth/SetupBrandHeader";
import { Button } from "../ui/Button";
import {
  preparePdfStatement,
} from "../../features/statement-import/statement-import.service";
import { COLORS } from "../../theme/colors";

type Props = { mode: "onboarding" | "app"; returnTo?: string | null; institution?: string | null };

export function StatementImportFlow({ mode, returnTo, institution }: Props) {
  const { colorScheme } = useColorScheme();
  const palette = COLORS[colorScheme === "dark" ? "dark" : "light"];
  const [file, setFile] = useState<DocumentPicker.DocumentPickerAsset | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const leave = () => {
    if (mode === "onboarding") return router.replace("/(tabs)");
    if (returnTo) return router.replace(returnTo as Href);
    router.back();
  };

  const pickPdf = async () => {
    setMessage(null);
    const result = await DocumentPicker.getDocumentAsync({ type: "application/pdf", copyToCacheDirectory: true, multiple: false });
    if (!result.canceled && result.assets?.[0]) setFile(result.assets[0]);
  };

  const process = async () => {
    if (!file || busy) return;
    setBusy(true);
    setMessage(null);
    try {
      const result = await preparePdfStatement(file, institution);
      console.info("[TracePay][statement] navigating_home_after_save", { statementId: result.statementId, status: result.status });
      router.replace("/(tabs)");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "The PDF could not be processed.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-background">
      <View className="flex-1 px-6">
        {mode === "onboarding" ? <SetupBrandHeader /> : <Pressable className="mt-1 self-start rounded-full bg-muted p-3" onPress={leave}><ChevronLeft color={palette.foreground} size={20} /></Pressable>}
        <ScrollView contentContainerStyle={{ flexGrow: 1, paddingBottom: 24 }} showsVerticalScrollIndicator={false}>
          <Text className="mt-10 text-center text-[30px] font-bold text-foreground">Add your bank statement</Text>
          <Text className="mt-3 text-center text-[15px] leading-[22px] text-muted-foreground">Upload a PDF bank statement so TracePay can extract your transactions.</Text>
          {!file ? (
            <Pressable className="mt-10 items-center rounded-3xl bg-primary/10 px-6 py-14" onPress={() => void pickPdf()}>
              <FileText color={palette.primary} size={42} strokeWidth={1.8} />
              <Text className="mt-4 text-[18px] font-bold text-foreground">Upload PDF statement</Text>
              <Text className="mt-2 text-center text-[14px] text-muted-foreground">PDF files only · maximum 20 MB</Text>
            </Pressable>
          ) : (
            <View className="mt-10 rounded-3xl bg-card p-5">
              <View className="flex-row items-center">
                <FileText color={palette.primary} size={28} />
                <View className="ml-3 flex-1"><Text className="font-semibold text-foreground" numberOfLines={1}>{file.name}</Text><Text className="mt-1 text-[13px] text-muted-foreground">{file.size ? `${(file.size / 1024 / 1024).toFixed(2)} MB` : "Size unavailable"}</Text></View>
                <Pressable onPress={() => setFile(null)}><X color={palette.mutedForeground} size={22} /></Pressable>
              </View>
              <View className="mt-6"><Button loading={busy} onPress={() => void process()}>Process statement</Button></View>
            </View>
          )}
          {message ? <View className="mt-5 rounded-2xl bg-destructive/10 px-4 py-3"><Text className="text-center text-[13px] text-destructive">{message}</Text><Pressable className="mt-2" onPress={() => { setMessage(null); setFile(null); }}><Text className="text-center text-[13px] font-semibold text-primary">Choose another PDF</Text></Pressable></View> : null}
        </ScrollView>
        {mode === "onboarding" ? <Button onPress={leave} variant="outline">Skip for now</Button> : null}
      </View>
    </SafeAreaView>
  );
}
