# Phase 2 Week 3 Integration Guide: Analytics Dashboard

## Quick Start

### For Operators: Fleet Analytics Dashboard

```typescript
import { OperatorAnalyticsDashboard } from '@/components/OperatorAnalyticsDashboard';
import { useAppSession } from '@/hooks/useAppSession';

export function OperatorScreen() {
  const { session } = useAppSession();
  
  return (
    <OperatorAnalyticsDashboard 
      token={session?.accessToken || null}
    />
  );
}
```

**What it shows:**
- Real-time active rides and online drivers
- Fleet utilization percentage
- Average rating across all drivers
- 7-day revenue trend (line chart)
- Driver status distribution (pie chart)
- Weekly ride comparison (bar chart)
- Top 5 performing drivers
- Critical alerts (high/critical severity)
- Recent reports with download option

**Data sources:**
- `useFleetStats`: Updates every 30 seconds
- `useDriverMetrics`: Updates every 60 seconds
- `useOperatorAlerts`: Updates every 60 seconds
- `useOperatorReports`: One-time fetch on mount

### For Admins: Platform Analytics Dashboard

```typescript
import { AdminAnalyticsDashboard } from '@/components/AdminAnalyticsDashboard';
import { useAppSession } from '@/hooks/useAppSession';

export function AdminScreen() {
  const { session } = useAppSession();
  
  return (
    <AdminAnalyticsDashboard 
      token={session?.accessToken || null}
    />
  );
}
```

**What it shows:**
- System health status (green/orange/red indicator)
- Platform KPIs (Total Rides, Active Users, GMV, Operators)
- Individual service health (API, Database, Cache, Payments)
- 7-day revenue trends
- User distribution by role
- Rides breakdown by type
- Top 5 operators by performance
- Critical incidents log
- Service metrics (completion time, cancellation rate, rating)

**Data sources:**
- `useAdminDashboard`: Primary hook for all platform metrics
- Real-time system health monitoring
- Incident tracking and incident log

## Advanced Reporting Integration

```typescript
import { AdvancedReporting } from '@/components/AdvancedReporting';
import { useAppSession } from '@/hooks/useAppSession';

export function ReportingScreen() {
  const { session } = useAppSession();
  const role = session?.user.role; // 'operator' or 'admin'
  
  return (
    <AdvancedReporting 
      token={session?.accessToken || null}
      role={role as 'operator' | 'admin'}
    />
  );
}
```

**Features:**

1. **Report Generation**
   ```typescript
   // User selects:
   // - Period: Today / This Week / This Month / Custom
   // - Type: Summary / Detailed / Performance / Financial
   // - Format: PDF / CSV / XLSX
   // - Optional filters (min rating, min rides)
   
   // Click "Generate Report" to:
   // 1. Call backend API
   // 2. Generate report in selected format
   // 3. Open native share sheet
   // 4. User can email, message, or save
   ```

2. **Report List with Filtering**
   ```typescript
   // Displays recent reports
   // Click filter icon to apply custom filters:
   // - Minimum Rating (0.0-5.0)
   // - Minimum Rides count
   
   // Each report card shows:
   // - Period (e.g., "January 2026")
   // - Generated date
   // - Key metrics (rides, rating)
   // - Financial summary (revenue, costs, profit)
   // - Download button
   ```

3. **Report Details**
   ```typescript
   // Click report to view full details
   // Shows:
   // - All metrics in organized sections
   // - Generated date and period
   // - Top/Bottom performing drivers
   // - One-click export from detail view
   ```

## Performance Optimization Hook Usage

### Monitor Performance During Real-Time Updates

