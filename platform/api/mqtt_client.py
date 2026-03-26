"""MQTT client per il cloud API.

Ascolta telemetria dai dispositivi, salva in PostgreSQL,
genera alert e pubblica su Redis per i WebSocket.
"""

import asyncio
import json
import logging
from datetime import datetime, timezone

import aiomqtt
import redis.asyncio as redis
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from config import settings
from database import async_session
from models import Device, Telemetry, Alert

logger = logging.getLogger(__name__)

# Soglie alert
ALERT_THRESHOLDS = {
    "cpu_high": 90,
    "memory_high": 90,
    "disk_high": 90,
    "wan_down_is_critical": True,
    "tunnel_disconnect": True,
}


class MQTTManager:
    """Gestisce la connessione MQTT e processa i messaggi dai dispositivi."""

    def __init__(self):
        self._latest_telemetry: dict | None = None
        self._redis: redis.Redis | None = None
        self._telemetry_buffer: list[dict] = []
        self._buffer_flush_interval = 30  # secondi
        self._last_flush = 0

    async def start(self):
        """Loop principale: ascolta tutti i topic dei dispositivi."""
        self._redis = redis.from_url(settings.REDIS_URL)

        while True:
            try:
                async with aiomqtt.Client(
                    settings.MQTT_BROKER,
                    settings.MQTT_PORT,
                    username=settings.MQTT_USER or None,
                    password=settings.MQTT_PASS or None,
                ) as client:
                    await client.subscribe("omr/#")
                    logger.info("MQTT connesso, in ascolto su omr/#")

                    async for message in client.messages:
                        await self._handle_message(message)

                        # Flush buffer periodicamente
                        now = asyncio.get_event_loop().time()
                        if now - self._last_flush > self._buffer_flush_interval and self._telemetry_buffer:
                            await self._flush_telemetry_buffer()
                            self._last_flush = now

            except aiomqtt.MqttError as e:
                logger.warning(f"MQTT disconnesso: {e}, riconnessione in 5s...")
                await asyncio.sleep(5)

    async def _handle_message(self, message):
        topic = str(message.topic)
        parts = topic.split("/")
        if len(parts) < 4:
            return

        tenant_slug = parts[1]
        device_id = parts[2]
        msg_type = parts[3]

        try:
            payload = json.loads(message.payload.decode())
        except (json.JSONDecodeError, UnicodeDecodeError):
            return

        payload["_device_id"] = device_id
        payload["_tenant"] = tenant_slug
        payload["_received_at"] = datetime.now(timezone.utc).isoformat()

        if msg_type == "telemetry":
            await self._handle_telemetry(device_id, payload)
        elif msg_type == "status":
            await self._handle_status(device_id, payload)
        elif msg_type == "command" and len(parts) > 4 and parts[4] == "ack":
            await self._handle_command_ack(device_id, payload)

    async def _handle_telemetry(self, device_id: str, data: dict):
        """Salva telemetria in Redis (real-time) e buffer per DB."""
        self._latest_telemetry = data

        # Pubblica su Redis per WebSocket real-time
        if self._redis:
            await self._redis.publish("telemetry", json.dumps(data))
            await self._redis.set(f"device:{device_id}:telemetry", json.dumps(data), ex=300)

        # Aggiungi al buffer per batch insert in DB
        self._telemetry_buffer.append({
            "device_id_str": device_id,
            "cpu_usage": data.get("cpu_usage"),
            "memory_usage": data.get("memory_usage"),
            "uptime": data.get("uptime"),
            "wan_status": data.get("wan_status"),
            "mptcp_status": data.get("mptcp_status"),
            "tunnel_status": data.get("tunnel_status"),
            "zenarmor": data.get("zenarmor"),
        })

        # Check alert
        await self._check_alerts(device_id, data)

        # Aggiorna last_seen
        await self._update_device_status(device_id, True, data)

    async def _handle_status(self, device_id: str, data: dict):
        """Aggiorna stato online/offline del dispositivo."""
        online = data.get("online", False)

        if self._redis:
            await self._redis.set(f"device:{device_id}:online", json.dumps(data), ex=120)

        await self._update_device_status(device_id, online, data)

        if not online:
            await self._create_alert(device_id, "device_offline", "warning", f"Dispositivo {device_id} offline")

    async def _handle_command_ack(self, device_id: str, data: dict):
        """Aggiorna stato comando nel DB."""
        try:
            async with async_session() as session:
                # Aggiorna l'ultimo comando pending per il device
                cmd_type = data.get("command", "")
                status = "completed" if data.get("status") == "ok" else "failed"
                from sqlalchemy import and_
                stmt = (
                    update(Command)
                    .where(and_(
                        Command.device_id == select(Device.id).where(Device.device_id == device_id).scalar_subquery(),
                        Command.status.in_(["pending", "sent"]),
                        Command.command_type == cmd_type,
                    ))
                    .values(status=status, completed_at=datetime.now(timezone.utc))
                )
                await session.execute(stmt)
                await session.commit()
        except Exception as e:
            logger.error(f"Errore aggiornamento comando: {e}")

    async def _update_device_status(self, device_id: str, online: bool, data: dict):
        """Aggiorna stato dispositivo nel DB."""
        try:
            async with async_session() as session:
                stmt = (
                    update(Device)
                    .where(Device.device_id == device_id)
                    .values(
                        is_online=online,
                        last_seen_at=datetime.now(timezone.utc),
                        firmware_version=data.get("firmware", None),
                        model=data.get("model", None),
                    )
                )
                await session.execute(stmt)
                await session.commit()
        except Exception as e:
            logger.debug(f"Device {device_id} non trovato nel DB (normale in dev): {e}")

    async def _flush_telemetry_buffer(self):
        """Batch insert telemetria in PostgreSQL."""
        if not self._telemetry_buffer:
            return

        buffer = self._telemetry_buffer.copy()
        self._telemetry_buffer.clear()

        try:
            async with async_session() as session:
                # Risolvi device_id stringa → UUID
                for item in buffer:
                    device_id_str = item.pop("device_id_str")
                    result = await session.execute(
                        select(Device.id).where(Device.device_id == device_id_str)
                    )
                    row = result.scalar_one_or_none()
                    if row:
                        item["device_id"] = row
                        session.add(Telemetry(**item))

                await session.commit()
                logger.info(f"Flush {len(buffer)} record telemetria nel DB")
        except Exception as e:
            logger.error(f"Errore flush telemetria: {e}")

    async def _check_alerts(self, device_id: str, data: dict):
        """Controlla soglie e genera alert."""
        cpu = data.get("cpu_usage", 0)
        mem = data.get("memory_usage", 0)
        disk = data.get("disk_usage", 0)

        if cpu >= ALERT_THRESHOLDS["cpu_high"]:
            await self._create_alert(device_id, "high_cpu", "warning", f"CPU al {cpu}%")

        if mem >= ALERT_THRESHOLDS["memory_high"]:
            await self._create_alert(device_id, "high_memory", "warning", f"RAM al {mem}%")

        if disk and disk >= ALERT_THRESHOLDS["disk_high"]:
            await self._create_alert(device_id, "high_disk", "warning", f"Disco al {disk}%")

        # WAN down
        for wan in data.get("wan_status", []):
            if not wan.get("is_up", True):
                await self._create_alert(device_id, "wan_down", "critical", f"WAN {wan.get('name', '?')} offline")

        # Tunnel disconnesso
        tunnel = data.get("tunnel_status", {})
        if not tunnel.get("connected", True):
            await self._create_alert(device_id, "tunnel_down", "critical", "Tunnel VPN disconnesso")

        # Zenarmor minacce
        zen = data.get("zenarmor", {})
        zen_stats = zen.get("stats", {})
        threats = zen_stats.get("threats_blocked_today", 0)
        if threats > 1000:
            await self._create_alert(device_id, "high_threats", "warning", f"Zenarmor: {threats} minacce bloccate oggi")

    async def _create_alert(self, device_id: str, alert_type: str, severity: str, message: str):
        """Crea un alert nel DB e pubblica su Redis."""
        try:
            # Pubblica su Redis per notifiche real-time
            if self._redis:
                alert_data = {
                    "device_id": device_id,
                    "alert_type": alert_type,
                    "severity": severity,
                    "message": message,
                    "timestamp": datetime.now(timezone.utc).isoformat(),
                }
                await self._redis.publish("alerts", json.dumps(alert_data))

                # Dedup: non creare alert uguali entro 5 minuti
                dedup_key = f"alert:{device_id}:{alert_type}"
                if await self._redis.exists(dedup_key):
                    return
                await self._redis.set(dedup_key, "1", ex=300)

            # Salva nel DB
            async with async_session() as session:
                result = await session.execute(
                    select(Device.id).where(Device.device_id == device_id)
                )
                db_device_id = result.scalar_one_or_none()
                if db_device_id:
                    session.add(Alert(
                        device_id=db_device_id,
                        alert_type=alert_type,
                        severity=severity,
                        message=message,
                    ))
                    await session.commit()

            logger.info(f"Alert [{severity}] {device_id}: {message}")
        except Exception as e:
            logger.debug(f"Errore creazione alert: {e}")

    async def get_latest_telemetry(self) -> dict | None:
        return self._latest_telemetry

    async def send_command(self, tenant_slug: str, device_id: str, command: dict):
        """Invia un comando a un dispositivo via MQTT."""
        async with aiomqtt.Client(
            settings.MQTT_BROKER,
            settings.MQTT_PORT,
            username=settings.MQTT_USER,
            password=settings.MQTT_PASS,
        ) as client:
            topic = f"omr/{tenant_slug}/{device_id}/command"
            await client.publish(topic, json.dumps(command))


# Import qui per evitare circular import
from models import Command

mqtt_manager = MQTTManager()
