/**
 * PaginationControls.js - Reusable pagination component
 * Shows page numbers, prev/next buttons, and page size selector
 * 
 * Usage:
 * <PaginationControls 
 *   currentPage={page}
 *   pageSize={pageSize}
 *   totalItems={total}
 *   onPageChange={setPage}
 *   onPageSizeChange={setPageSize}
 * />
 */

import React from 'react';
import {
  View,
  StyleSheet,
  TouchableOpacity,
  Text,
  ScrollView,
} from 'react-native';
import { COLORS } from '../theme';

const PaginationControls = ({
  currentPage = 1,
  pageSize = 25,
  totalItems = 0,
  onPageChange,
  onPageSizeChange,
  disabled = false,
}) => {
  const totalPages = Math.ceil(totalItems / pageSize) || 1;
  const startItem = (currentPage - 1) * pageSize + 1;
  const endItem = Math.min(currentPage * pageSize, totalItems);

  const pageSizeOptions = [10, 25, 50, 100];
  const maxVisiblePages = 5;

  // Calculate which pages to show
  const getVisiblePages = () => {
    const pages = [];
    let start = Math.max(1, currentPage - Math.floor(maxVisiblePages / 2));
    let end = Math.min(totalPages, start + maxVisiblePages - 1);

    // Adjust start if we're near the end
    if (end - start + 1 < maxVisiblePages) {
      start = Math.max(1, end - maxVisiblePages + 1);
    }

    for (let i = start; i <= end; i++) {
      pages.push(i);
    }

    return pages;
  };

  const visiblePages = getVisiblePages();

  const handlePrevious = () => {
    if (currentPage > 1 && !disabled) {
      onPageChange(currentPage - 1);
    }
  };

  const handleNext = () => {
    if (currentPage < totalPages && !disabled) {
      onPageChange(currentPage + 1);
    }
  };

  if (totalItems === 0) {
    return null;
  }

  return (
    <View style={styles.container}>
      {/* Info text */}
      <View style={styles.infoContainer}>
        <Text style={styles.infoText}>
          Showing {startItem} - {endItem} of {totalItems}
        </Text>

        {/* Page size selector */}
        <View style={styles.pageSizeContainer}>
          <Text style={styles.pageSizeLabel}>Items per page:</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.pageSizeScroll}
          >
            {pageSizeOptions.map((size) => (
              <TouchableOpacity
                key={size}
                style={[
                  styles.pageSizeButton,
                  pageSize === size && styles.pageSizeButtonActive,
                ]}
                onPress={() => {
                  if (!disabled) {
                    onPageSizeChange(size);
                    onPageChange(1); // Reset to page 1 when changing page size
                  }
                }}
                disabled={disabled}
              >
                <Text
                  style={[
                    styles.pageSizeButtonText,
                    pageSize === size && styles.pageSizeButtonTextActive,
                  ]}
                >
                  {size}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      </View>

      {/* Pagination controls */}
      <View style={styles.controlsContainer}>
        {/* Previous button */}
        <TouchableOpacity
          style={[
            styles.navButton,
            (currentPage === 1 || disabled) && styles.navButtonDisabled,
          ]}
          onPress={handlePrevious}
          disabled={currentPage === 1 || disabled}
        >
          <Text
            style={[
              styles.navButtonText,
              (currentPage === 1 || disabled) && styles.navButtonTextDisabled,
            ]}
          >
            ← Previous
          </Text>
        </TouchableOpacity>

        {/* Page numbers */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.pagesContainer}
        >
          {/* First page */}
          {!visiblePages.includes(1) && totalPages > maxVisiblePages && (
            <>
              <TouchableOpacity
                style={styles.pageButton}
                onPress={() => onPageChange(1)}
                disabled={disabled}
              >
                <Text style={styles.pageButtonText}>1</Text>
              </TouchableOpacity>
              <Text style={styles.pageEllipsis}>...</Text>
            </>
          )}

          {/* Visible pages */}
          {visiblePages.map((page) => (
            <TouchableOpacity
              key={page}
              style={[
                styles.pageButton,
                currentPage === page && styles.pageButtonActive,
              ]}
              onPress={() => {
                if (!disabled) {
                  onPageChange(page);
                }
              }}
              disabled={disabled}
            >
              <Text
                style={[
                  styles.pageButtonText,
                  currentPage === page && styles.pageButtonTextActive,
                ]}
              >
                {page}
              </Text>
            </TouchableOpacity>
          ))}

          {/* Last page */}
          {!visiblePages.includes(totalPages) && totalPages > maxVisiblePages && (
            <>
              <Text style={styles.pageEllipsis}>...</Text>
              <TouchableOpacity
                style={styles.pageButton}
                onPress={() => onPageChange(totalPages)}
                disabled={disabled}
              >
                <Text style={styles.pageButtonText}>{totalPages}</Text>
              </TouchableOpacity>
            </>
          )}
        </ScrollView>

        {/* Next button */}
        <TouchableOpacity
          style={[
            styles.navButton,
            (currentPage === totalPages || disabled) && styles.navButtonDisabled,
          ]}
          onPress={handleNext}
          disabled={currentPage === totalPages || disabled}
        >
          <Text
            style={[
              styles.navButtonText,
              (currentPage === totalPages || disabled) && styles.navButtonTextDisabled,
            ]}
          >
            Next →
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: COLORS.white,
    borderTopWidth: 1,
    borderTopColor: COLORS.lightGrey,
    paddingVertical: 12,
    paddingHorizontal: 16,
    marginTop: 16,
  },
  infoContainer: {
    marginBottom: 12,
  },
  infoText: {
    fontSize: 12,
    color: COLORS.darkGrey,
    marginBottom: 8,
  },
  pageSizeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  pageSizeLabel: {
    fontSize: 12,
    color: COLORS.darkGrey,
    marginRight: 8,
  },
  pageSizeScroll: {
    flexDirection: 'row',
  },
  pageSizeButton: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginRight: 6,
    borderWidth: 1,
    borderColor: COLORS.lightGrey,
    borderRadius: 4,
    backgroundColor: COLORS.white,
  },
  pageSizeButtonActive: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  pageSizeButtonText: {
    fontSize: 12,
    color: COLORS.darkGrey,
  },
  pageSizeButtonTextActive: {
    color: COLORS.white,
    fontWeight: '600',
  },
  controlsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  navButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: COLORS.primary,
    borderRadius: 4,
    backgroundColor: COLORS.white,
  },
  navButtonDisabled: {
    borderColor: COLORS.lightGrey,
    backgroundColor: COLORS.lightGrey,
  },
  navButtonText: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.primary,
  },
  navButtonTextDisabled: {
    color: COLORS.grey,
  },
  pagesContainer: {
    flexDirection: 'row',
    flex: 1,
    marginHorizontal: 12,
  },
  pageButton: {
    width: 32,
    height: 32,
    justifyContent: 'center',
    alignItems: 'center',
    marginHorizontal: 2,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: COLORS.lightGrey,
    backgroundColor: COLORS.white,
  },
  pageButtonActive: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  pageButtonText: {
    fontSize: 12,
    color: COLORS.darkGrey,
    fontWeight: '500',
  },
  pageButtonTextActive: {
    color: COLORS.white,
    fontWeight: '600',
  },
  pageEllipsis: {
    fontSize: 12,
    color: COLORS.darkGrey,
    marginHorizontal: 4,
    alignSelf: 'center',
  },
});

export default PaginationControls;
