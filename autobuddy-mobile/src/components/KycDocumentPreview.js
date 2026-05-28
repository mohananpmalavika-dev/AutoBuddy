/**
 * KycDocumentPreview.js - Modal for viewing KYC documents (ID, License, RC, Insurance)
 * Allows zooming, rotating, and verifying driver documents
 * 
 * Usage:
 * <KycDocumentPreview
 *   visible={showPreview}
 *   documents={{
 *     id_proof: 'https://...',
 *     driving_license: 'https://...',
 *     vehicle_rc: 'https://...',
 *     insurance: 'https://...',
 *   }}
 *   onClose={handleClose}
 * />
 */

import React, { useState } from 'react';
import {
  Modal,
  View,
  Text,
  Image,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { COLORS } from '../theme';

const KycDocumentPreview = ({
  visible = false,
  documents = {},
  driverName = '',
  onClose,
  onApprove,
  onReject,
  isLoading = false,
}) => {
  const [selectedDocType, setSelectedDocType] = useState(null);
  const [imageLoading, setImageLoading] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);

  const docTypes = [
    { key: 'id_proof', label: 'ID Proof', required: true },
    { key: 'driving_license', label: 'Driving License', required: true },
    { key: 'vehicle_rc', label: 'Vehicle RC', required: true },
    { key: 'insurance', label: 'Insurance', required: true },
    { key: 'pollution_cert', label: 'Pollution Certificate', required: false },
    { key: 'badge_photo', label: 'Badge Photo', required: false },
  ];

  const availableDocs = docTypes.filter(
    (doc) => documents[doc.key]
  );

  const currentDoc = selectedDocType
    ? documents[selectedDocType.key]
    : null;

  const missingRequired = docTypes.filter(
    (doc) => doc.required && !documents[doc.key]
  );

  const handleDocSelect = (docType) => {
    setSelectedDocType(docType);
    setZoom(1);
    setRotation(0);
  };

  const handleZoomIn = () => {
    setZoom(Math.min(zoom + 0.5, 3));
  };

  const handleZoomOut = () => {
    setZoom(Math.max(zoom - 0.5, 1));
  };

  const handleRotate = () => {
    setRotation((rotation + 90) % 360);
  };

  const handleReset = () => {
    setZoom(1);
    setRotation(0);
  };

  const handleClose = () => {
    setSelectedDocType(null);
    setZoom(1);
    setRotation(0);
    onClose?.();
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={false}
      onRequestClose={handleClose}
    >
      <View style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={handleClose} style={styles.closeButton}>
            <Text style={styles.closeButtonText}>✕ Close</Text>
          </TouchableOpacity>
          <Text style={styles.title}>KYC Documents</Text>
          <Text style={styles.driverName}>{driverName}</Text>
        </View>

        {selectedDocType ? (
          // Document viewer
          <View style={styles.viewerContainer}>
            {/* Document image */}
            <View style={styles.imageContainer}>
              {imageLoading && (
                <ActivityIndicator
                  size="large"
                  color={COLORS.primary}
                  style={styles.loadingIndicator}
                />
              )}
              <Image
                source={{ uri: currentDoc }}
                style={[
                  styles.image,
                  {
                    transform: [
                      { scale: zoom },
                      { rotate: `${rotation}deg` },
                    ],
                  },
                ]}
                onLoadStart={() => setImageLoading(true)}
                onLoadEnd={() => setImageLoading(false)}
                resizeMode="contain"
              />
            </View>

            {/* Controls */}
            <View style={styles.controlsRow}>
              <TouchableOpacity
                style={styles.controlButton}
                onPress={handleZoomOut}
                disabled={zoom <= 1}
              >
                <Text style={styles.controlButtonText}>🔍−</Text>
              </TouchableOpacity>
              <Text style={styles.zoomText}>{Math.round(zoom * 100)}%</Text>
              <TouchableOpacity
                style={styles.controlButton}
                onPress={handleZoomIn}
                disabled={zoom >= 3}
              >
                <Text style={styles.controlButtonText}>🔍+</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.controlButton}
                onPress={handleRotate}
              >
                <Text style={styles.controlButtonText}>↻ Rotate</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.controlButton}
                onPress={handleReset}
              >
                <Text style={styles.controlButtonText}>↺ Reset</Text>
              </TouchableOpacity>
            </View>

            {/* Document info */}
            <View style={styles.docInfoContainer}>
              <Text style={styles.docLabel}>
                {selectedDocType.label}
              </Text>
              <Text style={styles.docStatus}>
                {selectedDocType.required
                  ? '✓ Required'
                  : '○ Optional'}
              </Text>
            </View>

            {/* Action buttons */}
            <View style={styles.actionButtonsContainer}>
              <TouchableOpacity
                style={[styles.actionButton, styles.rejectButton]}
                onPress={() => onReject?.(selectedDocType.key)}
                disabled={isLoading}
              >
                <Text style={styles.rejectButtonText}>👎 Unclear</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.actionButton, styles.approveButton]}
                onPress={() => onApprove?.(selectedDocType.key)}
                disabled={isLoading}
              >
                <Text style={styles.approveButtonText}>👍 Clear</Text>
              </TouchableOpacity>
            </View>

            {/* Back to list button */}
            <TouchableOpacity
              style={styles.backButton}
              onPress={() => setSelectedDocType(null)}
            >
              <Text style={styles.backButtonText}>← Back to Documents List</Text>
            </TouchableOpacity>
          </View>
        ) : (
          // Document list
          <ScrollView style={styles.listContainer}>
            {/* Missing documents warning */}
            {missingRequired.length > 0 && (
              <View style={styles.warningBox}>
                <Text style={styles.warningTitle}>⚠️ Missing Documents</Text>
                <Text style={styles.warningText}>
                  {missingRequired.map((d) => d.label).join(', ')} required
                </Text>
              </View>
            )}

            {/* Quality indicator */}
            <View style={styles.qualityBox}>
              <Text style={styles.qualityLabel}>Document Quality Score</Text>
              <View style={styles.qualityBar}>
                <View
                  style={[
                    styles.qualityFill,
                    {
                      width: `${(availableDocs.length / docTypes.length) * 100}%`,
                      backgroundColor:
                        availableDocs.length === docTypes.length
                          ? COLORS.success
                          : availableDocs.length >= docTypes.length - 1
                          ? COLORS.warning
                          : COLORS.danger,
                    },
                  ]}
                />
              </View>
              <Text style={styles.qualityText}>
                {availableDocs.length} / {docTypes.length} documents
              </Text>
            </View>

            {/* Document list */}
            <View style={styles.documentsGrid}>
              {docTypes.map((docType) => {
                const hasDoc = !!documents[docType.key];
                return (
                  <TouchableOpacity
                    key={docType.key}
                    style={[
                      styles.docCard,
                      hasDoc ? styles.docCardActive : styles.docCardInactive,
                    ]}
                    onPress={() => {
                      if (hasDoc) {
                        handleDocSelect(docType);
                      }
                    }}
                    disabled={!hasDoc}
                  >
                    <Text
                      style={[
                        styles.docCardIcon,
                        hasDoc ? styles.docCardIconActive : styles.docCardIconInactive,
                      ]}
                    >
                      {hasDoc ? '📄' : '❌'}
                    </Text>
                    <Text
                      style={[
                        styles.docCardLabel,
                        hasDoc ? styles.docCardLabelActive : styles.docCardLabelInactive,
                      ]}
                    >
                      {docType.label}
                    </Text>
                    {docType.required && (
                      <Text style={styles.docCardRequired}>Required</Text>
                    )}
                    {hasDoc && (
                      <Text style={styles.docCardTap}>Tap to view</Text>
                    )}
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Overall action buttons */}
            <View style={styles.overallActionsContainer}>
              <TouchableOpacity
                style={[styles.overallButton, styles.rejectOverallButton]}
                onPress={() => onReject?.('all')}
                disabled={isLoading || missingRequired.length > 0}
              >
                {isLoading ? (
                  <ActivityIndicator color={COLORS.white} />
                ) : (
                  <Text style={styles.rejectOverallButtonText}>
                    👎 Reject All
                  </Text>
                )}
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.overallButton, styles.approveOverallButton]}
                onPress={() => onApprove?.('all')}
                disabled={isLoading || missingRequired.length > 0}
              >
                {isLoading ? (
                  <ActivityIndicator color={COLORS.white} />
                ) : (
                  <Text style={styles.approveOverallButtonText}>
                    ✓ Approve All
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          </ScrollView>
        )}
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.white,
  },
  header: {
    backgroundColor: COLORS.primary,
    paddingTop: 12,
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  closeButton: {
    alignSelf: 'flex-start',
    marginBottom: 8,
  },
  closeButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.white,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: COLORS.white,
  },
  driverName: {
    fontSize: 12,
    color: COLORS.white + 'CC',
    marginTop: 4,
  },
  viewerContainer: {
    flex: 1,
  },
  imageContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F5F5F5',
  },
  image: {
    width: '100%',
    height: '100%',
  },
  loadingIndicator: {
    position: 'absolute',
  },
  controlsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.lightGrey,
    backgroundColor: COLORS.white,
    paddingHorizontal: 16,
  },
  controlButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: COLORS.lightGrey,
    borderRadius: 6,
  },
  controlButtonText: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.darkGrey,
  },
  zoomText: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.darkGrey,
    minWidth: 50,
    textAlign: 'center',
  },
  docInfoContainer: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.lightGrey,
    backgroundColor: COLORS.lightGrey,
  },
  docLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.dark,
  },
  docStatus: {
    fontSize: 12,
    color: COLORS.darkGrey,
    marginTop: 4,
  },
  actionButtonsContainer: {
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  actionButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 6,
    justifyContent: 'center',
    alignItems: 'center',
  },
  approveButton: {
    backgroundColor: '#4CAF50',
  },
  approveButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.white,
  },
  rejectButton: {
    backgroundColor: '#FF9800',
  },
  rejectButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.white,
  },
  backButton: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: COLORS.lightGrey,
  },
  backButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.primary,
    textAlign: 'center',
  },
  listContainer: {
    flex: 1,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  warningBox: {
    backgroundColor: '#FFF3CD',
    borderWidth: 1,
    borderColor: '#FFC107',
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 16,
  },
  warningTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#856404',
  },
  warningText: {
    fontSize: 12,
    color: '#856404',
    marginTop: 4,
  },
  qualityBox: {
    backgroundColor: COLORS.lightGrey,
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 12,
    marginBottom: 16,
  },
  qualityLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.darkGrey,
    marginBottom: 8,
  },
  qualityBar: {
    width: '100%',
    height: 8,
    backgroundColor: COLORS.white,
    borderRadius: 4,
    overflow: 'hidden',
    marginBottom: 8,
    borderWidth: 1,
    borderColor: COLORS.grey,
  },
  qualityFill: {
    height: '100%',
  },
  qualityText: {
    fontSize: 12,
    color: COLORS.darkGrey,
  },
  documentsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 16,
  },
  docCard: {
    width: '48%',
    paddingHorizontal: 12,
    paddingVertical: 16,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
  },
  docCardActive: {
    backgroundColor: COLORS.primary + '10',
    borderColor: COLORS.primary,
  },
  docCardInactive: {
    backgroundColor: COLORS.lightGrey,
    borderColor: COLORS.grey,
  },
  docCardIcon: {
    fontSize: 24,
    marginBottom: 8,
  },
  docCardIconActive: {
    color: COLORS.primary,
  },
  docCardIconInactive: {
    color: COLORS.grey,
  },
  docCardLabel: {
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'center',
  },
  docCardLabelActive: {
    color: COLORS.dark,
  },
  docCardLabelInactive: {
    color: COLORS.grey,
  },
  docCardRequired: {
    fontSize: 10,
    color: COLORS.primary,
    fontWeight: '500',
    marginTop: 4,
  },
  docCardTap: {
    fontSize: 10,
    color: COLORS.primary,
    marginTop: 4,
    fontStyle: 'italic',
  },
  overallActionsContainer: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 24,
  },
  overallButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 6,
    justifyContent: 'center',
    alignItems: 'center',
  },
  approveOverallButton: {
    backgroundColor: '#4CAF50',
  },
  approveOverallButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.white,
  },
  rejectOverallButton: {
    backgroundColor: '#FF9800',
  },
  rejectOverallButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.white,
  },
});

export default KycDocumentPreview;
