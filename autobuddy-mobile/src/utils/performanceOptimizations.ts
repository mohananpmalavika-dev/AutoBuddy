/**
 * Performance Optimization Utilities
 * 
 * Utilities for improving app performance and reducing unnecessary re-renders.
 * Created as part of BUG-023 and BUG-024 fixes.
 */

import { useCallback, useEffect, useMemo, useRef } from 'react';

/**
 * BUG-023 FIX: Debounce hook to prevent excessive function calls
 * Use for search inputs, scroll handlers, resize events
 */
export function useDebounce<T>(value: T, delay: number = 300): T {
  const [debouncedValue, setDebouncedValue] = React.useState<T>(value);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => {
      clearTimeout(timer);
    };
  }, [value, delay]);

  return debouncedValue;
}

/**
 * BUG-023 FIX: Throttle hook to limit function call frequency
 * Use for scroll handlers, mouse move, expensive operations
 */
export function useThrottle<T>(value: T, limit: number = 300): T {
  const [throttledValue, setThrottledValue] = React.useState<T>(value);
  const lastRan = useRef(Date.now());

  useEffect(() => {
    const handler = setTimeout(() => {
      if (Date.now() - lastRan.current >= limit) {
        setThrottledValue(value);
        lastRan.current = Date.now();
      }
    }, limit - (Date.now() - lastRan.current));

    return () => {
      clearTimeout(handler);
    };
  }, [value, limit]);

  return throttledValue;
}

/**
 * BUG-023 FIX: Memoize expensive computations
 * Use this for complex calculations, sorting, filtering large arrays
 */
export function useMemoizedValue<T>(
  factory: () => T,
  deps: React.DependencyList
): T {
  return useMemo(factory, deps);
}

/**
 * BUG-023 FIX: Stable callback that doesn't change reference
 * Prevents child component re-renders when callback hasn't changed
 */
export function useStableCallback<T extends (...args: any[]) => any>(
  callback: T
): T {
  const callbackRef = useRef(callback);

  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);

  return useCallback(((...args) => callbackRef.current(...args)) as T, []);
}

/**
 * BUG-024 FIX: Image optimization utilities
 */
export const ImageOptimization = {
  /**
   * Get optimized image URI with resize parameters
   */
  getOptimizedImageUri(
    uri: string,
    width: number,
    height?: number,
    quality: number = 80
  ): string {
    // If it's a local image, return as-is
    if (uri.startsWith('file://') || uri.startsWith('data:')) {
      return uri;
    }

    // For remote images, add resize parameters if server supports it
    const params = new URLSearchParams();
    params.append('w', String(width));
    if (height) params.append('h', String(height));
    params.append('q', String(quality));

    const separator = uri.includes('?') ? '&' : '?';
    return `${uri}${separator}${params.toString()}`;
  },

  /**
   * Get thumbnail size for list items (BUG-024)
   */
  getThumbnailUri(uri: string): string {
    return ImageOptimization.getOptimizedImageUri(uri, 150, 150, 70);
  },

  /**
   * Get preview size for detail views (BUG-024)
   */
  getPreviewUri(uri: string): string {
    return ImageOptimization.getOptimizedImageUri(uri, 800, undefined, 85);
  },

  /**
   * Lazy load images - return placeholder until in viewport
   */
  shouldLoadImage(isVisible: boolean, uri: string): string | null {
    if (!isVisible) {
      return null; // Don't load until visible
    }
    return uri;
  },
};

/**
 * BUG-023 FIX: List optimization utilities
 */
export const ListOptimization = {
  /**
   * Default props for FlatList optimization
   */
  getFlatListOptimizationProps() {
    return {
      removeClippedSubviews: true, // Remove off-screen items
      maxToRenderPerBatch: 10, // Items per render batch
      updateCellsBatchingPeriod: 50, // ms between batches
      initialNumToRender: 10, // Initial items
      windowSize: 5, // Viewport multiplier
      getItemLayout: undefined, // Set this if item height is fixed
    };
  },

  /**
   * Get item layout for fixed-height lists (improves scroll performance)
   */
  getItemLayout(itemHeight: number) {
    return (data: any, index: number) => ({
      length: itemHeight,
      offset: itemHeight * index,
      index,
    });
  },

  /**
   * Key extractor helper
   */
  keyExtractor<T extends { id?: string; _id?: string }>(item: T, index: number): string {
    return item.id || item._id || String(index);
  },
};

/**
 * BUG-023 FIX: Prevent unnecessary re-renders with memo
 * Use this to wrap child components that receive stable props
 */
import React from 'react';

export function createMemoComponent<P extends object>(
  Component: React.ComponentType<P>,
  propsAreEqual?: (prevProps: P, nextProps: P) => boolean
): React.MemoExoticComponent<React.ComponentType<P>> {
  return React.memo(Component, propsAreEqual);
}

/**
 * BUG-023 FIX: Batch state updates to reduce re-renders
 */
export function useBatchedState<T>(initialValue: T): [T, (update: Partial<T>) => void] {
  const [state, setState] = React.useState<T>(initialValue);

  const batchUpdate = useCallback((update: Partial<T>) => {
    setState((prev) => ({ ...prev, ...update }));
  }, []);

  return [state, batchUpdate];
}

/**
 * Performance monitoring hook
 */
export function usePerformanceMonitor(componentName: string) {
  const renderCount = useRef(0);
  const renderTimes = useRef<number[]>([]);

  useEffect(() => {
    renderCount.current += 1;
    const startTime = performance.now();

    return () => {
      const endTime = performance.now();
      renderTimes.current.push(endTime - startTime);

      // Log slow renders (> 16ms = 60fps)
      if (endTime - startTime > 16) {
        console.warn(
          `[Performance] ${componentName} slow render: ${(endTime - startTime).toFixed(2)}ms (render #${renderCount.current})`
        );
      }
    };
  });

  // Log statistics every 50 renders
  useEffect(() => {
    if (renderCount.current % 50 === 0 && renderTimes.current.length > 0) {
      const avg = renderTimes.current.reduce((a, b) => a + b, 0) / renderTimes.current.length;
      console.log(`[Performance] ${componentName} avg render time: ${avg.toFixed(2)}ms (${renderCount.current} renders)`);
      renderTimes.current = [];
    }
  });
}

/**
 * Example usage patterns:
 * 
 * // BUG-023: Debounce search input
 * const [searchQuery, setSearchQuery] = useState('');
 * const debouncedQuery = useDebounce(searchQuery, 300);
 * 
 * // BUG-023: Memoize expensive computation
 * const sortedData = useMemoizedValue(() => {
 *   return data.sort((a, b) => a.value - b.value);
 * }, [data]);
 * 
 * // BUG-024: Optimize images
 * <Image source={{ uri: ImageOptimization.getThumbnailUri(imageUrl) }} />
 * 
 * // BUG-023: Optimize FlatList
 * <FlatList
 *   data={items}
 *   {...ListOptimization.getFlatListOptimizationProps()}
 *   keyExtractor={ListOptimization.keyExtractor}
 * />
 */
