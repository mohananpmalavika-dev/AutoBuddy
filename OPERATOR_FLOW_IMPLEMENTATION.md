# Operator Flow Implementation Guide

**Status**: Ready to Implement  
**Effort**: 45-55 hours  
**Priority**: High  

---

## 🎯 Operator UX Improvements - Step by Step

### 1. Unified Operations Dashboard

#### Current Implementation Location
- File: `autobuddy-mobile/src/screens/OperatorDashboard.tsx`

#### New Dashboard Layout

```typescript
export function OperatorDashboard({ token }) {
  const [fleetStats, setFleetStats] = useState(null);
  const [alerts, setAlerts] = useState([]);
  const [selectedFilter, setSelectedFilter] = useState('today');

  useEffect(() => {
    // Real-time updates via WebSocket
    subscribeToFleetStats(fleetStats => {
      setFleetStats(fleetStats);
    });
  }, []);

  return (
    <ScrollView style={styles.container}>
      {/* Header with quick actions */}
      <View style={styles.header}>
        <Text style={styles.title}>Fleet Operations</Text>
        <View style={styles.timeFilter}>
          {['today', 'week', 'month'].map(period => (
            <Button 
              key={period}
              label={period.toUpperCase()}
              selected={selectedFilter === period}
              onPress={() => setSelectedFilter(period)}
            />
          ))}
        </View>
      </View>

      {/* Live Status Card */}
      <Card style={styles.liveStatus}>
        <Text style={styles.cardTitle}>LIVE STATUS</Text>
        <View style={styles.statusGrid}>
          <StatBox 
            label="Online"
            value={fleetStats?.drivers_online}
            total={fleetStats?.drivers_total}
            color="#4CAF50"
          />
          <StatBox 
            label="Rides Now"
            value={fleetStats?.active_rides}
            color="#2196F3"
          />
          <StatBox 
            label="Avg Rating"
            value={`⭐${fleetStats?.avg_rating}`}
            color="#FF9800"
          />
          <StatBox 
            label="Utilization"
            value={`${fleetStats?.utilization_rate}%`}
            color="#9C27B0"
          />
        </View>
      </Card>

      {/* Revenue Card */}
      <Card style={styles.revenue}>
        <Text style={styles.cardTitle}>REVENUE</Text>
        <View style={styles.revenueContent}>
          <View>
            <Text style={styles.label}>Earnings</Text>
            <Text style={styles.amount}>₹ {fleetStats?.revenue}</Text>
          </View>
          <View>
            <Text style={styles.label}>Costs</Text>
            <Text style={styles.amount}>₹ {fleetStats?.costs}</Text>
          </View>
          <View style={styles.profitBox}>
            <Text style={styles.label}>Profit</Text>
            <Text style={styles.profitAmount}>₹ {fleetStats?.profit}</Text>
          </View>
        </View>
        <View style={styles.breakdown}>
          <ProgressBar 
            label="Commission"
            value={fleetStats?.commission_percentage}
          />
          <ProgressBar 
            label="Incentives"
            value={fleetStats?.incentive_percentage}
          />
          <ProgressBar 
            label="Operations"
            value={fleetStats?.operations_percentage}
          />
        </View>
      </Card>

      {/* Alerts Section */}
      {alerts.length > 0 && (
        <Card style={styles.alerts}>
          <Text style={styles.cardTitle}>⚠️ ALERTS ({alerts.length})</Text>
          {alerts.slice(0, 3).map(alert => (
            <Alert key={alert.id} alert={alert} />
          ))}
          {alerts.length > 3 && (
            <Button 
              label={`View all ${alerts.length} alerts`}
              onPress={() => navigate('/alerts')}
            />
          )}
        </Card>
      )}

      {/* Quick Actions */}
      <View style={styles.quickActions}>
        <ActionButton 
          icon="map"
          label="View Map"
          onPress={() => navigate('/fleet-map')}
        />
        <ActionButton 
          icon="person-add"
          label="Add Driver"
          onPress={() => navigate('/add-driver')}
        />
        <ActionButton 
          icon="chart"
          label="Reports"
          onPress={() => navigate('/reports')}
        />
        <ActionButton 
          icon="settings"
          label="Settings"
          onPress={() => navigate('/settings')}
        />
      </View>
    </ScrollView>
  );
}
```

