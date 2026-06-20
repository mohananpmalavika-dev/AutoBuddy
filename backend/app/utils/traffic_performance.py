"""
Performance Profiling & Analytics for Traffic Alerts
Tracks latency, throughput, and effectiveness metrics
"""

import time
import logging
from dataclasses import dataclass, field
from typing import Dict, List, Optional
from datetime import datetime, timedelta
from collections import defaultdict
import json

logger = logging.getLogger("autobuddy.traffic_performance")


@dataclass
class AlertMetrics:
    """Metrics for alert broadcasting performance"""
    alert_id: str
    generation_time: float
    broadcast_time: float
    delivery_time: float
    recipients_count: int
    duplicates_filtered: int
    timestamp: datetime = field(default_factory=datetime.now)

    def total_latency(self) -> float:
        """Total latency from generation to all deliveries"""
        return self.generation_time + self.broadcast_time + self.delivery_time

    def efficiency_percent(self) -> float:
        """Percentage of non-duplicate alerts delivered"""
        if self.recipients_count == 0:
            return 0.0
        return (self.recipients_count / (self.recipients_count + self.duplicates_filtered)) * 100


@dataclass
class RouteMetrics:
    """Metrics for route optimization"""
    route_id: str
    optimization_time: float
    distance_savings_km: float
    time_savings_minutes: float
    fuel_savings_rupees: float
    toll_amount: float
    timestamp: datetime = field(default_factory=datetime.now)

    def roi_score(self) -> float:
        """Return on investment: (time_savings_value + fuel_savings) / toll"""
        time_value = (self.time_savings_minutes / 60) * 300  # ₹300/hour
        total_benefit = time_value + self.fuel_savings_rupees
        if self.toll_amount == 0:
            return total_benefit / 1  # Avoid division by zero
        return (total_benefit - self.toll_amount) / self.toll_amount


@dataclass
class WebSocketMetrics:
    """Metrics for WebSocket connections"""
    connection_id: str
    connect_time: datetime
    disconnect_time: Optional[datetime] = None
    messages_sent: int = 0
    messages_received: int = 0
    bytes_transmitted: int = 0
    bytes_received: int = 0

    def duration_seconds(self) -> float:
        """Connection duration in seconds"""
        end_time = self.disconnect_time or datetime.now()
        return (end_time - self.connect_time).total_seconds()

    def throughput_mbps(self) -> float:
        """Throughput in Mbps"""
        duration = self.duration_seconds()
        if duration == 0:
            return 0.0
        total_bytes = self.bytes_transmitted + self.bytes_received
        return (total_bytes * 8) / (duration * 1_000_000)


