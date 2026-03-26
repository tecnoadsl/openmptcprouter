"""API endpoints per dispositivi, telemetria, alert e comandi."""

from datetime import datetime, timezone
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import select, func, and_, desc
from sqlalchemy.ext.asyncio import AsyncSession

from auth import get_current_user, TokenData
from database import get_db
from models import Device, Telemetry, Alert, Command, Site, Organization, Tenant
from mqtt_client import mqtt_manager

router = APIRouter()


# === Schemas ===

class DeviceCreate(BaseModel):
    site_id: UUID
    device_id: str
    name: str
    device_type: str  # router | vps
    model: str | None = None

class DeviceUpdate(BaseModel):
    name: str | None = None
    model: str | None = None
    config: dict | None = None

class CommandRequest(BaseModel):
    command_type: str
    payload: dict = {}

class AlertUpdate(BaseModel):
    is_resolved: bool


# === Device CRUD ===

@router.get("/")
async def list_devices(
    device_type: str | None = None,
    online_only: bool = False,
    limit: int = Query(100, le=500),
    offset: int = 0,
    user: TokenData = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Lista dispositivi con filtro multi-tenant."""
    query = select(Device).join(Site).join(Organization)

    # Filtro multi-tenant in base al ruolo
    if user.tenant_id:
        query = query.where(Organization.tenant_id == UUID(user.tenant_id))
    if user.organization_id:
        query = query.where(Organization.id == UUID(user.organization_id))

    if device_type:
        query = query.where(Device.device_type == device_type)
    if online_only:
        query = query.where(Device.is_online == True)

    query = query.order_by(Device.name).offset(offset).limit(limit)
    result = await db.execute(query)
    devices = result.scalars().all()

    return {
        "devices": [
            {
                "id": str(d.id),
                "device_id": d.device_id,
                "name": d.name,
                "device_type": d.device_type,
                "model": d.model,
                "firmware_version": d.firmware_version,
                "is_online": d.is_online,
                "last_seen_at": d.last_seen_at.isoformat() if d.last_seen_at else None,
                "site_id": str(d.site_id),
            }
            for d in devices
        ],
        "total": len(devices),
    }


@router.post("/", status_code=201)
async def create_device(
    device: DeviceCreate,
    user: TokenData = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Registra un nuovo dispositivo (provisioning)."""
    import secrets
    mqtt_password = secrets.token_urlsafe(24)

    db_device = Device(
        site_id=device.site_id,
        device_id=device.device_id,
        name=device.name,
        device_type=device.device_type,
        model=device.model,
        mqtt_password=mqtt_password,
    )
    db.add(db_device)
    await db.commit()
    await db.refresh(db_device)

    return {
        "id": str(db_device.id),
        "device_id": db_device.device_id,
        "mqtt_password": mqtt_password,  # Mostrare solo alla creazione
        "mqtt_broker": "cloud.tecnoadsl.net",
        "mqtt_port": 8883,
        "mqtt_topic": f"omr/tecnoadsl/{db_device.device_id}",
    }


@router.get("/{device_id}")
async def get_device(
    device_id: str,
    user: TokenData = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Dettaglio dispositivo con ultima telemetria da Redis."""
    result = await db.execute(select(Device).where(Device.device_id == device_id))
    device = result.scalar_one_or_none()

    if not device:
        return {"device_id": device_id, "status": "not_registered"}

    # Ultima telemetria da Redis (real-time)
    import redis.asyncio as r
    from config import settings
    redis_client = r.from_url(settings.REDIS_URL)
    cached = await redis_client.get(f"device:{device_id}:telemetry")
    await redis_client.close()

    return {
        "id": str(device.id),
        "device_id": device.device_id,
        "name": device.name,
        "device_type": device.device_type,
        "model": device.model,
        "firmware_version": device.firmware_version,
        "is_online": device.is_online,
        "last_seen_at": device.last_seen_at.isoformat() if device.last_seen_at else None,
        "config": device.config,
        "telemetry": __import__("json").loads(cached) if cached else None,
    }


@router.patch("/{device_id}")
async def update_device(
    device_id: str,
    update: DeviceUpdate,
    user: TokenData = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Aggiorna info dispositivo."""
    result = await db.execute(select(Device).where(Device.device_id == device_id))
    device = result.scalar_one_or_none()
    if not device:
        raise HTTPException(404, "Dispositivo non trovato")

    if update.name is not None:
        device.name = update.name
    if update.model is not None:
        device.model = update.model
    if update.config is not None:
        device.config = update.config

    await db.commit()
    return {"status": "ok"}


@router.delete("/{device_id}")
async def delete_device(
    device_id: str,
    user: TokenData = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Rimuovi un dispositivo."""
    result = await db.execute(select(Device).where(Device.device_id == device_id))
    device = result.scalar_one_or_none()
    if not device:
        raise HTTPException(404, "Dispositivo non trovato")

    await db.delete(device)
    await db.commit()
    return {"status": "deleted"}


# === Telemetria ===

@router.get("/{device_id}/telemetry")
async def get_telemetry(
    device_id: str,
    limit: int = Query(100, le=1000),
    hours: int = Query(24, le=720),
    user: TokenData = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Storico telemetria del dispositivo."""
    from datetime import timedelta
    since = datetime.now(timezone.utc) - timedelta(hours=hours)

    result = await db.execute(
        select(Telemetry)
        .join(Device)
        .where(and_(Device.device_id == device_id, Telemetry.timestamp >= since))
        .order_by(desc(Telemetry.timestamp))
        .limit(limit)
    )
    rows = result.scalars().all()

    return {
        "device_id": device_id,
        "count": len(rows),
        "telemetry": [
            {
                "timestamp": t.timestamp.isoformat(),
                "cpu_usage": t.cpu_usage,
                "memory_usage": t.memory_usage,
                "uptime": t.uptime,
                "wan_status": t.wan_status,
                "mptcp_status": t.mptcp_status,
                "tunnel_status": t.tunnel_status,
                "zenarmor": t.zenarmor,
            }
            for t in rows
        ],
    }


# === Comandi ===

@router.post("/{device_id}/command")
async def send_command(
    device_id: str,
    cmd: CommandRequest,
    user: TokenData = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Invia comando al dispositivo via MQTT e logga nel DB."""
    # Salva comando nel DB
    result = await db.execute(select(Device).where(Device.device_id == device_id))
    device = result.scalar_one_or_none()

    if device:
        db_cmd = Command(
            device_id=device.id,
            command_type=cmd.command_type,
            payload=cmd.payload,
            status="sent",
        )
        db.add(db_cmd)
        await db.commit()

    # Invia via MQTT
    await mqtt_manager.send_command("tecnoadsl", device_id, {
        "type": cmd.command_type,
        "payload": cmd.payload,
    })

    return {"status": "sent", "device_id": device_id, "command": cmd.command_type}


@router.get("/{device_id}/commands")
async def get_commands(
    device_id: str,
    limit: int = Query(50, le=200),
    user: TokenData = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Storico comandi per un dispositivo."""
    result = await db.execute(
        select(Command)
        .join(Device)
        .where(Device.device_id == device_id)
        .order_by(desc(Command.created_at))
        .limit(limit)
    )
    rows = result.scalars().all()

    return {
        "device_id": device_id,
        "commands": [
            {
                "id": str(c.id),
                "command_type": c.command_type,
                "payload": c.payload,
                "status": c.status,
                "created_at": c.created_at.isoformat(),
                "completed_at": c.completed_at.isoformat() if c.completed_at else None,
            }
            for c in rows
        ],
    }


# === Alert ===

@router.get("/{device_id}/alerts")
async def get_alerts(
    device_id: str,
    resolved: bool | None = None,
    limit: int = Query(50, le=200),
    user: TokenData = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Alert per un dispositivo."""
    query = select(Alert).join(Device).where(Device.device_id == device_id)
    if resolved is not None:
        query = query.where(Alert.is_resolved == resolved)
    query = query.order_by(desc(Alert.created_at)).limit(limit)

    result = await db.execute(query)
    rows = result.scalars().all()

    return {
        "device_id": device_id,
        "alerts": [
            {
                "id": str(a.id),
                "alert_type": a.alert_type,
                "severity": a.severity,
                "message": a.message,
                "is_resolved": a.is_resolved,
                "created_at": a.created_at.isoformat(),
                "resolved_at": a.resolved_at.isoformat() if a.resolved_at else None,
            }
            for a in rows
        ],
    }


@router.patch("/{device_id}/alerts/{alert_id}")
async def update_alert(
    device_id: str,
    alert_id: str,
    update: AlertUpdate,
    user: TokenData = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Risolvi un alert."""
    result = await db.execute(select(Alert).where(Alert.id == UUID(alert_id)))
    alert = result.scalar_one_or_none()
    if not alert:
        raise HTTPException(404, "Alert non trovato")

    alert.is_resolved = update.is_resolved
    if update.is_resolved:
        alert.resolved_at = datetime.now(timezone.utc)
    await db.commit()
    return {"status": "ok"}
