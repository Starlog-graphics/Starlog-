from fastapi import HTTPException
from .db import supabase

PRICES = {"Simple": 5000, "Classic": 6300, "Premium": 8000, "Supa": 10000}
RESTRICTED_HIGH = {"Logos", "Clothing Designs", "Packaging", "Branding", "Banners"}
CERTIFICATE = {"Certificates"}

def profile(uid):
    r=supabase.table("profiles").select("*").eq("id",uid).single().execute()
    if not r.data: raise HTTPException(404,"Profile not found")
    return r.data

def owned_order(uid,order_id):
    r=supabase.table("orders").select("*").eq("id",order_id).eq("user_id",uid).single().execute()
    if not r.data: raise HTTPException(404,"Order not found")
    return r.data

def validate_category_level(category_id, subcategory_id, level, template_id=None):
    level=level.title()
    if level not in PRICES: raise HTTPException(400,"Invalid design level")
    category_name=None; subcategory_name=None
    if template_id:
        t=supabase.table("templates").select("id,category_id,subcategory_id,is_active").eq("id",template_id).single().execute().data
        if not t or not t.get("is_active"): raise HTTPException(404,"Design not found or inactive")
        category_id=t.get("category_id"); subcategory_id=t.get("subcategory_id")
    if category_id:
        c=supabase.table("categories").select("name").eq("id",category_id).single().execute().data
        category_name=c.get("name") if c else None
    if subcategory_id:
        sc=supabase.table("subcategories").select("name").eq("id",subcategory_id).single().execute().data
        subcategory_name=sc.get("name") if sc else None
    if category_name in {"Logos", "Clothing Designs"} and level not in {"Premium", "Supa"}:
        raise HTTPException(400,f"{category_name} only offers Premium and Supa")
    if category_name == "Digital Products" and subcategory_name and subcategory_name.strip().lower() == "presentation templates" and level not in {"Premium", "Supa"}:
        raise HTTPException(400,"Presentation Templates only offer Premium and Supa")
    if category_name == "Flyers" and level == "Supa":
        raise HTTPException(400,"Flyers only offer Simple, Classic and Premium")
    if subcategory_name and subcategory_name.strip().lower() == "wedding invitations" and level == "Supa":
        raise HTTPException(400,"Wedding Invitations do not offer Supa")
    return PRICES[level]
