declare module 'expo-router' {
  import type * as React from 'react';

  export type Href<T = string> = T;
  export const DarkTheme: unknown;
  export const DefaultTheme: unknown;
  export function Slot(props: Record<string, unknown>): JSX.Element;
  export function ThemeProvider(props: { value: unknown; children?: React.ReactNode }): JSX.Element;
  export function usePathname(): string;
  export function useRouter(): {
    push: (href: Href) => void;
    replace: (href: Href) => void;
    back: () => void;
  };
  export function Link(props: Record<string, any> & { href: Href; asChild?: boolean }): JSX.Element;
}

declare module 'expo-router/unstable-native-tabs' {
  import type * as React from 'react';

  export const NativeTabs: React.ComponentType<Record<string, unknown>> & {
    Trigger: React.ComponentType<Record<string, unknown>> & {
      Label: React.ComponentType<Record<string, unknown>>;
      Icon: React.ComponentType<Record<string, unknown>>;
    };
  };
}

declare module 'expo-router/ui' {
  import type * as React from 'react';

  export const Tabs: React.ComponentType<Record<string, unknown>>;
  export const TabList: React.ComponentType<Record<string, unknown>>;
  export const TabTrigger: React.ComponentType<Record<string, unknown>>;
  export const TabSlot: React.ComponentType<Record<string, unknown>>;
  export type TabTriggerSlotProps = Record<string, any> & { isFocused?: boolean; children?: React.ReactNode };
  export type TabListProps = Record<string, any> & { children?: React.ReactNode };
}

declare module 'react-native-reanimated' {
  const Reanimated: any;
  export default Reanimated;
  export const Easing: any;
  export const Keyframe: any;
  export const FadeIn: any;
  export const useSharedValue: any;
  export const useAnimatedStyle: any;
  export const withTiming: any;
  export const withSpring: any;
  export const withRepeat: any;
  export const withSequence: any;
  export const cancelAnimation: any;
}

declare module 'expo-crypto' {
  export const CryptoDigestAlgorithm: Record<string, string>;
  export function digestStringAsync(algorithm: string, data: string, options?: Record<string, unknown>): Promise<string>;
  export function getRandomBytesAsync(byteCount: number): Promise<Uint8Array>;
}

declare module 'expo-battery' {
  export function getBatteryLevelAsync(): Promise<number>;
  export function getPowerStateAsync(): Promise<Record<string, unknown>>;
  export const BatteryState: Record<string, string | number>;
}

declare module '@react-native-firebase/messaging' {
  const messaging: any;
  export default messaging;
}
