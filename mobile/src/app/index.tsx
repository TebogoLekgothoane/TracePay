import { SkeletonBoot } from "@/components/ScreenSkeletons";

/** Boot splash — NavigationGuard in _layout.tsx routes by auth + onboarding state. */
export default function IndexScreen() {
  return <SkeletonBoot />;
}
