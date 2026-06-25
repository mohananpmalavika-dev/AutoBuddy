from sqlalchemy import Column, Integer, Float, String, DateTime, JSON, Boolean, Index
from sqlalchemy.orm import synonym
from app.models.vehicle_platform import Base
from app.utils.time_helpers import get_ist_now


class RoadHazard(Base):
    __tablename__ = "road_hazards"
    __table_args__ = (
        Index("idx_road_hazards_location", "latitude", "longitude"),
        Index("idx_road_hazards_created", "created_at"),
    )

    id = Column(Integer, primary_key=True, autoincrement=True)
    latitude = Column(Float, nullable=False)
    longitude = Column(Float, nullable=False)
    severity = Column(Integer, nullable=True)  # 1-10
    type = Column(String(64), nullable=True)  # pothole, waterlogging, crack, missing-sign
    source = Column(String(64), nullable=True)  # driver_app, user_report, automated
    speed_kmph = Column(Float, nullable=True)
    confidence = Column(Float, nullable=True)
    verified = Column(Boolean, default=False, nullable=False)
    evidence_url = Column(String(1024), nullable=True)
    metadata_json = Column('metadata', JSON, nullable=True)
    created_at = Column(DateTime, default=get_ist_now, nullable=True)


class HazardReport(Base):
    __tablename__ = "hazard_reports"
    __table_args__ = (
        Index("idx_hazard_reports_status", "status"),
    )

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(String(128), nullable=True)
    latitude = Column(Float, nullable=False)
    longitude = Column(Float, nullable=False)
    description = Column(String(512), nullable=True)
    # Category for non-vehicular reports: 'broken_footpath', 'missing_light', 'dangerous_crossing', 'cycle_lane_issue'
    category = Column(String(64), nullable=True)
    image_url = Column(String(1024), nullable=True)
    status = Column(String(32), default="OPEN", nullable=True)
    created_at = Column(DateTime, default=get_ist_now, nullable=True)
