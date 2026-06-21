/**
 * Travel Intent Engine - Web Dashboard Component
 * React component with responsive layout and inline styling
 */

import React, { useEffect } from 'react';
import { useTravelIntentWeb } from '../hooks/useTravelIntentWeb';

const TravelIntentDashboardWeb: React.FC<{ onNavigate?: (path: string, data?: any) => void }> = ({
  onNavigate,
}) => {
  const travelIntent = useTravelIntentWeb();

  useEffect(() => {
    travelIntent.loadTrendingDestinations();
  }, []);

  const styles: Record<string, React.CSSProperties> = {
    container: {
      minHeight: '100vh',
      backgroundColor: '#F5F5F5',
      padding: '0',
    },
    wrapper: {
      maxWidth: '1200px',
      margin: '0 auto',
      padding: '0 20px',
    },
    header: {
      paddingTop: '40px',
      paddingBottom: '24px',
      backgroundColor: '#FFF',
      borderBottom: '1px solid #EEE',
      marginBottom: '24px',
    },
    headerTitle: {
      fontSize: '36px',
      fontWeight: '700',
      color: '#1A1A1A',
      marginBottom: '8px',
      margin: '0',
    },
    headerSubtitle: {
      fontSize: '16px',
      color: '#666',
      marginBottom: '0',
      margin: '0 0 0 0',
    },
    searchSection: {
      backgroundColor: '#FFF',
      borderRadius: '12px',
      padding: '24px',
      marginBottom: '24px',
      boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
    },
    searchInputWrapper: {
      display: 'flex',
      alignItems: 'center',
      gap: '12px',
      marginBottom: '20px',
    },
    searchInput: {
      flex: 1,
      padding: '12px 16px',
      fontSize: '16px',
      border: '1px solid #DDD',
      borderRadius: '8px',
      fontFamily: 'inherit',
    },
    optionsGrid: {
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
      gap: '16px',
    },
    optionGroup: {
      display: 'flex',
      flexDirection: 'column' as const,
      gap: '8px',
    },
    optionLabel: {
      fontSize: '12px',
      fontWeight: '600',
      color: '#666',
      textTransform: 'uppercase' as const,
    },
    passengerControl: {
      display: 'flex',
      alignItems: 'center',
      gap: '8px',
      backgroundColor: '#F5F5F5',
      borderRadius: '8px',
      padding: '4px',
    },
    controlButton: {
      width: '36px',
      height: '36px',
      border: 'none',
      backgroundColor: 'transparent',
      fontSize: '18px',
      fontWeight: '600',
      color: '#FF6B6B',
      cursor: 'pointer',
      borderRadius: '4px',
      transition: 'background-color 0.2s',
    },
    passengerCount: {
      flex: 1,
      textAlign: 'center' as const,
      fontSize: '14px',
      fontWeight: '600',
      color: '#1A1A1A',
    },
    vehicleTypeControl: {
      display: 'flex',
      gap: '8px',
    },
    vehicleTypeButton: {
      flex: 1,
      padding: '8px 12px',
      border: '1px solid #DDD',
      backgroundColor: '#F5F5F5',
      borderRadius: '8px',
      fontSize: '14px',
      fontWeight: '500',
      cursor: 'pointer',
      transition: 'all 0.2s',
    },
    vehicleTypeButtonActive: {
      backgroundColor: '#FF6B6B',
      color: '#FFF',
      borderColor: '#FF6B6B',
    },
    errorContainer: {
      backgroundColor: '#FFE0E0',
      border: '1px solid #FFB3B3',
      borderRadius: '8px',
      padding: '12px 16px',
      marginBottom: '16px',
      color: '#D32F2F',
      fontSize: '14px',
    },
    successContainer: {
      backgroundColor: '#E8F5E9',
      border: '1px solid #C8E6C9',
      borderRadius: '8px',
      padding: '12px 16px',
      marginBottom: '16px',
      color: '#2E7D32',
      fontSize: '14px',
    },
    suggestionsSection: {
      marginBottom: '24px',
    },
    trendingSection: {
      marginBottom: '24px',
    },
    sectionTitle: {
      fontSize: '20px',
      fontWeight: '700',
      color: '#1A1A1A',
      marginBottom: '16px',
      margin: '0 0 16px 0',
    },
    suggestionsGrid: {
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
      gap: '16px',
    },
    suggestionCard: {
      backgroundColor: '#FFF',
      borderRadius: '12px',
      padding: '16px',
      border: '1px solid #EEE',
      boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
      transition: 'all 0.2s',
      cursor: 'pointer',
    },
    suggestionHeader: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
      marginBottom: '12px',
    },
    locationInfo: {
      flex: 1,
    },
    locationName: {
      fontSize: '16px',
      fontWeight: '600',
      color: '#1A1A1A',
      marginBottom: '4px',
      margin: '0 0 4px 0',
    },
    locationCategory: {
      fontSize: '12px',
      color: '#666',
      textTransform: 'capitalize' as const,
      margin: '0',
    },
    ratingBadge: {
      backgroundColor: '#FFF3E0',
      padding: '4px 8px',
      borderRadius: '6px',
    },
    ratingText: {
      fontSize: '12px',
      fontWeight: '600',
      color: '#F57C00',
    },
    address: {
      fontSize: '12px',
      color: '#999',
      marginBottom: '10px',
      lineHeight: '16px',
    },
    amenitiesContainer: {
      display: 'flex',
      flexWrap: 'wrap' as const,
      gap: '6px',
      marginBottom: '10px',
    },
    amenityTag: {
      backgroundColor: '#F5F5F5',
      padding: '4px 8px',
      borderRadius: '4px',
      fontSize: '11px',
      color: '#666',
    },
    pricingContainer: {
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fit, minmax(100px, 1fr))',
      gap: '8px',
      marginBottom: '12px',
    },
    vehicleOption: {
      padding: '8px',
      backgroundColor: '#F5F5F5',
      border: '1px solid #DDD',
      borderRadius: '8px',
      textAlign: 'center' as const,
      cursor: 'pointer',
      transition: 'all 0.2s',
    },
    vehicleOptionSelected: {
      backgroundColor: '#FFE8E8',
      borderColor: '#FF6B6B',
    },
    vehicleType: {
      fontSize: '12px',
      fontWeight: '600',
      color: '#1A1A1A',
      textTransform: 'uppercase' as const,
    },
    vehiclePrice: {
      fontSize: '14px',
      fontWeight: '700',
      color: '#FF6B6B',
      marginTop: '4px',
    },
    bookButton: {
      width: '100%',
      padding: '12px',
      backgroundColor: '#FF6B6B',
      color: '#FFF',
      border: 'none',
      borderRadius: '8px',
      fontSize: '14px',
      fontWeight: '600',
      cursor: 'pointer',
      transition: 'background-color 0.2s',
    },
    bookButtonHover: {
      backgroundColor: '#E85555',
    },
    trendingGrid: {
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
      gap: '16px',
    },
    trendingCard: {
      backgroundColor: '#FFF',
      borderRadius: '12px',
      padding: '16px',
      border: '1px solid #EEE',
      boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
      minHeight: '160px',
      display: 'flex',
      flexDirection: 'column' as const,
      justifyContent: 'flex-end',
      cursor: 'pointer',
      transition: 'all 0.2s',
    },
    trendingBadge: {
      alignSelf: 'flex-start',
      backgroundColor: '#FF6B6B',
      color: '#FFF',
      padding: '4px 8px',
      borderRadius: '4px',
      fontSize: '10px',
      fontWeight: '700',
      marginBottom: '8px',
    },
    trendingName: {
      fontSize: '14px',
      fontWeight: '600',
      color: '#1A1A1A',
      marginBottom: '8px',
    },
    trendingRating: {
      fontSize: '12px',
      color: '#F57C00',
      fontWeight: '600',
    },
    emptyState: {
      textAlign: 'center' as const,
      paddingVertical: '80px',
      paddingTop: '80px',
      paddingBottom: '80px',
    },
    emptyStateIcon: {
      fontSize: '48px',
      marginBottom: '16px',
    },
    emptyStateText: {
      fontSize: '18px',
      fontWeight: '600',
      color: '#1A1A1A',
      marginBottom: '8px',
    },
    emptyStateSubtext: {
      fontSize: '14px',
      color: '#666',
    },
  };

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <div style={styles.wrapper}>
          <h1 style={styles.headerTitle}>Where are you heading?</h1>
          <p style={styles.headerSubtitle}>
            Type what you'd like to do, we'll find the perfect place
          </p>
        </div>
      </div>

      <div style={styles.wrapper}>
        {/* Search Section */}
        <div style={styles.searchSection}>
          <div style={styles.searchInputWrapper}>
            <input
              type="text"
              style={styles.searchInput}
              placeholder="e.g., Movie with friends, Dinner tonight..."
              value={travelIntent.searchQuery}
              onChange={(e) => travelIntent.handleSearchInput(e.target.value)}
              disabled={travelIntent.isSearching}
            />
            {travelIntent.isSearching && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <div style={{ width: '16px', height: '16px', borderRadius: '50%', border: '2px solid #FF6B6B', borderTopColor: 'transparent', animation: 'spin 1s linear infinite' }} />
              </div>
            )}
          </div>

          <div style={styles.optionsGrid}>
            <div style={styles.optionGroup}>
              <label style={styles.optionLabel}>Passengers</label>
              <div style={styles.passengerControl}>
                <button
                  style={styles.controlButton}
                  onClick={() =>
                    travelIntent.updateNumPassengers(travelIntent.numPassengers - 1)
                  }
                >
                  −
                </button>
                <div style={styles.passengerCount}>{travelIntent.numPassengers}</div>
                <button
                  style={styles.controlButton}
                  onClick={() =>
                    travelIntent.updateNumPassengers(travelIntent.numPassengers + 1)
                  }
                >
                  +
                </button>
              </div>
            </div>

            <div style={styles.optionGroup}>
              <label style={styles.optionLabel}>Vehicle Type</label>
              <div style={styles.vehicleTypeControl}>
                {['auto', 'cab', 'premium'].map((type) => (
                  <button
                    key={type}
                    style={{
                      ...styles.vehicleTypeButton,
                      ...(travelIntent.selectedVehicleType === type
                        ? styles.vehicleTypeButtonActive
                        : {}),
                    }}
                    onClick={() => travelIntent.updateVehicleType(type)}
                  >
                    {type === 'auto' ? '🛺' : type === 'cab' ? '🚕' : '✨'} {type}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Error Message */}
        {travelIntent.searchError && (
          <div style={styles.errorContainer}>{travelIntent.searchError}</div>
        )}

        {/* Booking Success */}
        {travelIntent.bookingSuccess && (
          <div style={styles.successContainer}>
            ✓ Ride booked successfully! Ride ID: {travelIntent.bookingDetails?.ride_id}
          </div>
        )}

        {/* Suggestions */}
        {travelIntent.suggestions.length > 0 && (
          <div style={styles.suggestionsSection}>
            <h2 style={styles.sectionTitle}>Top Suggestions</h2>
            <div style={styles.suggestionsGrid}>
              {travelIntent.suggestions.map((suggestion) => (
                <div
                  key={suggestion.id}
                  style={styles.suggestionCard}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLElement).style.boxShadow =
                      '0 4px 12px rgba(0,0,0,0.15)';
                    (e.currentTarget as HTMLElement).style.transform = 'translateY(-2px)';
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLElement).style.boxShadow =
                      '0 1px 3px rgba(0,0,0,0.1)';
                    (e.currentTarget as HTMLElement).style.transform = 'translateY(0)';
                  }}
                >
                  <div style={styles.suggestionHeader}>
                    <div style={styles.locationInfo}>
                      <p style={styles.locationName}>{suggestion.location.name}</p>
                      <p style={styles.locationCategory}>{suggestion.location.category}</p>
                    </div>
                    <div style={styles.ratingBadge}>
                      <p style={styles.ratingText}>★ {suggestion.location.rating}</p>
                    </div>
                  </div>

                  <p style={styles.address}>{suggestion.location.address}</p>

                  <div style={styles.amenitiesContainer}>
                    {suggestion.location.amenities.slice(0, 3).map((amenity, idx) => (
                      <div key={idx} style={styles.amenityTag}>
                        {amenity}
                      </div>
                    ))}
                  </div>

                  <div style={styles.pricingContainer}>
                    {suggestion.pricing.map((price, idx) => (
                      <div
                        key={idx}
                        style={{
                          ...styles.vehicleOption,
                          ...(travelIntent.selectedVehicleType === price.vehicleType
                            ? styles.vehicleOptionSelected
                            : {}),
                        }}
                        onClick={() => travelIntent.updateVehicleType(price.vehicleType)}
                      >
                        <div style={styles.vehicleType}>{price.vehicleType}</div>
                        <div style={styles.vehiclePrice}>₹{Math.round(price.estimatedFare)}</div>
                      </div>
                    ))}
                  </div>

                  <button
                    style={styles.bookButton}
                    onClick={() =>
                      travelIntent.quickBook(
                        suggestion.id,
                        travelIntent.selectedVehicleType,
                        travelIntent.numPassengers
                      )
                    }
                    onMouseEnter={(e) => {
                      (e.currentTarget as HTMLElement).style.backgroundColor = '#E85555';
                    }}
                    onMouseLeave={(e) => {
                      (e.currentTarget as HTMLElement).style.backgroundColor = '#FF6B6B';
                    }}
                    disabled={travelIntent.isBooking}
                  >
                    {travelIntent.isBooking ? 'Booking...' : 'Book Now'}
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Trending */}
        {travelIntent.suggestions.length === 0 && travelIntent.trendingDestinations.length > 0 && (
          <div style={styles.trendingSection}>
            <h2 style={styles.sectionTitle}>Trending Now</h2>
            <div style={styles.trendingGrid}>
              {travelIntent.trendingDestinations.map((destination) => (
                <div
                  key={destination.id}
                  style={styles.trendingCard}
                  onClick={() => {
                    travelIntent.handleSearchInput(destination.name);
                  }}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLElement).style.boxShadow =
                      '0 4px 12px rgba(0,0,0,0.15)';
                    (e.currentTarget as HTMLElement).style.transform = 'translateY(-2px)';
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLElement).style.boxShadow =
                      '0 1px 3px rgba(0,0,0,0.1)';
                    (e.currentTarget as HTMLElement).style.transform = 'translateY(0)';
                  }}
                >
                  <div style={styles.trendingBadge}>TRENDING</div>
                  <p style={styles.trendingName}>{destination.name}</p>
                  <p style={styles.trendingRating}>★ {destination.rating}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Empty State */}
        {travelIntent.suggestions.length === 0 &&
          travelIntent.trendingDestinations.length === 0 &&
          !travelIntent.isSearching && (
            <div style={styles.emptyState}>
              <div style={styles.emptyStateIcon}>🔍</div>
              <p style={styles.emptyStateText}>No results found</p>
              <p style={styles.emptyStateSubtext}>Try a different query</p>
            </div>
          )}
      </div>

      <style>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
};

export default TravelIntentDashboardWeb;
