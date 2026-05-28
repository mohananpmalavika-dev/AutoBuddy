const DEFAULT_READY_TO_DRIVE_MESSAGE = 'Complete Ready to Drive before going online.';

export function extractDriverReadinessFromError(error) {
  const detail = error?.payload?.detail;
  if (detail?.readiness && typeof detail.readiness === 'object') {
    return detail.readiness;
  }
  if (error?.payload?.readiness && typeof error.payload.readiness === 'object') {
    return error.payload.readiness;
  }
  return null;
}

export function getDriverReadinessTab(readiness) {
  const nextTab = String(readiness?.next_tab || '').trim();
  if (nextTab) {
    return nextTab;
  }
  const blockers = Array.isArray(readiness?.blockers) ? readiness.blockers : [];
  const warnings = Array.isArray(readiness?.warnings) ? readiness.warnings : [];
  const nextIssue = blockers.find((issue) => issue?.tab) || warnings.find((issue) => issue?.tab);
  return nextIssue?.tab || 'documents';
}

export function formatDriverReadinessMessage(readiness, fallback = DEFAULT_READY_TO_DRIVE_MESSAGE) {
  const blockers = Array.isArray(readiness?.blockers) ? readiness.blockers : [];
  const firstBlocker = blockers.find((issue) => issue?.message);
  const message = String(readiness?.message || firstBlocker?.message || fallback).trim();
  if (!blockers.length) {
    return message || fallback;
  }
  const countSuffix = blockers.length > 1 ? ` (${blockers.length} items)` : '';
  return `Ready to Drive: ${message}${countSuffix}`;
}

export function isDriverReadyToDrive(readiness) {
  return !readiness || readiness.ready !== false;
}
