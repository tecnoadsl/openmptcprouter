"""SQLAlchemy models per OMR Platform."""

import uuid
from datetime import datetime, timezone

from sqlalchemy import (
    Boolean, Column, DateTime, Float, ForeignKey, Integer, String, Text, BigInteger,
    CheckConstraint, Index,
)
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import DeclarativeBase, relationship


class Base(DeclarativeBase):
    pass


class Tenant(Base):
    __tablename__ = "tenants"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name = Column(String(255), nullable=False)
    slug = Column(String(100), unique=True, nullable=False)
    is_active = Column(Boolean, default=True)
    max_devices = Column(Integer, default=100)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    organizations = relationship("Organization", back_populates="tenant", cascade="all, delete-orphan")
    users = relationship("User", back_populates="tenant")


class Organization(Base):
    __tablename__ = "organizations"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id = Column(UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False)
    name = Column(String(255), nullable=False)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    tenant = relationship("Tenant", back_populates="organizations")
    sites = relationship("Site", back_populates="organization", cascade="all, delete-orphan")


class Site(Base):
    __tablename__ = "sites"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    organization_id = Column(UUID(as_uuid=True), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False)
    name = Column(String(255), nullable=False)
    address = Column(Text)
    latitude = Column(Float)
    longitude = Column(Float)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    organization = relationship("Organization", back_populates="sites")
    devices = relationship("Device", back_populates="site", cascade="all, delete-orphan")


class Device(Base):
    __tablename__ = "devices"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    site_id = Column(UUID(as_uuid=True), ForeignKey("sites.id", ondelete="CASCADE"), nullable=False)
    device_id = Column(String(100), unique=True, nullable=False)
    name = Column(String(255), nullable=False)
    device_type = Column(String(20), nullable=False)
    model = Column(String(100))
    firmware_version = Column(String(50))
    is_online = Column(Boolean, default=False)
    last_seen_at = Column(DateTime(timezone=True))
    config = Column(JSONB, default={})
    mqtt_password = Column(String(255))
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    __table_args__ = (
        CheckConstraint("device_type IN ('router', 'vps')", name="ck_device_type"),
    )

    site = relationship("Site", back_populates="devices")
    telemetry = relationship("Telemetry", back_populates="device", cascade="all, delete-orphan")
    alerts = relationship("Alert", back_populates="device", cascade="all, delete-orphan")
    commands = relationship("Command", back_populates="device", cascade="all, delete-orphan")


class User(Base):
    __tablename__ = "users"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    email = Column(String(255), unique=True, nullable=False)
    password_hash = Column(String(255), nullable=False)
    full_name = Column(String(255))
    role = Column(String(20), nullable=False)
    tenant_id = Column(UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"))
    organization_id = Column(UUID(as_uuid=True), ForeignKey("organizations.id", ondelete="CASCADE"))
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    __table_args__ = (
        CheckConstraint("role IN ('super_admin', 'reseller_admin', 'org_admin', 'viewer')", name="ck_user_role"),
    )

    tenant = relationship("Tenant", back_populates="users")


class Telemetry(Base):
    __tablename__ = "telemetry"

    id = Column(BigInteger, primary_key=True, autoincrement=True)
    device_id = Column(UUID(as_uuid=True), ForeignKey("devices.id", ondelete="CASCADE"), nullable=False)
    timestamp = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    cpu_usage = Column(Float)
    memory_usage = Column(Float)
    uptime = Column(Integer)
    wan_status = Column(JSONB)
    mptcp_status = Column(JSONB)
    tunnel_status = Column(JSONB)
    zenarmor = Column(JSONB)
    extra = Column(JSONB, default={})

    __table_args__ = (
        Index("idx_telemetry_device_time", "device_id", "timestamp"),
    )

    device = relationship("Device", back_populates="telemetry")


class Alert(Base):
    __tablename__ = "alerts"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    device_id = Column(UUID(as_uuid=True), ForeignKey("devices.id", ondelete="CASCADE"), nullable=False)
    alert_type = Column(String(50), nullable=False)
    severity = Column(String(20), nullable=False)
    message = Column(Text)
    is_resolved = Column(Boolean, default=False)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    resolved_at = Column(DateTime(timezone=True))

    __table_args__ = (
        CheckConstraint("severity IN ('info', 'warning', 'critical')", name="ck_alert_severity"),
        Index("idx_alerts_device", "device_id", "created_at"),
    )

    device = relationship("Device", back_populates="alerts")


class Command(Base):
    __tablename__ = "commands"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    device_id = Column(UUID(as_uuid=True), ForeignKey("devices.id", ondelete="CASCADE"), nullable=False)
    command_type = Column(String(50), nullable=False)
    payload = Column(JSONB, default={})
    status = Column(String(20), default="pending")
    created_by = Column(UUID(as_uuid=True), ForeignKey("users.id"))
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    completed_at = Column(DateTime(timezone=True))

    __table_args__ = (
        CheckConstraint("status IN ('pending', 'sent', 'ack', 'completed', 'failed')", name="ck_command_status"),
    )

    device = relationship("Device", back_populates="commands")
