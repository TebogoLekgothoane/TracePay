import { ViewStyle } from 'react-native';

export const CARD_SHADOW_CLASS = 'shadow-sm shadow-black/15 dark:shadow-md dark:shadow-black/40';

/** Light purple wash for nested tiles — no native elevation (avoids sharp Android shadow rects). */
export const INNER_TINT_SURFACE_CLASS = 'overflow-hidden rounded-2xl';

/** Native card shadow: iOS uses shadow* props, Android uses elevation. */
export const cardShadowStyle: ViewStyle = {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.16,
    shadowRadius: 4,
    elevation: 4,
};

/** Stronger shadow for floating team pill buttons. */
export const TEAM_BUTTON_SHADOW_CLASS = 'shadow-md shadow-black/30 dark:shadow-lg dark:shadow-black/55';

export const teamButtonShadowStyle: ViewStyle = {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 8,
};
