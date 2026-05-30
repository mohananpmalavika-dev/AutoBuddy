/**
 * AdminAuditLogger.js - Centralized audit logging for admin actions
 * Logs all admin actions for compliance and accountability
 * 
 * Usage:
 * await AdminAuditLogger.logAction('TRIP_CANCELLED', {tripId, reason, adminId})
 * await AdminAuditLogger.logAction('USER_SUSPENDED', {userId, reason, adminId})
 */

import { apiRequest } from '../lib/api';
import { istISOString, formatToIST } from './time';

const ACTION_TYPES = {
  // Trip actions
  TRIP_CANCELLED: 'TRIP_CANCELLED',
  
  // User actions
  USER_SUSPENDED: 'USER_SUSPENDED',
  USER_UNSUSPENDED: 'USER_UNSUSPENDED',
  USER_DELETED: 'USER_DELETED',
  
  // KYC actions
  KYC_APPROVED: 'KYC_APPROVED',
  KYC_REJECTED: 'KYC_REJECTED',
  
  // Phone actions
  PHONE_CHANGE_APPROVED: 'PHONE_CHANGE_APPROVED',
  PHONE_CHANGE_REJECTED: 'PHONE_CHANGE_REJECTED',
  
  // Deletion requests
  ACCOUNT_DELETION_APPROVED: 'ACCOUNT_DELETION_APPROVED',
  ACCOUNT_DELETION_REJECTED: 'ACCOUNT_DELETION_REJECTED',
  
  // Subscription actions
  SUBSCRIPTION_UPDATED: 'SUBSCRIPTION_UPDATED',
  SUBSCRIPTION_ACTIVATED: 'SUBSCRIPTION_ACTIVATED',
  SUBSCRIPTION_DEACTIVATED: 'SUBSCRIPTION_DEACTIVATED',
  
  // Pricing actions
  PRICING_UPDATED: 'PRICING_UPDATED',
  FARE_UPDATED: 'FARE_UPDATED',
  
  // Wallet actions
  WALLET_TOP_UP_APPROVED: 'WALLET_TOP_UP_APPROVED',
  WALLET_TOP_UP_REJECTED: 'WALLET_TOP_UP_REJECTED',
  WALLET_REFUNDED: 'WALLET_REFUNDED',
  
  // Configuration actions
  SPIN_WIN_UPDATED: 'SPIN_WIN_UPDATED',
  RIDE_PRODUCTS_UPDATED: 'RIDE_PRODUCTS_UPDATED',
  REGISTRATION_FEE_UPDATED: 'REGISTRATION_FEE_UPDATED',
};

class AdminAuditLogger {
  /**
   * Log an admin action
   * @param {string} actionType - Type of action from ACTION_TYPES
   * @param {object} data - Action details (userId, reason, values changed, etc.)
   * @returns {Promise<boolean>} Success status
   */
  static async logAction(actionType, data = {}) {
    try {
      // Validate action type
      if (!Object.values(ACTION_TYPES).includes(actionType)) {
        console.warn(`Invalid action type: ${actionType}`);
        return false;
      }

      const payload = {
        action_type: actionType,
        action_data: JSON.stringify(data),
        timestamp: istISOString(new Date()),
        user_agent: 'AdminDashboard',
      };

      const response = await apiRequest('POST', '/admin/audit-log', payload);
      
      if (response?.success) {
        console.log(`✓ Audit logged: ${actionType}`, data);
        return true;
      } else {
        console.error(`Failed to log audit: ${response?.error}`);
        return false;
      }
    } catch (error) {
      console.error('Audit logging error:', error);
      // Don't throw - logging should not break main operations
      return false;
    }
  }

  /**
   * Get audit logs for a specific entity
   * @param {string} entityType - e.g., 'USER', 'TRIP', 'KYC'
   * @param {string} entityId - ID of the entity
   * @param {number} limit - Number of logs to retrieve
   */
  static async getEntityAuditLogs(entityType, entityId, limit = 50) {
    try {
      const response = await apiRequest(
        'GET',
        `/admin/audit-log?entity_type=${entityType}&entity_id=${entityId}&limit=${limit}`
      );
      return response?.logs || [];
    } catch (error) {
      console.error('Error fetching audit logs:', error);
      return [];
    }
  }

  /**
   * Get all audit logs with optional filters
   * @param {object} filters - { actionType, page, limit, dateFrom, dateTo }
   */
  static async getAuditLogs(filters = {}) {
    try {
      const params = new URLSearchParams({
        page: filters.page || 1,
        limit: filters.limit || 50,
        ...(filters.actionType && { action_type: filters.actionType }),
        ...(filters.dateFrom && { date_from: filters.dateFrom }),
        ...(filters.dateTo && { date_to: filters.dateTo }),
      });

      const response = await apiRequest('GET', `/admin/audit-log?${params.toString()}`);
      return {
        logs: response?.logs || [],
        total: response?.total || 0,
        page: response?.page || 1,
      };
    } catch (error) {
      console.error('Error fetching audit logs:', error);
      return { logs: [], total: 0, page: 1 };
    }
  }

  /**
   * Format audit log for display
   */
  static formatLog(log) {
    const actionType = log.action_type || 'UNKNOWN';
    const timestamp = formatToIST(log.timestamp);
    const data = typeof log.action_data === 'string' 
      ? JSON.parse(log.action_data) 
      : log.action_data;

    return {
      ...log,
      displayAction: this.getActionLabel(actionType),
      displayTime: timestamp,
      parsedData: data,
    };
  }

  /**
   * Get human-readable label for action
   */
  static getActionLabel(actionType) {
    const labels = {
      TRIP_CANCELLED: 'Trip Cancelled',
      USER_SUSPENDED: 'User Suspended',
      USER_UNSUSPENDED: 'User Unsuspended',
      USER_DELETED: 'User Deleted',
      KYC_APPROVED: 'KYC Approved',
      KYC_REJECTED: 'KYC Rejected',
      PHONE_CHANGE_APPROVED: 'Phone Change Approved',
      PHONE_CHANGE_REJECTED: 'Phone Change Rejected',
      ACCOUNT_DELETION_APPROVED: 'Account Deletion Approved',
      ACCOUNT_DELETION_REJECTED: 'Account Deletion Rejected',
      SUBSCRIPTION_UPDATED: 'Subscription Updated',
      SUBSCRIPTION_ACTIVATED: 'Subscription Activated',
      SUBSCRIPTION_DEACTIVATED: 'Subscription Deactivated',
      PRICING_UPDATED: 'Pricing Updated',
      FARE_UPDATED: 'Fare Updated',
      WALLET_TOP_UP_APPROVED: 'Wallet Top-up Approved',
      WALLET_TOP_UP_REJECTED: 'Wallet Top-up Rejected',
      WALLET_REFUNDED: 'Wallet Refunded',
      SPIN_WIN_UPDATED: 'Spin & Win Updated',
      RIDE_PRODUCTS_UPDATED: 'Ride Products Updated',
      REGISTRATION_FEE_UPDATED: 'Registration Fee Updated',
    };

    return labels[actionType] || actionType;
  }
}

export { ACTION_TYPES };
export default AdminAuditLogger;
