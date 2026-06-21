import { apiClient } from './apiClient';

export interface FamilyAppointment {
  id: string;
  member_id: string;
  title: string;
  description?: string;
  appointment_type: 'medical' | 'education' | 'work' | 'personal';
  start_time: string;
  end_time: string;
  location: string;
  estimated_travel_time_minutes: number;
  priority: 'high' | 'medium' | 'low';
  status: 'upcoming' | 'ongoing' | 'completed' | 'cancelled';
  created_at: string;
  updated_at: string;
}

export interface FamilyNotification {
  id: string;
  member_id: string;
  appointment_id: string;
  message: string;
  notification_type: 'appointment_reminder' | 'ride_booked' | 'ride_cancelled' | 'quick_action_available';
  read: boolean;
  quick_action_data?: {
    can_book_ride: boolean;
    suggested_vehicle_type?: string;
    estimated_fare?: number;
  };
  created_at: string;
}

export interface FamilyMember {
  id: string;
  user_id: string;
  name: string;
  email: string;
  phone: string;
  relation: 'parent' | 'child' | 'spouse' | 'sibling' | 'friend';
  date_of_birth?: string;
  emergency_contact?: boolean;
  is_active: boolean;
  calendar_synced: boolean;
  calendar_oauth_token?: string;
  last_sync: string;
  created_at: string;
  updated_at: string;
}

export interface QuickActionBookingRequest {
  member_id: string;
  appointment_id: string;
  vehicle_type?: string;
  payment_method_id?: string;
}

export interface QuickActionBookingResponse {
  ride_id: string;
  booking_status: 'confirmed' | 'pending' | 'failed';
  estimated_arrival_minutes: number;
  driver_details?: {
    name: string;
    vehicle: string;
    rating: number;
  };
  fare_details: {
    base_fare: number;
    tax: number;
    total: number;
  };
}

export interface DashboardData {
  upcomingAppointments: FamilyAppointment[];
  recentNotifications: FamilyNotification[];
  familyMembers: FamilyMember[];
  bookingSummary: {
    totalRidesBooked: number;
    upcomingRides: number;
    averageBookingTime: number;
  };
}

export class FamilyAssistantService {
  private apiClient: typeof apiClient;
  private baseUrl = '/api/family';

  constructor(client: typeof apiClient = apiClient) {
    this.apiClient = client;
  }

  // Family Member Operations
  async addFamilyMember(data: Omit<FamilyMember, 'id' | 'user_id' | 'created_at' | 'updated_at' | 'last_sync'>) {
    return this.apiClient.post(`${this.baseUrl}/members/add`, data);
  }

  async getFamilyMembers(): Promise<FamilyMember[]> {
    return this.apiClient.get(`${this.baseUrl}/members/list`);
  }

  async updateFamilyMember(memberId: string, data: Partial<FamilyMember>) {
    return this.apiClient.put(`${this.baseUrl}/members/${memberId}`, data);
  }

  async removeFamilyMember(memberId: string) {
    return this.apiClient.delete(`${this.baseUrl}/members/${memberId}`);
  }

  // Appointment Operations
  async addAppointment(memberId: string, data: Omit<FamilyAppointment, 'id' | 'status' | 'created_at' | 'updated_at' | 'member_id'>) {
    return this.apiClient.post(`${this.baseUrl}/appointments/add`, {
      member_id: memberId,
      ...data,
    });
  }

  async getAppointments(memberId: string): Promise<FamilyAppointment[]> {
    return this.apiClient.get(`${this.baseUrl}/appointments/${memberId}`);
  }

  async getUpcomingAppointments(limit: number = 10): Promise<FamilyAppointment[]> {
    return this.apiClient.get(`${this.baseUrl}/appointments/upcoming?limit=${limit}`);
  }

  async updateAppointment(appointmentId: string, data: Partial<FamilyAppointment>) {
    return this.apiClient.put(`${this.baseUrl}/appointments/${appointmentId}`, data);
  }

  async cancelAppointment(appointmentId: string) {
    return this.apiClient.post(`${this.baseUrl}/appointments/${appointmentId}/cancel`, {});
  }

  // Notification Operations
  async getNotifications(limit: number = 20): Promise<FamilyNotification[]> {
    return this.apiClient.get(`${this.baseUrl}/notifications?limit=${limit}`);
  }

  async markNotificationRead(notificationId: string) {
    return this.apiClient.post(`${this.baseUrl}/notifications/${notificationId}/read`, {});
  }

  async markAllNotificationsRead() {
    return this.apiClient.post(`${this.baseUrl}/notifications/mark-all-read`, {});
  }

  // One-Click Booking
  async quickBookRide(request: QuickActionBookingRequest): Promise<QuickActionBookingResponse> {
    return this.apiClient.post(`${this.baseUrl}/quick-actions/book-ride`, request);
  }

  async getQuickActionSuggestions(appointmentId: string) {
    return this.apiClient.get(`${this.baseUrl}/quick-actions/suggestions/${appointmentId}`);
  }

  // Dashboard
  async getDashboardData(): Promise<DashboardData> {
    return this.apiClient.get(`${this.baseUrl}/dashboard`);
  }

  // Analytics
  async getAnalytics(timeRange: 'week' | 'month' | 'year' = 'month') {
    return this.apiClient.get(`${this.baseUrl}/analytics?timeRange=${timeRange}`);
  }

  // Calendar Sync
  async initializeCalendarSync(memberId: string, calendarProvider: 'google' | 'apple' | 'outlook') {
    return this.apiClient.post(`${this.baseUrl}/members/${memberId}/calendar/initialize`, {
      provider: calendarProvider,
    });
  }

  async syncCalendar(memberId: string) {
    return this.apiClient.post(`${this.baseUrl}/members/${memberId}/calendar/sync`, {});
  }

  async getCalendarSyncStatus(memberId: string) {
    return this.apiClient.get(`${this.baseUrl}/members/${memberId}/calendar/status`);
  }

  // Preferences
  async updatePreferences(preferences: {
    autoNotify?: boolean;
    notificationLeadTimeMinutes?: number;
    autoBookRides?: boolean;
    defaultVehicleType?: string;
    allowEmergencyOverride?: boolean;
  }) {
    return this.apiClient.post(`${this.baseUrl}/preferences/update`, preferences);
  }

  async getPreferences() {
    return this.apiClient.get(`${this.baseUrl}/preferences`);
  }
}

export const familyAssistantService = new FamilyAssistantService();
