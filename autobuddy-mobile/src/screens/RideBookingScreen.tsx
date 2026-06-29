import React from 'react';

import TravelIntentDashboard from './TravelIntentDashboard';

interface RideBookingScreenProps {
  navigation?: any;
}

const RideBookingScreen: React.FC<RideBookingScreenProps> = ({ navigation }) => (
  <TravelIntentDashboard navigation={navigation} />
);

export default RideBookingScreen;
