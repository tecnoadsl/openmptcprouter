from contextlib import asynccontextmanager
import asyncio
import json

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
import redis.asyncio as aioredis

from config import settings
from mqtt_client import mqtt_manager
from devices import router as devices_router
from tenants import router as tenants_router
from auth import router as auth_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    task = asyncio.create_task(mqtt_manager.start())
    yield
    task.cancel()


app = FastAPI(
    title="OMR Platform API",
    description="OpenMPTCProuter Management Platform - Tecnoadsl",
    version="0.2.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router, prefix="/auth", tags=["auth"])
app.include_router(devices_router, prefix="/devices", tags=["devices"])
app.include_router(tenants_router, prefix="/manage", tags=["management"])


@app.get("/")
async def root():
    return {"name": "OMR Platform", "version": "0.2.0"}


@app.get("/health")
async def health():
    return {"status": "ok"}


@app.websocket("/ws/telemetry")
async def websocket_telemetry(websocket: WebSocket):
    """WebSocket per telemetria real-time via Redis pub/sub."""
    await websocket.accept()
    r = aioredis.from_url(settings.REDIS_URL)
    pubsub = r.pubsub()
    await pubsub.subscribe("telemetry")

    try:
        while True:
            message = await pubsub.get_message(ignore_subscribe_messages=True, timeout=1.0)
            if message and message["type"] == "message":
                await websocket.send_text(message["data"].decode())
            await asyncio.sleep(0.1)
    except WebSocketDisconnect:
        pass
    finally:
        await pubsub.unsubscribe("telemetry")
        await r.close()


@app.websocket("/ws/alerts")
async def websocket_alerts(websocket: WebSocket):
    """WebSocket per alert real-time."""
    await websocket.accept()
    r = aioredis.from_url(settings.REDIS_URL)
    pubsub = r.pubsub()
    await pubsub.subscribe("alerts")

    try:
        while True:
            message = await pubsub.get_message(ignore_subscribe_messages=True, timeout=1.0)
            if message and message["type"] == "message":
                await websocket.send_text(message["data"].decode())
            await asyncio.sleep(0.1)
    except WebSocketDisconnect:
        pass
    finally:
        await pubsub.unsubscribe("alerts")
        await r.close()
