import { memo, useCallback, useState } from "react";
import {
  ActivityIndicator,
  type LayoutChangeEvent,
  type ListRenderItem,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  Pressable,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import Animated, { type SharedValue } from "react-native-reanimated";
import { SafeAreaView } from "react-native-safe-area-context";

import {
  ONBOARDING_LAST_INDEX,
  ONBOARDING_PAGES,
} from "../../features/onboarding/onboarding.constants";
import type {
  OnboardingLanguage,
  OnboardingPage,
} from "../../features/onboarding/onboarding.types";
import { useOnboarding } from "../../hooks/useOnboarding";
import { COLORS } from "../../theme/colors";
import { OnboardingHeader } from "./OnboardingHeader";
import { OnboardingInfoSlideView } from "./OnboardingInfoSlide";
import { OnboardingLanguageSlide } from "./OnboardingLanguageSlide";
import { OnboardingPagination } from "./OnboardingProgress";

type PageSlideProps = {
  item: OnboardingPage;
  index: number;
  pageWidth: number;
  pageHeight: number;
  scrollX: SharedValue<number>;
  selectedLanguage: OnboardingLanguage;
  isFinishing: boolean;
  onSelectLanguage: (language: string) => void;
  onAdvance: (pageIndex: number) => void;
};

const OnboardingPageSlide = memo(function OnboardingPageSlide({
  item,
  index,
  pageWidth,
  pageHeight,
  scrollX,
  selectedLanguage,
  isFinishing,
  onSelectLanguage,
  onAdvance,
}: PageSlideProps) {
  const handlePress = useCallback(() => {
    onAdvance(index);
  }, [index, onAdvance]);

  const label = item.kind === "language" ? "Continue" : item.slide.actionLabel;

  return (
    <View style={{ width: pageWidth, height: pageHeight }} className="px-6">
      <View className="flex-1 pb-5">
        {item.kind === "info" ? (
          <OnboardingInfoSlideView
            slide={item.slide}
            index={index}
            pageWidth={pageWidth}
            scrollX={scrollX}
          />
        ) : (
          <OnboardingLanguageSlide
            selectedLanguage={selectedLanguage}
            onSelect={onSelectLanguage}
          />
        )}
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        disabled={isFinishing}
        onPress={handlePress}
        className="min-h-[56px] items-center justify-center rounded-[18px] bg-primary active:opacity-80"
      >
        {isFinishing ? (
          <ActivityIndicator color={COLORS.white} />
        ) : (
          <Text className="text-[16px] font-bold text-primary-foreground">
            {label}
          </Text>
        )}
      </Pressable>
    </View>
  );
});

function OnboardingCarouselComponent() {
  const { width: pageWidth } = useWindowDimensions();
  const [pageHeight, setPageHeight] = useState(0);
  const {
    listRef,
    scrollX,
    selectedLanguage,
    isFinishing,
    isLanguagePage,
    canGoBack,
    scrollHandler,
    goTo,
    goPrev,
    syncIndexFromOffset,
    skip,
    selectLanguage,
  } = useOnboarding(pageWidth);

  const handleListLayout = useCallback((event: LayoutChangeEvent) => {
    const nextHeight = event.nativeEvent.layout.height;
    setPageHeight((current) => (current === nextHeight ? current : nextHeight));
  }, []);

  const handleScrollEnd = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      syncIndexFromOffset(event.nativeEvent.contentOffset.x);
    },
    [syncIndexFromOffset],
  );

  const handleAdvance = useCallback(
    (pageIndex: number) => {
      if (pageIndex >= ONBOARDING_LAST_INDEX) {
        void skip();
        return;
      }

      goTo(pageIndex + 1);
    },
    [goTo, skip],
  );

  const handleSkip = useCallback(() => {
    void skip();
  }, [skip]);

  const renderItem = useCallback<ListRenderItem<OnboardingPage>>(
    ({ item, index }) => (
      <OnboardingPageSlide
        item={item}
        index={index}
        pageWidth={pageWidth}
        pageHeight={pageHeight}
        scrollX={scrollX}
        selectedLanguage={selectedLanguage}
        isFinishing={isFinishing}
        onSelectLanguage={selectLanguage}
        onAdvance={handleAdvance}
      />
    ),
    [
      handleAdvance,
      isFinishing,
      pageHeight,
      pageWidth,
      scrollX,
      selectLanguage,
      selectedLanguage,
    ],
  );

  const getItemLayout = useCallback(
    (_: unknown, index: number) => ({
      length: pageWidth,
      offset: pageWidth * index,
      index,
    }),
    [pageWidth],
  );

  const keyExtractor = useCallback((item: OnboardingPage) => item.key, []);

  return (
    <SafeAreaView className="flex-1 bg-background" edges={["top", "bottom"]}>
      <OnboardingHeader
        canGoBack={canGoBack}
        showSkip={!isLanguagePage}
        disabled={isFinishing}
        onBack={goPrev}
        onSkip={handleSkip}
      />

      <View className="flex-1" onLayout={handleListLayout}>
        {pageHeight > 0 ? (
          <Animated.FlatList
            ref={listRef}
            data={ONBOARDING_PAGES}
            extraData={selectedLanguage}
            keyExtractor={keyExtractor}
            renderItem={renderItem}
            getItemLayout={getItemLayout}
            horizontal
            pagingEnabled
            bounces={false}
            overScrollMode="never"
            nestedScrollEnabled
            directionalLockEnabled
            disableIntervalMomentum
            decelerationRate="fast"
            showsHorizontalScrollIndicator={false}
            scrollEnabled={!isFinishing}
            onScroll={scrollHandler}
            onMomentumScrollEnd={handleScrollEnd}
            onScrollEndDrag={handleScrollEnd}
            scrollEventThrottle={16}
            initialNumToRender={1}
            maxToRenderPerBatch={2}
            windowSize={3}
            removeClippedSubviews={false}
            style={{ flex: 1 }}
          />
        ) : null}
      </View>

      <OnboardingPagination
        pageWidth={pageWidth}
        scrollX={scrollX}
        onDotPress={goTo}
      />
    </SafeAreaView>
  );
}

export const OnboardingCarousel = memo(OnboardingCarouselComponent);