```typescript
import { usePerformanceOptimization } from '@/hooks/usePerformanceOptimization';
import { useWebSocket } from '@/hooks/useWebSocket';

export function RealtimeTracking() {
  const { emit, on } = useWebSocket();
  const { metrics, optimization, recordWebSocketLatency } = usePerformanceOptimization();

  useEffect(() => {
    const startTime = Date.now();
    
    // Listen for location updates
    on('driver:location_updated', (data) => {
      // Record latency for this message
      const latency = Date.now() - startTime;
      recordWebSocketLatency(latency);
      
      // If optimization is aggressive, reduce animation
      if (optimization.pausedLocationTracking) {
        // Skip animation or update less frequently
        return;
      }
      
      // Normal animation
      updateDriverLocation(data);
    });
  }, [optimization]);

  // Check current optimization level
  if (metrics?.batteryLevel < 15) {
    console.warn('Critical battery, enabling aggressive optimization');
  }

  return (
    <View>
      {/* Your tracking UI */}
      <Text>Latency: {metrics?.websocketLatency}ms</Text>
      <Text>Battery: {metrics?.batteryLevel}%</Text>
      <Text>Optimization: {optimization.optimizationLevel}</Text>
    </View>
  );
}
```

### Adaptive Network Updates

```typescript
import { useAdaptiveNetworking } from '@/hooks/usePerformanceOptimization';

export function AdaptiveRealtime() {
  const { networkQuality, updateFrequency, updateNetworkQuality } = useAdaptiveNetworking();

  // Log network latency (from WebSocket response time)
  const recordLatency = (latency: number) => {
    updateNetworkQuality(latency);
  };

  // Use updateFrequency for intervals
  useEffect(() => {
    const interval = setInterval(() => {
      // Update location at adaptive frequency
      updateLocation();
    }, updateFrequency.locationUpdate);

    return () => clearInterval(interval);
  }, [updateFrequency.locationUpdate]);

  return (
    <View>
      <Text>Network: {networkQuality}</Text>
      <Text>Location Update: {updateFrequency.locationUpdate}ms</Text>
      <Text>Earnings Update: {updateFrequency.earningsUpdate}ms</Text>
      <Text>Status Update: {updateFrequency.statusUpdate}ms</Text>
    </View>
  );
}
```

### Memory Leak Detection

```typescript
import { useMemoryLeakDetection } from '@/hooks/usePerformanceOptimization';

export function TrackingComponent() {
  const { registerListener, unregisterListener, validateCleanup, suspectedLeaks } = useMemoryLeakDetection();

  useEffect(() => {
    // Register listeners
    registerListener('location_update');
    registerListener('earnings_update');

    return () => {
      // Unregister on cleanup
      unregisterListener('location_update');
      unregisterListener('earnings_update');
      
      // Validate that all listeners were cleaned up
      const leaks = validateCleanup();
      if (leaks.length > 0) {
        console.warn('Possible memory leaks:', leaks);
      }
    };
  }, [registerListener, unregisterListener, validateCleanup]);
}
```

### Frame Rate Monitoring

```typescript
import { useFrameRateMonitoring } from '@/hooks/usePerformanceOptimization';
import { useSharedValue, useAnimatedStyle, withTiming } from 'react-native-reanimated';

export function AnimatedTracking() {
  const { recordFrame } = useFrameRateMonitoring();
  const position = useSharedValue(0);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: position.value }],
  }));

  const animateLocation = (newLocation: number) => {
    const frameStart = Date.now();

    position.value = withTiming(newLocation, {
      duration: 500,
    });

    // Record frame duration
    const frameDuration = Date.now() - frameStart;
    recordFrame(frameDuration);
  };

  return <Animated.View style={animatedStyle} />;
}
```

## Export Functionality Usage

```typescript
import { 
  generateCSVExport, 
  generateHTMLExport,
  saveAndShareExport,
  exportToMultipleFormats 
} from '@/lib/analytics-export';

// Single format export
export async function exportReport(reportData: ExportData) {
  const csv = generateCSVExport(reportData);
  await saveAndShareExport('monthly_report', csv, 'csv');
}

// Multiple formats simultaneously
export async function exportReportAllFormats(reportData: ExportData) {
  const exports = await exportToMultipleFormats(reportData, ['csv', 'json', 'html']);
  
  for (const [format, content] of Object.entries(exports)) {
    await saveAndShareExport(`report_${format}`, content, format as any);
  }
}
```

