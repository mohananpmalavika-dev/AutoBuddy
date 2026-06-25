import React, { useState, useRef } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, TextInput, Modal, Alert, ActivityIndicator } from 'react-native';
import { apiRequest } from '../lib/api';

const REPORT_CATEGORIES = [
  { label: 'Broken footpath', value: 'broken_footpath' },
  { label: 'Missing light', value: 'missing_light' },
  { label: 'Dangerous crossing', value: 'dangerous_crossing' },
  { label: 'Cycle lane issue', value: 'cycle_lane_issue' },
  { label: 'Pothole', value: 'pothole' },
  { label: 'Water logging', value: 'waterlogging' },
  { label: 'Other', value: 'other' },
];

export default function SafePathReportModal({ visible, onClose, location, userId }) {
  const [category, setCategory] = useState('');
  const [description, setDescription] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const fileInputRef = useRef(null);

  const handleFileSelect = (e) => {
    const file = e.target?.files?.[0];
    if (file) {
      // In a real app, upload to cloud storage and get URL
      // For now, use a data URL or placeholder
      const reader = new FileReader();
      reader.onload = () => {
        setImageUrl(reader.result);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSubmit = async () => {
    if (!category || !location) {
      Alert.alert('Missing fields', 'Please select a category and location');
      return;
    }

    const payload = {
      user_id: userId,
      latitude: location.latitude,
      longitude: location.longitude,
      category,
      description,
      image_url: imageUrl,
    };

    try {
      setLoading(true);
      const res = await apiRequest('/api/safepath/report', { method: 'POST', body: JSON.stringify(payload) });
      Alert.alert('Success', 'Thank you! Your report has been submitted.');
      // Reset form
      setCategory('');
      setDescription('');
      setImageUrl('');
      onClose();
    } catch (e) {
      console.error('Report submission error', e);
      Alert.alert('Error', 'Failed to submit report. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide">
      <View style={styles.overlay}>
        <View style={styles.modal}>
          <View style={styles.header}>
            <Text style={styles.title}>Report Safety Issue</Text>
            <TouchableOpacity onPress={onClose}>
              <Text style={styles.close}>✕</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.content}>
            {/* Category selector */}
            <Text style={styles.label}>Category</Text>
            <View style={styles.categoryGrid}>
              {REPORT_CATEGORIES.map((cat) => (
                <TouchableOpacity
                  key={cat.value}
                  onPress={() => setCategory(cat.value)}
                  style={[styles.categoryButton, category === cat.value && styles.categoryButtonActive]}
                >
                  <Text style={[styles.categoryText, category === cat.value && styles.categoryTextActive]}>
                    {cat.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Description */}
            <Text style={styles.label}>Description (optional)</Text>
            <TextInput
              style={styles.textArea}
              placeholder="Add details about the issue..."
              multiline
              numberOfLines={4}
              value={description}
              onChangeText={setDescription}
              placeholderTextColor="#999"
            />

            {/* Photo upload */}
            <Text style={styles.label}>Photo (optional)</Text>
            <TouchableOpacity
              style={styles.uploadButton}
              onPress={() => fileInputRef.current?.click()}
            >
              <Text style={styles.uploadText}>
                {imageUrl ? '✓ Photo attached' : '📷 Upload photo'}
              </Text>
            </TouchableOpacity>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleFileSelect}
              style={{ display: 'none' }}
            />

            {/* Location display */}
            <Text style={styles.label}>Location</Text>
            <Text style={styles.locationText}>
              {location?.latitude?.toFixed(4)}, {location?.longitude?.toFixed(4)}
            </Text>

            {/* Submit button */}
            <TouchableOpacity
              style={[styles.submitButton, loading && styles.submitButtonDisabled]}
              onPress={handleSubmit}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text style={styles.submitText}>Submit Report</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modal: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    maxHeight: '85%',
    paddingTop: 16,
    paddingBottom: 24,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    marginBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#EEE',
    paddingBottom: 12,
  },
  title: {
    fontSize: 16,
    fontWeight: '900',
  },
  close: {
    fontSize: 24,
    color: '#666',
  },
  content: {
    paddingHorizontal: 16,
  },
  label: {
    fontSize: 12,
    fontWeight: '700',
    color: '#0F2F1E',
    marginTop: 12,
    marginBottom: 8,
  },
  categoryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 12,
  },
  categoryButton: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 18,
    backgroundColor: '#F3F3F3',
    borderWidth: 1,
    borderColor: '#DDD',
  },
  categoryButtonActive: {
    backgroundColor: '#0B8F3A',
    borderColor: '#0B8F3A',
  },
  categoryText: {
    fontSize: 11,
    color: '#333',
    fontWeight: '600',
  },
  categoryTextActive: {
    color: '#fff',
  },
  textArea: {
    borderWidth: 1,
    borderColor: '#DDD',
    borderRadius: 8,
    padding: 10,
    fontSize: 13,
    color: '#333',
    minHeight: 80,
  },
  uploadButton: {
    borderWidth: 2,
    borderColor: '#0B8F3A',
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
    backgroundColor: 'rgba(11, 143, 58, 0.05)',
  },
  uploadText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#0B8F3A',
  },
  locationText: {
    fontSize: 12,
    color: '#666',
    backgroundColor: '#F5F5F5',
    padding: 8,
    borderRadius: 6,
  },
  submitButton: {
    backgroundColor: '#0B8F3A',
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 16,
  },
  submitButtonDisabled: {
    backgroundColor: '#CCC',
  },
  submitText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 14,
  },
});
