// Temporary ambient declarations to help incremental typechecking
// These should be replaced with proper types during cleanup.

declare module './AppShell' {
  const AppShell: any;
  export default AppShell;
}

declare module './utils/setupIntegration' {
  export const initializeAllSystems: any;
  export const cleanupSystems: any;
  export const checkSystemHealth: any;
  export default any;
}
