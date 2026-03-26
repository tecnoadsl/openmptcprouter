"""API endpoints per gestione multi-tenant: tenant, organizzazioni, siti."""

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from auth import get_current_user, TokenData
from database import get_db
from models import Tenant, Organization, Site, Device

router = APIRouter()


# === Schemas ===

class TenantCreate(BaseModel):
    name: str
    slug: str
    max_devices: int = 100

class OrgCreate(BaseModel):
    tenant_id: UUID
    name: str

class SiteCreate(BaseModel):
    organization_id: UUID
    name: str
    address: str | None = None
    latitude: float | None = None
    longitude: float | None = None


# === Tenant ===

@router.get("/tenants")
async def list_tenants(user: TokenData = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    if user.role != "super_admin":
        raise HTTPException(403, "Solo super_admin")
    result = await db.execute(select(Tenant).order_by(Tenant.name))
    tenants = result.scalars().all()
    return {"tenants": [{"id": str(t.id), "name": t.name, "slug": t.slug, "is_active": t.is_active, "max_devices": t.max_devices} for t in tenants]}

@router.post("/tenants", status_code=201)
async def create_tenant(tenant: TenantCreate, user: TokenData = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    if user.role != "super_admin":
        raise HTTPException(403, "Solo super_admin")
    db_tenant = Tenant(name=tenant.name, slug=tenant.slug, max_devices=tenant.max_devices)
    db.add(db_tenant)
    await db.commit()
    await db.refresh(db_tenant)
    return {"id": str(db_tenant.id), "name": db_tenant.name, "slug": db_tenant.slug}


# === Organizzazioni ===

@router.get("/organizations")
async def list_organizations(
    tenant_id: UUID | None = None,
    user: TokenData = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    query = select(Organization).order_by(Organization.name)
    if tenant_id:
        query = query.where(Organization.tenant_id == tenant_id)
    elif user.tenant_id:
        query = query.where(Organization.tenant_id == UUID(user.tenant_id))
    result = await db.execute(query)
    orgs = result.scalars().all()
    return {"organizations": [{"id": str(o.id), "tenant_id": str(o.tenant_id), "name": o.name, "is_active": o.is_active} for o in orgs]}

@router.post("/organizations", status_code=201)
async def create_organization(org: OrgCreate, user: TokenData = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    db_org = Organization(tenant_id=org.tenant_id, name=org.name)
    db.add(db_org)
    await db.commit()
    await db.refresh(db_org)
    return {"id": str(db_org.id), "name": db_org.name}


# === Siti ===

@router.get("/sites")
async def list_sites(
    organization_id: UUID | None = None,
    user: TokenData = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    query = select(Site).order_by(Site.name)
    if organization_id:
        query = query.where(Site.organization_id == organization_id)
    result = await db.execute(query)
    sites = result.scalars().all()
    return {"sites": [{"id": str(s.id), "organization_id": str(s.organization_id), "name": s.name, "address": s.address, "latitude": s.latitude, "longitude": s.longitude} for s in sites]}

@router.post("/sites", status_code=201)
async def create_site(site: SiteCreate, user: TokenData = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    db_site = Site(organization_id=site.organization_id, name=site.name, address=site.address, latitude=site.latitude, longitude=site.longitude)
    db.add(db_site)
    await db.commit()
    await db.refresh(db_site)
    return {"id": str(db_site.id), "name": db_site.name}


# === Dashboard stats ===

@router.get("/stats")
async def get_stats(user: TokenData = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    """Statistiche globali per la dashboard cloud."""
    devices_total = await db.scalar(select(func.count(Device.id)))
    devices_online = await db.scalar(select(func.count(Device.id)).where(Device.is_online == True))
    routers = await db.scalar(select(func.count(Device.id)).where(Device.device_type == "router"))
    vpss = await db.scalar(select(func.count(Device.id)).where(Device.device_type == "vps"))
    tenants = await db.scalar(select(func.count(Tenant.id)))
    orgs = await db.scalar(select(func.count(Organization.id)))
    sites = await db.scalar(select(func.count(Site.id)))
    from models import Alert
    active_alerts = await db.scalar(select(func.count(Alert.id)).where(Alert.is_resolved == False))

    return {
        "devices_total": devices_total or 0,
        "devices_online": devices_online or 0,
        "routers": routers or 0,
        "vpss": vpss or 0,
        "tenants": tenants or 0,
        "organizations": orgs or 0,
        "sites": sites or 0,
        "active_alerts": active_alerts or 0,
    }