## Component Hierarchy

```
App
├── OperatorStack
│   ├── OperatorAnalyticsDashboard
│   │   ├── useFleetStats
│   │   ├── useDriverMetrics
│   │   ├── useOperatorAlerts
│   │   └── useOperatorReports
│   ├── AdvancedReporting
│   │   ├── useOperatorReports
│   │   └── analytics-export
│   └── OperatorDetailsScreen
│
├── AdminStack
│   ├── AdminAnalyticsDashboard
│   │   └── useAdminDashboard
│   └── AdminReporting
│       ├── AdvancedReporting
│       └── analytics-export
│
└── RealTimeStack
    ├── LiveTrackingMap
    │   ├── useRealtimeTracking
    │   ├── usePerformanceOptimization
    │   └── useAdaptiveNetworking
    └── EarningsWidget
        ├── useRealtimeEarnings
        ├── usePerformanceOptimization
        └── useMemoryLeakDetection
```

## Testing Integration

```typescript
// Mock the hooks for testing
jest.mock('@/hooks/useOperatorDashboard', () => ({
  useFleetStats: jest.fn(() => ({
    stats: {
      activeRides: 12,
      driversOnline: 45,
      utilizationRate: 78,
      avgRating: 4.7,
      revenue: 50000,
      costs: 12000,
      profit: 38000,
      totalRidesCount: 256,
      totalDistance: 1234,
    },
    loading: false,
    error: null,
    refetch: jest.fn(),
  })),
}));

// Test rendering
test('OperatorAnalyticsDashboard renders with metrics', () => {
  const { getByText } = render(
    <OperatorAnalyticsDashboard token="test-token" />
  );
  
  expect(getByText('12')).toBeInTheDocument(); // Active rides
  expect(getByText('45')).toBeInTheDocument(); // Online drivers
  expect(getByText('78%')).toBeInTheDocument(); // Utilization
});
```

## Error Handling

```typescript
// Handle API failures gracefully
export function SafeOperatorDashboard() {
  const { session } = useAppSession();
  
  return (
    <ErrorBoundary>
      <OperatorAnalyticsDashboard 
        token={session?.accessToken || null}
      />
    </ErrorBoundary>
  );
}

// Custom error boundary
class DashboardErrorBoundary extends React.Component {
  state = { hasError: false };

  static getDerivedStateFromError(error: Error) {
    return { hasError: true };
  }

  componentDidCatch(error: Error) {
    console.error('Dashboard error:', error);
    // Send to error tracking service
  }

  render() {
    if (this.state.hasError) {
      return (
        <View style={{ flex: 1, justifyContent: 'center' }}>
          <Text>Analytics temporarily unavailable</Text>
        </View>
      );
    }
    return this.props.children;
  }
}
```

## Performance Tips

1. **Chart Rendering**
   - Charts re-render on every data change
   - Use React.memo to prevent unnecessary renders
   - Memoize chart data transformations

2. **List Filtering**
   - Use useMemo for filter calculations
   - Avoid inline object creation
   - Use FlatList for long report lists

3. **Export Operations**
   - Run exports in background if possible
   - Show progress indicator during batch operations
   - Cache export templates

4. **Real-Time Updates**
   - Pause updates when in background (usePerformanceOptimization handles this)
   - Adjust frequency based on network quality
   - Use debouncing for rapid updates

## Troubleshooting

### Dashboard not showing data?
- Check token is valid and not expired
- Verify backend endpoints are returning data
- Check network connection
- Review console logs for API errors

### Export failing?
- Ensure app has file system permissions
- Check available disk space
- Verify format support on target device
- Try alternative format (CSV instead of PDF)

### Performance issues?
- Check battery level (optimization may pause updates)
- Monitor network quality
- Profile with React DevTools
- Check for memory leaks with validateCleanup()

### Charts not rendering?
- Ensure data array has values
- Check chart width is calculated correctly
- Verify react-native-chart-kit is installed
- Check device screen dimensions
