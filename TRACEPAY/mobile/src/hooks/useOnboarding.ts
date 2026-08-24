import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import type { FlatList } from "react-native";
import {
  useAnimatedScrollHandler,
  useSharedValue,
} from "react-native-reanimated";

import {
  ONBOARDING_AUTH_ROUTE,
  ONBOARDING_LAST_INDEX,
} from "../features/onboarding/onboarding.constants";
import { completeOnboarding } from "../features/onboarding/onboarding.service";
import {
  setOnboardingLanguage,
  useOnboardingLanguage,
} from "../features/onboarding/onboarding.store";

function clampIndex(index: number): number {
  if (index < 0) {
    return 0;
  }

  if (index > ONBOARDING_LAST_INDEX) {
    return ONBOARDING_LAST_INDEX;
  }

  return index;
}

export function useOnboarding(pageWidth: number) {
  const router = useRouter();
  const listRef = useRef<FlatList>(null);
  const scrollX = useSharedValue(0);
  const indexRef = useRef(0);
  const finishingRef = useRef(false);
  const settlingRef = useRef(false);
  const settleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const didHapticRef = useRef(false);

  const [index, setIndex] = useState(0);
  const [isFinishing, setIsFinishing] = useState(false);
  const selectedLanguage = useOnboardingLanguage();

  const syncIndex = useCallback((nextIndex: number) => {
    const clamped = clampIndex(nextIndex);
    if (clamped === indexRef.current) {
      return;
    }

    indexRef.current = clamped;
    setIndex(clamped);
  }, []);

  const scrollHandler = useAnimatedScrollHandler({
    onScroll: (event) => {
      scrollX.value = event.contentOffset.x;
    },
  });

  const goTo = useCallback(
    (nextIndex: number) => {
      if (pageWidth <= 0 || finishingRef.current || settlingRef.current) {
        return;
      }

      const clamped = clampIndex(nextIndex);
      if (clamped === indexRef.current) {
        return;
      }

      settlingRef.current = true;
      if (settleTimerRef.current) {
        clearTimeout(settleTimerRef.current);
      }
      settleTimerRef.current = setTimeout(() => {
        settlingRef.current = false;
        settleTimerRef.current = null;
      }, 480);
      listRef.current?.scrollToOffset({
        offset: clamped * pageWidth,
        animated: true,
      });
      syncIndex(clamped);
    },
    [pageWidth, syncIndex],
  );

  const goPrev = useCallback(() => {
    goTo(indexRef.current - 1);
  }, [goTo]);

  const syncIndexFromOffset = useCallback(
    (offset: number) => {
      if (pageWidth <= 0) {
        return;
      }

      settlingRef.current = false;
      syncIndex(Math.round(offset / pageWidth));
    },
    [pageWidth, syncIndex],
  );

  const finish = useCallback(async () => {
    if (finishingRef.current) {
      return;
    }

    finishingRef.current = true;
    setIsFinishing(true);

    try {
      await completeOnboarding(selectedLanguage);
      router.replace(ONBOARDING_AUTH_ROUTE);
    } catch {
      finishingRef.current = false;
      setIsFinishing(false);
    }
  }, [router, selectedLanguage]);

  const selectLanguage = useCallback((language: string) => {
    setOnboardingLanguage(language);
  }, []);

  useEffect(() => {
    return () => {
      if (settleTimerRef.current) {
        clearTimeout(settleTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!didHapticRef.current) {
      didHapticRef.current = true;
      return;
    }

    void Haptics.selectionAsync();
  }, [index]);

  return {
    listRef,
    scrollX,
    selectedLanguage,
    isFinishing,
    isLanguagePage: index === ONBOARDING_LAST_INDEX,
    canGoBack: index > 0,
    scrollHandler,
    goTo,
    goPrev,
    syncIndexFromOffset,
    skip: finish,
    selectLanguage,
  };
}
