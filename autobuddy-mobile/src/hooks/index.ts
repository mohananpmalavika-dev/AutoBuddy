// Auth & User
export { useAuth } from './useAuth';
export { useUserProfile } from './useUserProfile';
export { useRoleAccess } from './useRoleAccess';

// Admin
export { useAdminMetrics, useSystemHealth, useAdminAlerts, useComplianceData, useSystemConfig, useAdminUserManagement, useAdminReports } from './useAdminDashboard';

// Ride Management
export { useRideHistory } from './useRideHistory';
export { useRideReceipts } from './useRideReceipts';
export { useRidePooling } from './useRidePooling';
export { useRouteOptimization } from './useRouteOptimization';
export { useRidePreferences } from './useRidePreferences';

// Financial
export { useWallet } from './useWallet';
export { useExpenseTracking } from './useExpenseTracking';
export { useReferralSystem } from './useReferralSystem';
export { usePaymentMethods } from './usePaymentMethods';

// Driver Features
export { useVehicleManagement } from './useVehicleManagement';
export { useIncentivesTracking } from './useIncentivesTracking';
export { useComplianceTracking } from './useComplianceTracking';

// Analytics
export { useAdvancedAnalytics } from './useAdvancedAnalytics';
export { useDriverPerformanceInsights } from './useDriverPerformanceInsights';

// Support & Communication
export { useCustomerSupport } from './useCustomerSupport';
export { useVideoCall } from './useVideoCall';

// Accessibility & Localization
export { useAccessibilityFeatures } from './useAccessibilityFeatures';
export { useLocalization, useLocalizationContext, LocalizationContext } from './useLocalization';

// Utilities
export { useCache, useMemoizedRequest } from './useCache';
export { usePerformanceMonitoring } from './usePerformanceMonitoring';
