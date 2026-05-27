import React, { useEffect, useRef } from 'react';
import {
  ActivityIndicator,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { COLORS, SHADOWS, TYPOGRAPHY } from '../theme';

/**
 * LocationSearchModal Component
 * 
 * PROBLEM SOLVED: Location search suggestions displayed inline cause 4+ scrolls
 * 
 * SOLUTION: Shows location suggestions in a modal overlay instead of inline
 * - Modal appears above booking form, doesn't push content down
 * - Scrollable suggestion list with max height
 * - Auto-closes when location selected
 * - Dismissible by tapping outside or close button
 * 
 * PROPS:
 * - visible: boolean - Whether modal is visible
 * - suggestions: Array<{placeId, description}> - Location suggestions
 * - searching: boolean - Loading state
 * - onSelect: Function(location) - Callback when location selected
 * - onClose: Function() - Callback when modal dismissed
 * - title: string - Modal title (e.g., "Find Pickup Location")
 * - t: object - Translation strings
 */
export default function LocationSearchModal({
  visible,
  suggestions = [],
  searching = false,
  onSelect = () => {},
  onClose = () => {},
  title = 'Select Location',
  t = {},
}) {
  const scrollViewRef = useRef(null);

  // Auto-scroll to top when suggestions update
  useEffect(() => {
    if (visible && scrollViewRef.current) {
      scrollViewRef.current.scrollTo({ y: 0, animated: false });
    }
  }, [visible, suggestions]);

  const handleSelectLocation = (location) => {
    // Close modal and notify parent
    onSelect(location);
    onClose();
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      hardwareAccelerated>
      {/* Backdrop - dismisses modal on tap */}
      <TouchableOpacity
        style={styles.backdrop}
        activeOpacity={1}
        onPress={onClose}
      />

      {/* Modal Content Card */}
      <View style={styles.centeredView}>
        <View style={styles.modalCard}>
          {/* Header */}
          <View style={styles.headerContainer}>
            <Text style={styles.modalTitle}>{title}</Text>
            <TouchableOpacity
              style={styles.closeButton}
              onPress={onClose}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
              <Text style={styles.closeButtonText}>✕</Text>
            </TouchableOpacity>
          </View>

          {/* Divider */}
          <View style={styles.divider} />

          {/* Suggestions List */}
          <ScrollView
            ref={scrollViewRef}
            style={styles.suggestionsScroll}
            contentContainerStyle={styles.suggestionsContent}
            showsVerticalScrollIndicator={true}
            keyboardShouldPersistTaps="handled">
            {searching ? (
              <View style={styles.centerContent}>
                <ActivityIndicator color={COLORS.primary} size="large" />
                <Text style={styles.searchingText}>{t.searching || 'Searching...'}</Text>
              </View>
            ) : suggestions.length === 0 ? (
              <View style={styles.centerContent}>
                <Text style={styles.emptyText}>
                  {t.noSuggestionsFound || 'No locations found'}
                </Text>
              </View>
            ) : (
              suggestions.map((item, index) => (
                <TouchableOpacity
                  key={`location-${item.placeId || index}`}
                  style={styles.suggestionItem}
                  onPress={() => handleSelectLocation(item)}
                  activeOpacity={0.7}>
                  {/* Location Pin Icon */}
                  <View style={styles.iconContainer}>
                    <Text style={styles.pinIcon}>📍</Text>
                  </View>

                  {/* Location Details */}
                  <View style={styles.locationDetails}>
                    <Text style={styles.locationName} numberOfLines={2}>
                      {item.description}
                    </Text>
                  </View>

                  {/* Chevron */}
                  <Text style={styles.chevron}>›</Text>
                </TouchableOpacity>
              ))
            )}
          </ScrollView>

          {/* Footer Help Text */}
          <View style={styles.footer}>
            <Text style={styles.footerText}>
              {t.selectLocationToClose || 'Tap a location to select'}
            </Text>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
  },
  centeredView: {
    flex: 1,
    justifyContent: 'flex-end',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingBottom: 20,
  },
  modalCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    width: '100%',
    maxHeight: '70%',
    minHeight: 300,
    ...SHADOWS.card,
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column',
  },

  // Header
  headerContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: COLORS.textMain,
  },
  closeButton: {
    width: 32,
    height: 32,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 16,
    backgroundColor: '#F0F2F1',
  },
  closeButtonText: {
    fontSize: 18,
    color: COLORS.textMuted,
    fontWeight: '600',
  },

  // Divider
  divider: {
    height: 1,
    backgroundColor: '#E0E0E0',
  },

  // Suggestions List
  suggestionsScroll: {
    flex: 1,
  },
  suggestionsContent: {
    paddingHorizontal: 8,
    paddingVertical: 8,
  },

  // Center Content (for loading, empty state)
  centerContent: {
    flex: 1,
    minHeight: 200,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 32,
  },
  searchingText: {
    marginTop: 12,
    fontSize: 14,
    color: COLORS.textMuted,
    fontWeight: '500',
  },
  emptyText: {
    fontSize: 14,
    color: COLORS.textMuted,
    textAlign: 'center',
    fontWeight: '500',
  },

  // Suggestion Item
  suggestionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 14,
    marginVertical: 4,
    borderRadius: 10,
    backgroundColor: '#FAFBFA',
    borderWidth: 1,
    borderColor: '#E0E0E0',
  },

  // Icon
  iconContainer: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#E8F5E9',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  pinIcon: {
    fontSize: 18,
  },

  // Location Details
  locationDetails: {
    flex: 1,
    marginRight: 8,
  },
  locationName: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.textMain,
    lineHeight: 18,
  },

  // Chevron
  chevron: {
    fontSize: 24,
    color: '#9E9E9E',
    fontWeight: '300',
  },

  // Footer
  footer: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: '#F9FBFA',
    borderTopWidth: 1,
    borderTopColor: '#E0E0E0',
  },
  footerText: {
    fontSize: 12,
    color: COLORS.textMuted,
    textAlign: 'center',
    fontWeight: '500',
  },
});
