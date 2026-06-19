import { ReactNode } from 'react';

import { NotificationProvider } from './NotificationContext';
import { RatingsProvider } from './RatingsContext';
import { SavedPlacesProvider } from './SavedPlacesContext';
import { PreferencesProvider } from './PreferencesContext';
import { ScheduledRidesProvider } from './ScheduledRidesContext';
import { PaymentMethodsProvider } from './PaymentMethodsContext';
import { FavoritesProvider } from './FavoritesContext';
import { PromoCodesProvider } from './PromoCodesContext';
import { SupportProvider } from './SupportContext';
import { AccessibilityProvider } from './AccessibilityContext';

export function AppStateProvider({ children }: { children: ReactNode }) {
  return (
    <NotificationProvider>
      <RatingsProvider>
        <SavedPlacesProvider>
          <PreferencesProvider>
            <ScheduledRidesProvider>
              <PaymentMethodsProvider>
                <FavoritesProvider>
                  <PromoCodesProvider>
                    <SupportProvider>
                      <AccessibilityProvider>
                        {children}
                      </AccessibilityProvider>
                    </SupportProvider>
                  </PromoCodesProvider>
                </FavoritesProvider>
              </PaymentMethodsProvider>
            </ScheduledRidesProvider>
          </PreferencesProvider>
        </SavedPlacesProvider>
      </RatingsProvider>
    </NotificationProvider>
  );
}