---

### 2. Driver Management Panel

#### New Component

```typescript
export function DriverManagementPanel({ driverId }) {
  const [driver, setDriver] = useState(null);
  const [metrics, setMetrics] = useState(null);

  useEffect(() => {
    fetchDriver(driverId);
    subscribeToDriverMetrics(driverId, metrics => {
      setMetrics(metrics);
    });
  }, [driverId]);

  return (
    <ScrollView>
      {/* Driver Header */}
      <View style={styles.header}>
        <Image source={{uri: driver.photo}} />
        <View>
          <Text style={styles.name}>{driver.name}</Text>
          <Text>ID: {driver.id}</Text>
        </View>
        <View>
          <StatusBadge status={driver.status} />
          <Text>⭐{driver.rating}</Text>
        </View>
      </View>

      {/* Quick Stats */}
      <View style={styles.stats}>
        <Stat label="Rides Today" value={metrics.rides_today} />
        <Stat label="Earned" value={`₹${metrics.earned_today}`} />
        <Stat label="Avg Rating" value={`⭐${driver.avg_rating}`} />
        <Stat label="Acceptance" value={`${metrics.acceptance_rate}%`} />
      </View>

      {/* This Week Summary */}
      <Card>
        <Text style={styles.cardTitle}>This Week</Text>
        <View style={styles.weekSummary}>
          <Summary label="Trips" value={metrics.trips_week} />
          <Summary label="Earnings" value={`₹${metrics.earned_week}`} />
          <Summary label="Rating" value={`⭐${metrics.avg_rating_week}`} />
          <Summary label="Attendance" value={`${metrics.attendance_week}%`} />
        </View>
      </Card>

      {/* Performance Details */}
      <Card>
        <Text style={styles.cardTitle}>Performance</Text>
        <PerformanceChart 
          data={metrics.daily_performance}
          period="week"
        />
      </Card>

      {/* Actions */}
      <Card>
        <Text style={styles.cardTitle}>Actions</Text>
        <View style={styles.actions}>
          <ActionButton 
            label="Send Message"
            icon="message"
            onPress={() => openChat(driver.id)}
          />
          <ActionButton 
            label="Adjust Incentive"
            icon="money"
            onPress={() => openIncentiveModal(driver.id)}
          />
          <ActionButton 
            label="View History"
            icon="history"
            onPress={() => navigate(`/driver/${driver.id}/history`)}
          />
          <ActionButton 
            label="Schedule Alert"
            icon="bell"
            onPress={() => openAlertModal(driver.id)}
          />
        </View>
      </Card>
    </ScrollView>
  );
}
```

---

### 3. Real-Time Fleet Map

#### New Component

```typescript
export function FleetMapView() {
  const [drivers, setDrivers] = useState([]);
  const [selectedDriver, setSelectedDriver] = useState(null);
  const [heatmapMode, setHeatmapMode] = useState(false);

  useEffect(() => {
    subscribeToDriverLocations(locations => {
      setDrivers(locations);
    });
  }, []);

  const getDriverColor = (driver) => {
    if (driver.status === 'online' && driver.has_active_ride) return '#4CAF50';
    if (driver.status === 'online') return '#FFC107';
    return '#999999';
  };

  return (
    <View style={styles.container}>
      <MapView
        style={styles.map}
        initialRegion={getInitialRegion(drivers)}
      >
        {heatmapMode ? (
          <Heatmap data={drivers} />
        ) : (
          drivers.map(driver => (
            <Marker
              key={driver.id}
              coordinate={{
                latitude: driver.location.lat,
                longitude: driver.location.lng
              }}
              onPress={() => setSelectedDriver(driver)}
              pinColor={getDriverColor(driver)}
            >
              <View style={styles.markerLabel}>
                <Text style={styles.markerText}>
                  {driver.name.split(' ')[0]}
                </Text>
              </View>
            </Marker>
          ))
        )}
      </MapView>

      {/* Controls */}
      <View style={styles.controls}>
        <Button 
          label={heatmapMode ? 'List View' : 'Heatmap'}
          onPress={() => setHeatmapMode(!heatmapMode)}
        />
      </View>

      {/* Driver Details Panel */}
      {selectedDriver && (
        <DriverDetailsBottomSheet
          driver={selectedDriver}
          onClose={() => setSelectedDriver(null)}
        />
      )}

      {/* Zones Info */}
      <View style={styles.zonesPanel}>
        <Text>Zone Demand</Text>
        {getZoneStats().map(zone => (
          <ZoneCard key={zone.id} zone={zone} />
        ))}
      </View>
    </View>
  );
}
```

