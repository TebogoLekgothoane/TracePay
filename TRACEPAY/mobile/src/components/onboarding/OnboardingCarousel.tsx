import { memo, useCallback, useState } from "react";
import {
  type LayoutChangeEvent,
  type ListRenderItem,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
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
import { Button } from "../ui/Button";
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
  onSelectLanguage: (language: string) => void;
};

const OnboardingPageSlide = memo(function OnboardingPageSlide({
  item,
  index,
  pageWidth,
  pageHeight,
  scrollX,
  selectedLanguage,
  onSelectLanguage,
}: PageSlideProps) {
  return (
    <View style={{ width: pageWidth, height: pageHeight }} className="px-6">
      <View className="flex-1">
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
    </View>
  );
});

function getActionLabel(page: OnboardingPage): string {
  return page.kind === "language" ? "Continue" : page.slide.actionLabel;
}

function OnboardingCarouselComponent() {
  const { width: pageWidth } = useWindowDimensions();
  const [pageHeight, setPageHeight] = useState(0);
  const {
    listRef,
    index,
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

  const currentPage = ONBOARDING_PAGES[index] ?? ONBOARDING_PAGES[0];
  const actionLabel = getActionLabel(currentPage);

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

  const handlePrimaryAction = useCallback(() => {
    if (index >= ONBOARDING_LAST_INDEX) {
      void skip();
      return;
    }

    goTo(index + 1);
  }, [goTo, index, skip]);

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
        onSelectLanguage={selectLanguage}
      />
    ),
    [
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
            snapToInterval={pageWidth}
            snapToAlignment="start"
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

      <View className="gap-5 px-6 pb-1 pt-6">
        <OnboardingPagination
          pageWidth={pageWidth}
          scrollX={scrollX}
          onDotPress={goTo}
        />

        <Button
          accessibilityLabel={actionLabel}
          loading={isFinishing}
          onPress={handlePrimaryAction}
        >
          {actionLabel}
        </Button>
      </View>
    </SafeAreaView>
  );
}

export const OnboardingCarousel = memo(OnboardingCarouselComponent);
