import { useState, useCallback, useRef } from 'react';
import axios from 'axios';

export interface CallSession {
  id: string;
  initiatorId: string;
  recipientId: string;
  callType: 'audio' | 'video';
  status: 'ringing' | 'active' | 'ended' | 'rejected' | 'missed';
  startTime?: Date;
  endTime?: Date;
  duration?: number;
  recordingUrl?: string;
  isRecording: boolean;
}

export interface CallQuality {
  videoBitrate: number;
  audioBitrate: number;
  videoFrameRate: number;
  latency: number;
  packetLoss: number;
}

interface UseVideoCallReturn {
  currentCall: CallSession | null;
  callHistory: CallSession[];
  callQuality: CallQuality | null;
  isConnected: boolean;
  isMuted: boolean;
  isVideoEnabled: boolean;
  loading: boolean;
  error: Error | null;
  initiateCall: (recipientId: string, callType: 'audio' | 'video') => Promise<boolean>;
  answerCall: (callSessionId: string) => Promise<boolean>;
  rejectCall: (callSessionId: string) => Promise<boolean>;
  endCall: (callSessionId: string) => Promise<boolean>;
  toggleMute: () => void;
  toggleVideo: () => void;
  startRecording: () => Promise<boolean>;
  stopRecording: () => Promise<boolean>;
  getCallHistory: (userId: string, limit?: number) => Promise<void>;
  getCallQuality: () => CallQuality | null;
  switchCamera: () => Promise<boolean>;
  enableScreenShare: () => Promise<boolean>;
  disableScreenShare: () => Promise<boolean>;
}

export const useVideoCall = (token: string | null, userId: string): UseVideoCallReturn => {
  const [currentCall, setCurrentCall] = useState<CallSession | null>(null);
  const [callHistory, setCallHistory] = useState<CallSession[]>([]);
  const [callQuality, setCallQuality] = useState<CallQuality | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoEnabled, setIsVideoEnabled] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000';
  const recordingRef = useRef(false);

  const initiateCall = useCallback(
    async (recipientId: string, callType: 'audio' | 'video'): Promise<boolean> => {
      if (!token) return false;
      setLoading(true);
      try {
        const response = await axios.post(
          `${API_BASE_URL}/calls/initiate`,
          { initiatorId: userId, recipientId, callType },
          { headers: { Authorization: `Bearer ${token}` } }
        );
        setCurrentCall(response.data);
        setError(null);
        return true;
      } catch (err) {
        setError(err instanceof Error ? err : new Error('Failed to initiate call'));
        return false;
      } finally {
        setLoading(false);
      }
    },
    [token, userId, API_BASE_URL]
  );

  const answerCall = useCallback(
    async (callSessionId: string): Promise<boolean> => {
      if (!token) return false;
      try {
        const response = await axios.post(
          `${API_BASE_URL}/calls/${callSessionId}/answer`,
          { userId },
          { headers: { Authorization: `Bearer ${token}` } }
        );
        setCurrentCall(response.data);
        setIsConnected(true);
        return true;
      } catch (err) {
        setError(err instanceof Error ? err : new Error('Failed to answer call'));
        return false;
      }
    },
    [token, userId, API_BASE_URL]
  );

  const rejectCall = useCallback(
    async (callSessionId: string): Promise<boolean> => {
      if (!token) return false;
      try {
        await axios.post(
          `${API_BASE_URL}/calls/${callSessionId}/reject`,
          { userId },
          { headers: { Authorization: `Bearer ${token}` } }
        );
        setCurrentCall(null);
        return true;
      } catch (err) {
        setError(err instanceof Error ? err : new Error('Failed to reject call'));
        return false;
      }
    },
    [token, userId, API_BASE_URL]
  );

  const endCall = useCallback(
    async (callSessionId: string): Promise<boolean> => {
      if (!token) return false;
      try {
        const response = await axios.post(
          `${API_BASE_URL}/calls/${callSessionId}/end`,
          { userId },
          { headers: { Authorization: `Bearer ${token}` } }
        );
        setCurrentCall(null);
        setIsConnected(false);
        recordingRef.current = false;
        if (response.data) {
          setCallHistory((prev) => [response.data, ...prev]);
        }
        return true;
      } catch (err) {
        setError(err instanceof Error ? err : new Error('Failed to end call'));
        return false;
      }
    },
    [token, userId, API_BASE_URL]
  );

  const toggleMute = useCallback(() => {
    setIsMuted((prev) => !prev);
  }, []);

  const toggleVideo = useCallback(() => {
    setIsVideoEnabled((prev) => !prev);
  }, []);

  const startRecording = useCallback(async (): Promise<boolean> => {
    if (!token || !currentCall) return false;
    try {
      await axios.post(
        `${API_BASE_URL}/calls/${currentCall.id}/recording/start`,
        { userId },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      recordingRef.current = true;
      setCurrentCall((prev) =>
        prev ? { ...prev, isRecording: true } : null
      );
      return true;
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to start recording'));
      return false;
    }
  }, [token, userId, currentCall, API_BASE_URL]);

  const stopRecording = useCallback(async (): Promise<boolean> => {
    if (!token || !currentCall) return false;
    try {
      await axios.post(
        `${API_BASE_URL}/calls/${currentCall.id}/recording/stop`,
        { userId },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      recordingRef.current = false;
      setCurrentCall((prev) =>
        prev ? { ...prev, isRecording: false } : null
      );
      return true;
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to stop recording'));
      return false;
    }
  }, [token, userId, currentCall, API_BASE_URL]);

  const getCallHistory = useCallback(
    async (historyUserId: string, limit: number = 50) => {
      if (!token) return;
      try {
        const response = await axios.get(
          `${API_BASE_URL}/calls/history/${historyUserId}`,
          {
            params: { limit },
            headers: { Authorization: `Bearer ${token}` },
          }
        );
        setCallHistory(response.data || []);
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err : new Error('Failed to fetch call history'));
      }
    },
    [token, API_BASE_URL]
  );

  const getCallQuality = useCallback((): CallQuality | null => {
    return callQuality;
  }, [callQuality]);

  const switchCamera = useCallback(async (): Promise<boolean> => {
    if (!token || !currentCall) return false;
    try {
      await axios.post(
        `${API_BASE_URL}/calls/${currentCall.id}/camera/switch`,
        { userId },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      return true;
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to switch camera'));
      return false;
    }
  }, [token, userId, currentCall, API_BASE_URL]);

  const enableScreenShare = useCallback(async (): Promise<boolean> => {
    if (!token || !currentCall) return false;
    try {
      await axios.post(
        `${API_BASE_URL}/calls/${currentCall.id}/screen-share/enable`,
        { userId },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      return true;
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to enable screen share'));
      return false;
    }
  }, [token, userId, currentCall, API_BASE_URL]);

  const disableScreenShare = useCallback(async (): Promise<boolean> => {
    if (!token || !currentCall) return false;
    try {
      await axios.post(
        `${API_BASE_URL}/calls/${currentCall.id}/screen-share/disable`,
        { userId },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      return true;
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to disable screen share'));
      return false;
    }
  }, [token, userId, currentCall, API_BASE_URL]);

  return {
    currentCall,
    callHistory,
    callQuality,
    isConnected,
    isMuted,
    isVideoEnabled,
    loading,
    error,
    initiateCall,
    answerCall,
    rejectCall,
    endCall,
    toggleMute,
    toggleVideo,
    startRecording,
    stopRecording,
    getCallHistory,
    getCallQuality,
    switchCamera,
    enableScreenShare,
    disableScreenShare,
  };
};
