import { useState, useCallback, useRef } from 'react';
import axios from 'axios';

export interface KYCDocument {
  id: string;
  userId: string;
  type: 'identity' | 'license' | 'insurance' | 'registration';
  documentUrl: string;
  status: 'pending' | 'approved' | 'rejected';
  uploadedAt: Date;
  verifiedAt?: Date;
  rejectionReason?: string;
}

export interface KYCProfile {
  userId: string;
  firstName: string;
  lastName: string;
  dateOfBirth: Date;
  address: string;
  documents: KYCDocument[];
  overallStatus: 'pending' | 'verified' | 'rejected';
  verificationScore: number;
  lastUpdated: Date;
}

interface UseKYCVerificationReturn {
  profile: KYCProfile | null;
  documents: KYCDocument[];
  isVerified: boolean;
  loading: boolean;
  error: Error | null;
  fetchProfile: () => Promise<void>;
  uploadDocument: (type: string, fileUri: string) => Promise<boolean>;
  submitForVerification: () => Promise<boolean>;
  getDocumentStatus: (type: string) => string;
  resubmitDocument: (documentId: string, fileUri: string) => Promise<boolean>;
}

const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000';

export const useKYCVerification = (token: string | null, userId: string): UseKYCVerificationReturn => {
  const [profile, setProfile] = useState<KYCProfile | null>(null);
  const [documents, setDocuments] = useState<KYCDocument[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const fetchProfile = useCallback(async () => {
    if (!token) {return;}
    setLoading(true);
    try {
      const response = await axios.get(
        `${API_BASE_URL}/kyc/profile/${userId}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setProfile(response.data.profile || null);
      setDocuments(response.data.documents || []);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to fetch KYC profile'));
    } finally {
      setLoading(false);
    }
  }, [token, userId]);

  const uploadDocument = useCallback(
    async (type: string, fileUri: string): Promise<boolean> => {
      if (!token) {return false;}
      try {
        const formData = new FormData();
        formData.append('type', type);
        formData.append('document', {
          uri: fileUri,
          type: 'application/pdf',
          name: `${type}_${userId}.pdf`,
        } as any);

        const response = await axios.post(
          `${API_BASE_URL}/kyc/documents/upload`,
          formData,
          {
            headers: {
              Authorization: `Bearer ${token}`,
              'Content-Type': 'multipart/form-data',
            },
          }
        );

        setDocuments((prev) => [...prev, response.data]);
        return true;
      } catch (err) {
        setError(err instanceof Error ? err : new Error('Failed to upload document'));
        return false;
      }
    },
    [token, userId]
  );

  const submitForVerification = useCallback(async (): Promise<boolean> => {
    if (!token) {return false;}
    try {
      const response = await axios.post(
        `${API_BASE_URL}/kyc/submit-for-verification`,
        { userId },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setProfile(response.data);
      return true;
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to submit for verification'));
      return false;
    }
  }, [token, userId]);

  const getDocumentStatus = useCallback(
    (type: string): string => {
      const doc = documents.find((d) => d.type === type);
      return doc?.status || 'not_uploaded';
    },
    [documents]
  );

  const resubmitDocument = useCallback(
    async (documentId: string, fileUri: string): Promise<boolean> => {
      if (!token) {return false;}
      try {
        const formData = new FormData();
        formData.append('document', {
          uri: fileUri,
          type: 'application/pdf',
          name: `${documentId}.pdf`,
        } as any);

        const response = await axios.post(
          `${API_BASE_URL}/kyc/documents/${documentId}/resubmit`,
          formData,
          {
            headers: {
              Authorization: `Bearer ${token}`,
              'Content-Type': 'multipart/form-data',
            },
          }
        );

        setDocuments((prev) =>
          prev.map((d) => (d.id === documentId ? response.data : d))
        );
        return true;
      } catch (err) {
        setError(err instanceof Error ? err : new Error('Failed to resubmit document'));
        return false;
      }
    },
    [token]
  );

  return {
    profile,
    documents,
    isVerified: profile?.overallStatus === 'verified',
    loading,
    error,
    fetchProfile,
    uploadDocument,
    submitForVerification,
    getDocumentStatus,
    resubmitDocument,
  };
};