---

### 4. Automated Reports System

#### New Endpoints

```
GET /operator/reports/daily
  Returns:
  {
    date: "2026-06-19",
    revenue: 45230,
    costs: 12400,
    profit: 32830,
    trips: 342,
    drivers_online: 24,
    avg_rating: 4.8,
    top_performers: [...],
    bottom_performers: [...],
    alerts: [...],
    recommendations: [...]
  }

GET /operator/reports/weekly
  Returns: aggregated weekly data

GET /operator/reports/monthly
  Returns: aggregated monthly data

POST /operator/reports/export
  ?format=pdf|csv|excel
  Returns: download link
```

#### Report Component

```typescript
export function DailyReportCard() {
  const [report, setReport] = useState(null);

  useEffect(() => {
    fetchReport('daily');
  }, []);

  return (
    <Card>
      <Text style={styles.title}>Daily Report</Text>
      
      {/* Summary */}
      <SummaryGrid data={report.summary} />
      
      {/* Charts */}
      <LineChart 
        data={report.revenue_trend}
        title="Revenue Trend"
      />
      
      {/* Top & Bottom Performers */}
      <PerformersList 
        topPerformers={report.top_performers}
        bottomPerformers={report.bottom_performers}
      />
      
      {/* Alerts & Recommendations */}
      <AlertsList alerts={report.alerts} />
      <RecommendationsList recommendations={report.recommendations} />
      
      {/* Export Button */}
      <Button 
        label="Download Report"
        onPress={() => exportReport('daily', 'pdf')}
      />
    </Card>
  );
}
```

---

## 📊 Backend API Changes

### New Endpoints Required

```
GET /operator/dashboard
  • Real-time fleet stats
  • Revenue summary
  • Active alerts

GET /operator/drivers?status=online|offline|all
  • List of drivers with current stats
  • Location (if online)
  • Active rides

WS /operator/fleet-realtime
  • Real-time driver locations
  • Driver status changes
  • Ride assignments

GET /operator/reports/{type}
  • daily, weekly, monthly
  • Cached for performance

POST /operator/drivers/{id}/message
  • Send message to driver

PUT /operator/drivers/{id}/incentive
  • Adjust incentive/bonus

GET /operator/zones/demand
  • Heatmap data by zone
```

---

## 📱 UI Components Needed

```typescript
// New components
- OperatorDashboard
- DriverManagementPanel
- FleetMapView
- DailyReportCard
- AlertsList
- PerformersList
- StatBox
- ProgressBar
```

---

## 🚀 Rollout Strategy

### Week 1: Dashboard
- Deploy unified dashboard
- Monitor performance
- Get operator feedback

### Week 2: Driver Management
- Add driver details panel
- Test with 5 operators

### Week 3: Fleet Map
- Deploy real-time map
- Test with 10 operators

### Week 4: Reports
- Deploy automated reports
- Full rollout

---

## 📈 Success Metrics

### Track These Metrics
- **Operator engagement**: Time in app
- **Issue resolution time**: Faster response
- **Fleet utilization**: Should increase
- **Operator satisfaction**: NPS score
- **Compliance**: SLA adherence

