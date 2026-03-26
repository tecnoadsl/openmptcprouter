"""Autenticazione JWT multi-tenant."""

from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from jose import JWTError, jwt
import bcrypt
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from config import settings
from database import get_db
from models import User

router = APIRouter()
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/token")


def verify_password(plain: str, hashed: str) -> bool:
    return bcrypt.checkpw(plain.encode(), hashed.encode())


def hash_password(plain: str) -> str:
    return bcrypt.hashpw(plain.encode(), bcrypt.gensalt()).decode()

ALGORITHM = "HS256"


class Token(BaseModel):
    access_token: str
    token_type: str
    role: str
    tenant_id: str | None = None

class TokenData(BaseModel):
    user_id: str
    role: str
    tenant_id: str | None = None
    organization_id: str | None = None

class UserCreate(BaseModel):
    email: str
    password: str
    full_name: str
    role: str = "viewer"
    tenant_id: str | None = None
    organization_id: str | None = None


def create_access_token(data: dict) -> str:
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, settings.SECRET_KEY, algorithm=ALGORITHM)


async def get_current_user(token: str = Depends(oauth2_scheme)) -> TokenData:
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[ALGORITHM])
        return TokenData(
            user_id=payload.get("sub"),
            role=payload.get("role"),
            tenant_id=payload.get("tenant_id"),
            organization_id=payload.get("organization_id"),
        )
    except JWTError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token non valido")


@router.post("/token", response_model=Token)
async def login(form_data: OAuth2PasswordRequestForm = Depends(), db: AsyncSession = Depends(get_db)):
    """Login con email e password."""
    result = await db.execute(select(User).where(User.email == form_data.username))
    user = result.scalar_one_or_none()

    if not user or not verify_password(form_data.password, user.password_hash):
        # Fallback dev: accetta qualsiasi login se non ci sono utenti
        result2 = await db.execute(select(User))
        if result2.scalar_one_or_none() is None:
            token = create_access_token({
                "sub": form_data.username,
                "role": "super_admin",
                "tenant_id": None,
            })
            return Token(access_token=token, token_type="bearer", role="super_admin")
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Credenziali errate")

    if not user.is_active:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Utente disabilitato")

    token = create_access_token({
        "sub": str(user.id),
        "role": user.role,
        "tenant_id": str(user.tenant_id) if user.tenant_id else None,
        "organization_id": str(user.organization_id) if user.organization_id else None,
    })
    return Token(
        access_token=token,
        token_type="bearer",
        role=user.role,
        tenant_id=str(user.tenant_id) if user.tenant_id else None,
    )


@router.post("/register", status_code=201)
async def register(
    user_data: UserCreate,
    current_user: TokenData = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Crea un nuovo utente (solo admin)."""
    if current_user.role not in ("super_admin", "reseller_admin"):
        raise HTTPException(403, "Non autorizzato")

    existing = await db.execute(select(User).where(User.email == user_data.email))
    if existing.scalar_one_or_none():
        raise HTTPException(409, "Email già registrata")

    from uuid import UUID
    user = User(
        email=user_data.email,
        password_hash=hash_password(user_data.password),
        full_name=user_data.full_name,
        role=user_data.role,
        tenant_id=UUID(user_data.tenant_id) if user_data.tenant_id else None,
        organization_id=UUID(user_data.organization_id) if user_data.organization_id else None,
    )
    db.add(user)
    await db.commit()
    return {"status": "created", "email": user.email}
