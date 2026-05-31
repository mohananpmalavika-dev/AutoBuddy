import AsyncStorage from '@react-native-async-storage/async-storage';
import { apiRequest } from './api';

const QUEUE_STORAGE_KEY = 'driver_offline_queue';
const MAX_RETRIES = 10;

/**
 * OfflineQueueManager - Handles offline operations and syncs when online
 * Queues ride acceptance, document uploads, and other critical operations
 */
export class OfflineQueueManager {
  constructor() {
    this.queue = [];
    this.isOnline = true;
    this.retryTimers = new Map();
  }

  /**
   * Add operation to queue
   */
  async queueOperation(operation) {
    const queueItem = {
      id: `${operation.type}-${Date.now()}`,
      type: operation.type, // 'accept_ride', 'decline_ride', 'upload_document', etc.
      payload: operation.payload,
      timestamp: Date.now(),
      retries: 0,
      lastError: null,
    };

    this.queue.push(queueItem);
    await this._persistQueue();

    // Try immediately if online
    if (this.isOnline) {
      await this.processQueue();
    }

    return queueItem.id;
  }

  /**
   * Process queued operations
   */
  async processQueue() {
    if (!this.isOnline || this.queue.length === 0) {
      return;
    }

    const itemsToProcess = [...this.queue];

    for (const item of itemsToProcess) {
      try {
        await this._executeOperation(item);
        // Remove from queue on success
        this.queue = this.queue.filter((i) => i.id !== item.id);
      } catch (error) {
        item.lastError = error.message;
        item.retries += 1;

        if (item.retries >= MAX_RETRIES) {
          // Max retries reached, mark as failed and remove
          console.error(`Operation ${item.id} failed after ${MAX_RETRIES} retries:`, error);
          this.queue = this.queue.filter((i) => i.id !== item.id);
        }
      }
    }

    await this._persistQueue();
  }

  /**
   * Execute single operation
   */
  async _executeOperation(item) {
    const { type, payload } = item;

    switch (type) {
      case 'accept_ride':
        return await apiRequest('/bookings/accept', {
          method: 'POST',
          body: { booking_id: payload.booking_id },
          token: payload.token,
        });

      case 'decline_ride':
        return await apiRequest('/bookings/decline', {
          method: 'POST',
          body: { booking_id: payload.booking_id, reason: payload.reason },
          token: payload.token,
        });

      case 'upload_document':
        if (!payload.docType && !payload.documentType) {
          throw new Error('Document type is required for queued document upload.');
        }
        return await apiRequest(`/drivers/documents/${payload.docType || payload.documentType}`, {
          method: 'POST',
          body: payload.formData,
          token: payload.token,
          isFormData: true,
        });

      case 'update_settings':
        return await apiRequest('/drivers/settings', {
          method: 'PUT',
          body: payload.settings,
          token: payload.token,
        });

      case 'block_passenger':
        return await apiRequest('/drivers/blocked-passengers', {
          method: 'POST',
          body: { passenger_id: payload.passenger_id, reason: payload.reason },
          token: payload.token,
        });

      default:
        throw new Error(`Unknown operation type: ${type}`);
    }
  }

  /**
   * Set online/offline status
   */
  setOnlineStatus(isOnline) {
    this.isOnline = isOnline;
    if (isOnline && this.queue.length > 0) {
      // Process queue when coming back online
      this.processQueue().catch((err) => console.warn('Queue processing error:', err));
    }
  }

  /**
   * Get queue status
   */
  getQueueStatus() {
    return {
      pending: this.queue.length,
      items: this.queue.map((item) => ({
        id: item.id,
        type: item.type,
        retries: item.retries,
        lastError: item.lastError,
        age: Date.now() - item.timestamp,
      })),
    };
  }

  /**
   * Clear queue (for testing/reset)
   */
  async clearQueue() {
    this.queue = [];
    await AsyncStorage.removeItem(QUEUE_STORAGE_KEY);
  }

  /**
   * Persist queue to storage
   */
  async _persistQueue() {
    try {
      await AsyncStorage.setItem(QUEUE_STORAGE_KEY, JSON.stringify(this.queue));
    } catch (err) {
      console.error('Failed to persist queue:', err);
    }
  }

  /**
   * Load queue from storage
   */
  async loadQueue() {
    try {
      const stored = await AsyncStorage.getItem(QUEUE_STORAGE_KEY);
      if (stored) {
        this.queue = JSON.parse(stored);
      }
    } catch (err) {
      console.error('Failed to load queue:', err);
      this.queue = [];
    }
  }
}

// Export singleton instance
export const offlineQueueManager = new OfflineQueueManager();
