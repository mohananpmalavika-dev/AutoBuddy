/**
 * AdminSearchBar.js - Search component for admin dashboard
 * Provides search, filter, and sort capabilities
 * 
 * Usage:
 * <AdminSearchBar
 *   placeholder="Search by name, email, or ID"
 *   value={searchTerm}
 *   onSearch={setSearchTerm}
 *   filterOptions={[
 *     { label: 'All', value: 'all' },
 *     { label: 'Verified', value: 'verified' },
 *   ]}
 *   selectedFilter={filter}
 *   onFilterChange={setFilter}
 * />
 */

import React, { useState } from 'react';
import {
  View,
  TextInput,
  TouchableOpacity,
  Text,
  StyleSheet,
  Modal,
} from 'react-native';
import { COLORS } from '../theme';

const AdminSearchBar = ({
  placeholder = 'Search...',
  value = '',
  onSearch,
  filterOptions = [],
  selectedFilter = 'all',
  onFilterChange,
  sortOptions = [],
  selectedSort = 'default',
  onSortChange,
  onClear,
}) => {
  const [showFilterMenu, setShowFilterMenu] = useState(false);
  const [showSortMenu, setShowSortMenu] = useState(false);

  const hasFilters = filterOptions.length > 0;
  const hasSortOptions = sortOptions.length > 0;
  const activeFilterLabel = filterOptions.find(f => f.value === selectedFilter)?.label || 'Filter';
  const activeSortLabel = sortOptions.find(s => s.value === selectedSort)?.label || 'Sort';

  const handleClear = () => {
    onSearch('');
    onClear?.();
  };

  return (
    <View style={styles.container}>
      {/* Search input */}
      <View style={styles.searchContainer}>
        <Text style={styles.searchIcon}>🔍</Text>
        <TextInput
          style={styles.input}
          placeholder={placeholder}
          placeholderTextColor={COLORS.grey}
          value={value}
          onChangeText={onSearch}
        />
        {value ? (
          <TouchableOpacity onPress={handleClear}>
            <Text style={styles.clearIcon}>✕</Text>
          </TouchableOpacity>
        ) : null}
      </View>

      {/* Filter and sort buttons */}
      {(hasFilters || hasSortOptions) && (
        <View style={styles.controlsContainer}>
          {hasFilters && (
            <>
              <TouchableOpacity
                style={styles.filterButton}
                onPress={() => setShowFilterMenu(!showFilterMenu)}
              >
                <Text style={styles.filterButtonText}>⚙️ {activeFilterLabel}</Text>
              </TouchableOpacity>
              <FilterMenu
                visible={showFilterMenu}
                options={filterOptions}
                selectedValue={selectedFilter}
                onSelect={(value) => {
                  onFilterChange?.(value);
                  setShowFilterMenu(false);
                }}
                onClose={() => setShowFilterMenu(false)}
              />
            </>
          )}

          {hasSortOptions && (
            <>
              <TouchableOpacity
                style={styles.sortButton}
                onPress={() => setShowSortMenu(!showSortMenu)}
              >
                <Text style={styles.sortButtonText}>↕️ {activeSortLabel}</Text>
              </TouchableOpacity>
              <SortMenu
                visible={showSortMenu}
                options={sortOptions}
                selectedValue={selectedSort}
                onSelect={(value) => {
                  onSortChange?.(value);
                  setShowSortMenu(false);
                }}
                onClose={() => setShowSortMenu(false)}
              />
            </>
          )}
        </View>
      )}
    </View>
  );
};

const FilterMenu = ({ visible, options, selectedValue, onSelect, onClose }) => {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <TouchableOpacity
        style={styles.menuOverlay}
        activeOpacity={1}
        onPress={onClose}
      >
        <View style={styles.menuContainer}>
          {options.map((option) => (
            <TouchableOpacity
              key={option.value}
              style={[
                styles.menuItem,
                selectedValue === option.value && styles.menuItemSelected,
              ]}
              onPress={() => onSelect(option.value)}
            >
              <Text
                style={[
                  styles.menuItemText,
                  selectedValue === option.value && styles.menuItemTextSelected,
                ]}
              >
                {selectedValue === option.value ? '✓ ' : '  '}
                {option.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </TouchableOpacity>
    </Modal>
  );
};

const SortMenu = ({ visible, options, selectedValue, onSelect, onClose }) => {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <TouchableOpacity
        style={styles.menuOverlay}
        activeOpacity={1}
        onPress={onClose}
      >
        <View style={styles.menuContainer}>
          {options.map((option) => (
            <TouchableOpacity
              key={option.value}
              style={[
                styles.menuItem,
                selectedValue === option.value && styles.menuItemSelected,
              ]}
              onPress={() => onSelect(option.value)}
            >
              <Text
                style={[
                  styles.menuItemText,
                  selectedValue === option.value && styles.menuItemTextSelected,
                ]}
              >
                {selectedValue === option.value ? '✓ ' : '  '}
                {option.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </TouchableOpacity>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: COLORS.white,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.lightGrey,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.lightGrey,
    borderRadius: 8,
    paddingHorizontal: 12,
    height: 40,
    marginBottom: 8,
  },
  searchIcon: {
    fontSize: 16,
    marginRight: 8,
  },
  input: {
    flex: 1,
    fontSize: 14,
    color: COLORS.dark,
    paddingVertical: 8,
  },
  clearIcon: {
    fontSize: 16,
    color: COLORS.grey,
    paddingLeft: 8,
  },
  controlsContainer: {
    flexDirection: 'row',
    gap: 8,
  },
  filterButton: {
    backgroundColor: COLORS.lightGrey,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: COLORS.grey,
  },
  filterButtonText: {
    fontSize: 12,
    color: COLORS.darkGrey,
    fontWeight: '500',
  },
  sortButton: {
    backgroundColor: COLORS.lightGrey,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: COLORS.grey,
  },
  sortButtonText: {
    fontSize: 12,
    color: COLORS.darkGrey,
    fontWeight: '500',
  },
  menuOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  menuContainer: {
    backgroundColor: COLORS.white,
    borderRadius: 8,
    minWidth: 180,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
  },
  menuItem: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.lightGrey,
  },
  menuItemSelected: {
    backgroundColor: COLORS.primary + '15',
  },
  menuItemText: {
    fontSize: 14,
    color: COLORS.darkGrey,
  },
  menuItemTextSelected: {
    color: COLORS.primary,
    fontWeight: '600',
  },
});

export default AdminSearchBar;
