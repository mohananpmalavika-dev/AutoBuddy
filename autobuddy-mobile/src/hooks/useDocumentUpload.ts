import { useState, useCallback } from 'react';
import * as FileSystem from 'expo-file-system';
import * as DocumentPicker from 'expo-document-picker';
import axios from 'axios';

export interface Document {
  id: string;
  type: 'license' | 'registration' | 'insurance' | 'pollution' | 'aadhar' | 'pan' | 'bank';
  userId: string;
  fileUrl: string;
  status: 'pending' | 'approved' | 'rejected' | 'expired';
  uploadedAt: Date;
  expiryDate?: Date;
  rejectionReason?: string;
}

export interface DocumentUploadProgress {
  fileName: string;
  progress: number;
  status: 'idle' | 'uploading' | 'success' | 'error';
  error?: string;
}

interface UseDocumentUploadReturn {
  documents: Document[];
  uploadProgress: Record<string, DocumentUploadProgress>;
  loading: boolean;
  error: Error | null;
  uploadDocument: (type: Document['type'], filePath: string) => Promise<Document | null>;
  deleteDocument: (documentId: string) => Promise<boolean>;
  fetchDocuments: () => Promise<void>;
  getDocumentsByType: (type: Document['type']) => Document[];
  getApprovedDocuments: () => Document[];
  getPendingDocuments: () => Document[];
  getExpiredDocuments: () => Document[];
  retryUpload: (documentId: string) => Promise<boolean>;
}

export const useDocumentUpload = (token: string | null, userId: string): UseDocumentUploadReturn => {
  const [documents, setDocuments] = useState<Document[]>([]);
  const [uploadProgress, setUploadProgress] = useState<Record<string, DocumentUploadProgress>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000';

  const fetchDocuments = useCallback(async () => {
    if (!token) {return;}
    setLoading(true);
    try {
      const response = await axios.get(`${API_BASE_URL}/documents/${userId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setDocuments(response.data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to fetch documents'));
    } finally {
      setLoading(false);
    }
  }, [token, userId, API_BASE_URL]);

  const uploadDocument = useCallback(
    async (type: Document['type'], filePath: string): Promise<Document | null> => {
      if (!token) {return null;}

      const fileName = filePath.split('/').pop() || 'document';
      const key = `${type}_${Date.now()}`;

      setUploadProgress((prev) => ({
        ...prev,
        [key]: { fileName, progress: 0, status: 'uploading' },
      }));

      try {
        const fileInfo = await FileSystem.getInfoAsync(filePath);
        if (!fileInfo.exists) {throw new Error('File not found');}

        const formData = new FormData();
        formData.append('file', {
          uri: filePath,
          type: 'application/pdf',
          name: fileName,
        } as any);
        formData.append('type', type);
        formData.append('userId', userId);

        const response = await axios.post(`${API_BASE_URL}/documents/upload`, formData, {
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'multipart/form-data',
          },
          onUploadProgress: (progressEvent) => {
            const percentCompleted = Math.round((progressEvent.loaded * 100) / progressEvent.total);
            setUploadProgress((prev) => ({
              ...prev,
              [key]: { fileName, progress: percentCompleted, status: 'uploading' },
            }));
          },
        });

        const newDocument: Document = response.data;
        setDocuments((prev) => [...prev, newDocument]);

        setUploadProgress((prev) => ({
          ...prev,
          [key]: { fileName, progress: 100, status: 'success' },
        }));

        setTimeout(() => {
          setUploadProgress((prev) => {
            const updated = { ...prev };
            delete updated[key];
            return updated;
          });
        }, 2000);

        setError(null);
        return newDocument;
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : 'Upload failed';
        setUploadProgress((prev) => ({
          ...prev,
          [key]: { fileName, progress: 0, status: 'error', error: errorMsg },
        }));
        setError(err instanceof Error ? err : new Error(errorMsg));
        return null;
      }
    },
    [token, userId, API_BASE_URL]
  );

  const deleteDocument = useCallback(
    async (documentId: string): Promise<boolean> => {
      if (!token) {return false;}
      try {
        await axios.delete(`${API_BASE_URL}/documents/${documentId}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        setDocuments((prev) => prev.filter((doc) => doc.id !== documentId));
        setError(null);
        return true;
      } catch (err) {
        setError(err instanceof Error ? err : new Error('Failed to delete document'));
        return false;
      }
    },
    [token, API_BASE_URL]
  );

  const retryUpload = useCallback(
    async (documentId: string): Promise<boolean> => {
      const doc = documents.find((d) => d.id === documentId);
      if (!doc) {return false;}

      try {
        const response = await axios.post(
          `${API_BASE_URL}/documents/${documentId}/retry`,
          {},
          { headers: { Authorization: `Bearer ${token}` } }
        );

        setDocuments((prev) =>
          prev.map((d) => (d.id === documentId ? { ...d, status: response.data.status } : d))
        );
        return true;
      } catch (err) {
        setError(err instanceof Error ? err : new Error('Retry failed'));
        return false;
      }
    },
    [token, documents, API_BASE_URL]
  );

  const getDocumentsByType = useCallback(
    (type: Document['type']) => documents.filter((doc) => doc.type === type),
    [documents]
  );

  const getApprovedDocuments = useCallback(
    () => documents.filter((doc) => doc.status === 'approved'),
    [documents]
  );

  const getPendingDocuments = useCallback(
    () => documents.filter((doc) => doc.status === 'pending'),
    [documents]
  );

  const getExpiredDocuments = useCallback(() => {
    const now = new Date();
    return documents.filter((doc) => doc.expiryDate && new Date(doc.expiryDate) < now);
  }, [documents]);

  return {
    documents,
    uploadProgress,
    loading,
    error,
    uploadDocument,
    deleteDocument,
    fetchDocuments,
    getDocumentsByType,
    getApprovedDocuments,
    getPendingDocuments,
    getExpiredDocuments,
    retryUpload,
  };
};
