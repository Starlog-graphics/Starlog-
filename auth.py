from fastapi import Header, HTTPException, Depends
import httpx
from .config import settings
from .db import supabase

async def current_user(authorization: str | None = Header(default=None)):
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(401,"Missing bearer token")
    token=authorization.split(" ",1)[1].strip()
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            r=await client.get(f"{settings.supabase_url}/auth/v1/user",headers={"Authorization":f"Bearer {token}","apikey":settings.supabase_service_role_key})
        if r.status_code != 200: raise HTTPException(401,"Invalid or expired token")
        return r.json()
    except httpx.HTTPError:
        raise HTTPException(503,"Authentication service unavailable")

async def require_admin(user=Depends(current_user)):
    row=supabase.table("admins").select("user_id").eq("user_id",user["id"]).limit(1).execute()
    if not row.data: raise HTTPException(403,"Admin access required")
    return user
