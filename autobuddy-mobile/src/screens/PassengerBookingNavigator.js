import React, { useState } from 'react';
import { View } from 'react-native';
import ServiceSelectionScreen from './ServiceSelectionScreen';
import BookingDetailsScreen from './BookingDetailsScreen';

/**
 * PassengerBookingNavigator
 * Manages the two-screen booking flow:
 * 1. ServiceSelectionScreen - Choose vehicle type and ride type
 * 2. BookingDetailsScreen - Enter locations and complete booking
 */

const PassengerBookingNavigator = ({ onBookingComplete, onCancel, initialPickup = null, initialDropoff = null }) => {
  const [currentScreen, setCurrentScreen] = useState('service-selection');
  const [selectedService, setSelectedService] = useState(null);

  const handleServiceSelected = (serviceData) => {
    setSelectedService(serviceData);
    setCurrentScreen('booking-details');
  };

  const handleBookingComplete = (bookingData) => {
    if (onBookingComplete) {
      onBookingComplete(bookingData);
    }
  };

  const handleGoBack = () => {
    if (currentScreen === 'booking-details') {
      setCurrentScreen('service-selection');
      setSelectedService(null);
    } else {
      if (onCancel) {
        onCancel();
      }
    }
  };

  return (
    <View style={{ flex: 1 }}>
      {currentScreen === 'service-selection' && (
        <ServiceSelectionScreen
          navigation={{
            navigate: (screen, params) => {
              if (screen === 'BookingDetails') {
                handleServiceSelected(params);
              }
            },
            goBack: handleGoBack,
          }}
          route={{}}
        />
      )}

      {currentScreen === 'booking-details' && selectedService && (
        <BookingDetailsScreen
          navigation={{
            navigate: (screen, params) => {
              if (screen === 'RideDetails') {
                handleBookingComplete(params);
              }
            },
            goBack: handleGoBack,
          }}
          route={{
            params: {
              ...selectedService,
              initialPickup,
              initialDropoff,
            },
          }}
        />
      )}
    </View>
  );
};

export default PassengerBookingNavigator;