class PerformanceTracker:
    """Track performance metrics across the system"""

    def __init__(self, retention_hours: int = 24):
        self.retention_hours = retention_hours
        self.alert_metrics: List[AlertMetrics] = []
        self.route_metrics: List[RouteMetrics] = []
        self.websocket_metrics: Dict[str, WebSocketMetrics] = {}
        self.error_log: List[Dict] = []

    def record_alert_broadcast(
        self,
        alert_id: str,
        generation_time: float,
        broadcast_time: float,
        delivery_time: float,
        recipients: int,
        duplicates: int = 0,
    ) -> None:
        """Record alert broadcasting metrics"""
        metrics = AlertMetrics(
            alert_id=alert_id,
            generation_time=generation_time,
            broadcast_time=broadcast_time,
            delivery_time=delivery_time,
            recipients_count=recipients,
            duplicates_filtered=duplicates,
        )
        self.alert_metrics.append(metrics)
        logger.debug(
            f"Alert {alert_id} broadcast: {metrics.total_latency():.3f}ms latency, "
            f"{recipients} recipients, {metrics.efficiency_percent():.1f}% efficiency"
        )

    def record_route_optimization(
        self,
        route_id: str,
        optimization_time: float,
        distance_savings: float,
        time_savings: float,
        fuel_savings: float,
        toll: float,
    ) -> None:
        """Record route optimization metrics"""
        metrics = RouteMetrics(
            route_id=route_id,
            optimization_time=optimization_time,
            distance_savings_km=distance_savings,
            time_savings_minutes=time_savings,
            fuel_savings_rupees=fuel_savings,
            toll_amount=toll,
        )
        self.route_metrics.append(metrics)
        logger.debug(
            f"Route {route_id} optimized: {optimization_time:.2f}ms, "
            f"saved {distance_savings:.1f}km, ROI score: {metrics.roi_score():.2f}"
        )

    def record_websocket_connection(self, connection_id: str) -> None:
        """Record WebSocket connection start"""
        self.websocket_metrics[connection_id] = WebSocketMetrics(
            connection_id=connection_id,
            connect_time=datetime.now(),
        )

    def record_websocket_disconnection(self, connection_id: str) -> None:
        """Record WebSocket disconnection"""
        if connection_id in self.websocket_metrics:
            self.websocket_metrics[connection_id].disconnect_time = datetime.now()

    def record_websocket_message(
        self,
        connection_id: str,
        direction: str,  # "sent" or "received"
        bytes_size: int,
    ) -> None:
        """Record WebSocket message"""
        if connection_id not in self.websocket_metrics:
            return

        metrics = self.websocket_metrics[connection_id]
        if direction == "sent":
            metrics.messages_sent += 1
            metrics.bytes_transmitted += bytes_size
        elif direction == "received":
            metrics.messages_received += 1
            metrics.bytes_received += bytes_size

    def record_error(
        self,
        error_type: str,
        message: str,
        context: Optional[Dict] = None,
    ) -> None:
        """Record system error"""
        error_entry = {
            "timestamp": datetime.now().isoformat(),
            "type": error_type,
            "message": message,
            "context": context or {},
        }
        self.error_log.append(error_entry)
        logger.error(f"Error recorded: {error_type} - {message}")

    def cleanup_old_metrics(self) -> None:
        """Remove metrics older than retention period"""
        cutoff_time = datetime.now() - timedelta(hours=self.retention_hours)

        self.alert_metrics = [m for m in self.alert_metrics if m.timestamp > cutoff_time]
        self.route_metrics = [m for m in self.route_metrics if m.timestamp > cutoff_time]
        self.error_log = [
            e for e in self.error_log
            if datetime.fromisoformat(e["timestamp"]) > cutoff_time
        ]

    def get_alert_stats(self) -> Dict:
        """Get alert broadcasting statistics"""
        if not self.alert_metrics:
            return {"status": "no_data"}

        latencies = [m.total_latency() for m in self.alert_metrics]
        efficiencies = [m.efficiency_percent() for m in self.alert_metrics]

        return {
            "total_alerts": len(self.alert_metrics),
            "avg_latency_ms": sum(latencies) / len(latencies),
            "min_latency_ms": min(latencies),
            "max_latency_ms": max(latencies),
            "avg_efficiency_percent": sum(efficiencies) / len(efficiencies),
            "total_recipients": sum(m.recipients_count for m in self.alert_metrics),
            "total_duplicates_filtered": sum(m.duplicates_filtered for m in self.alert_metrics),
        }

    def get_route_stats(self) -> Dict:
        """Get route optimization statistics"""
        if not self.route_metrics:
            return {"status": "no_data"}

        distances = [m.distance_savings_km for m in self.route_metrics]
        times = [m.time_savings_minutes for m in self.route_metrics]
        rois = [m.roi_score() for m in self.route_metrics]

        return {
            "total_optimizations": len(self.route_metrics),
            "avg_distance_saved_km": sum(distances) / len(distances),
            "total_distance_saved_km": sum(distances),
            "avg_time_saved_minutes": sum(times) / len(times),
            "total_time_saved_hours": sum(times) / 60,
            "avg_fuel_saved_rupees": sum(m.fuel_savings_rupees for m in self.route_metrics) / len(self.route_metrics),
            "avg_toll_amount": sum(m.toll_amount for m in self.route_metrics) / len(self.route_metrics),
            "avg_roi_score": sum(rois) / len(rois),
        }

    def get_websocket_stats(self) -> Dict:
        """Get WebSocket connection statistics"""
        active_connections = len(
            [m for m in self.websocket_metrics.values() if m.disconnect_time is None]
        )
        total_messages = sum(
            m.messages_sent + m.messages_received
            for m in self.websocket_metrics.values()
        )

        durations = [
            m.duration_seconds() for m in self.websocket_metrics.values()
            if m.disconnect_time is not None
        ]

        return {
            "total_connections": len(self.websocket_metrics),
            "active_connections": active_connections,
            "total_messages": total_messages,
            "avg_connection_duration_seconds": sum(durations) / len(durations) if durations else 0,
            "total_data_transmitted_mb": sum(
                m.bytes_transmitted for m in self.websocket_metrics.values()
            ) / 1_000_000,
            "total_data_received_mb": sum(
                m.bytes_received for m in self.websocket_metrics.values()
            ) / 1_000_000,
        }

    def get_error_stats(self) -> Dict:
        """Get error statistics"""
        error_counts = defaultdict(int)
        for error in self.error_log:
            error_counts[error["type"]] += 1

        return {
            "total_errors": len(self.error_log),
            "errors_by_type": dict(error_counts),
            "recent_errors": self.error_log[-10:],  # Last 10 errors
        }

    def get_system_report(self) -> Dict:
        """Generate comprehensive system report"""
        self.cleanup_old_metrics()

        return {
            "timestamp": datetime.now().isoformat(),
            "alerts": self.get_alert_stats(),
            "routes": self.get_route_stats(),
            "websocket": self.get_websocket_stats(),
            "errors": self.get_error_stats(),
        }

    def export_metrics_json(self, filepath: str) -> None:
        """Export all metrics to JSON file"""
        report = self.get_system_report()
        with open(filepath, "w") as f:
            json.dump(report, f, indent=2)
        logger.info(f"Metrics exported to {filepath}")

    def log_performance_summary(self) -> None:
        """Log performance summary"""
        report = self.get_system_report()
        logger.info(f"Performance Report: {json.dumps(report, indent=2)}")


# Global tracker instance
tracker = PerformanceTracker()
