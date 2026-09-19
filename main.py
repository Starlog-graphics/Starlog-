from fastapi import FastAPI, Depends, HTTPException, Request, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware
from .config import settings
from .db import supabase
from .auth import current_user, require_admin
from .schemas import (OrderCreate, PaymentInit, BankTransferCreate, CustomRequestCreate,
                      PayoutCreate, PayoutStatusUpdate, PaymentStatusUpdate, CustomRequestStatusUpdate, ReferralClaim)
from .utils import owned_order, profile, PRICES, validate_category_level
import httpx, hashlib, hmac, secrets, uuid, os
from datetime import datetime, timezone

app = FastAPI(title="Starlog API", version="2.0.0")
app.add_middleware(
    CORSMiddleware, allow_origins=settings.allowed_origins, allow_credentials=True,
    allow_methods=["*"], allow_headers=["*"]
)

@app.get("/health")
def health(): return {"status":"ok","service":"starlog-backend","version":"2.0.0"}

@app.get("/api/config/public")
def public_config():
    return {
        "paystack_public_key": settings.paystack_public_key,
        "currency": settings.currency,
        "bank_name": settings.bank_name,
        "bank_account_number": settings.bank_account_number,
        "bank_account_name": settings.bank_account_name,
        "referral_reward_ngn": settings.referral_reward_ngn,
    }

@app.get("/api/pricing")
def pricing(): return {"currency":settings.currency,"prices":PRICES,"referral_reward":settings.referral_reward_ngn}

async def paystack_request(method: str, path: str, payload=None):
    if not settings.paystack_secret_key:
        raise HTTPException(503, "Paystack is not configured")
    headers={"Authorization":f"Bearer {settings.paystack_secret_key}","Content-Type":"application/json"}
    async with httpx.AsyncClient(timeout=25) as client:
        r=await client.request(method, settings.paystack_base_url+path, json=payload, headers=headers)
    if r.status_code >= 400:
        raise HTTPException(502, "Paystack request failed")
    body=r.json()
    if not body.get("status"):
        raise HTTPException(502, body.get("message") or "Paystack request failed")
    return body.get("data") or {}

async def verify_and_settle(reference: str):
    rows=supabase.table("payments").select("*").eq("transaction_reference",reference).limit(1).execute().data
    if not rows: raise HTTPException(404,"Payment not found")
    payment=rows[0]
    data=await paystack_request("GET",f"/transaction/verify/{reference}")
    expected_kobo=int(round(float(payment["amount"])*100))
    if data.get("status") != "success":
        return {"verified":False,"status":data.get("status","failed")}
    if int(data.get("amount",-1)) != expected_kobo or data.get("currency") != payment["currency"]:
        raise HTTPException(400,"Payment amount or currency does not match the order")
    # Idempotent: repeated webhook/callback verification is safe.
    # Mark the payment successful and move the related order to Paid.
    # Both updates are idempotent so repeated Paystack callbacks are safe.
    supabase.table("payments").update({
        "payment_status":"Successful", "payment_date":datetime.now(timezone.utc).isoformat()
    }).eq("id",payment["id"]).neq("payment_status","Successful").execute()

    supabase.table("orders").update({
        "order_status":"Paid"
    }).eq("id",payment["order_id"]).eq("order_status","Pending").execute()

    return {"verified":True,"order_id":payment["order_id"],"reference":reference}

@app.get("/api/me")
async def me(user=Depends(current_user)): return profile(user["id"])

@app.post("/api/referrals/claim")
async def claim_referral(payload: ReferralClaim, user=Depends(current_user)):
    uid=user["id"]
    code=payload.referral_code.strip().upper()
    ref=supabase.table("profiles").select("id,referral_code").eq("referral_code",code).limit(1).execute().data
    if not ref: raise HTTPException(404,"Referral code not found")
    referrer=ref[0]["id"]
    if referrer == uid: raise HTTPException(400,"Self-referrals are not allowed")
    existing=supabase.table("referrals").select("id").eq("referred_user_id",uid).limit(1).execute().data
    if existing: return {"attributed":False,"reason":"already_attributed"}
    own=supabase.table("profiles").select("referred_by").eq("id",uid).single().execute().data
    if own and own.get("referred_by"): return {"attributed":False,"reason":"already_attributed"}
    supabase.table("profiles").update({"referred_by":referrer}).eq("id",uid).execute()
    amount=settings.referral_reward_ngn
    supabase.table("referrals").insert({"referrer_user_id":referrer,"referred_user_id":uid,"referral_code":code,"reward_amount":amount}).execute()
    return {"attributed":True}

@app.get("/api/referrals/summary")
async def referral_summary(user=Depends(current_user)):
    uid=user["id"]
    rows=supabase.table("referrals").select("id,reward_amount,reward_status,purchase_verified,created_at,referred_user_id").eq("referrer_user_id",uid).execute().data or []
    available=supabase.rpc("available_referral_balance",{"_user_id":uid}).execute().data
    try: available=float(available or 0)
    except: available=0
    eligible=available >= settings.payout_amount_ngn
    code=profile(uid).get("referral_code")
    return {"code":code,"link":settings.frontend_url.rstrip("/")+"/signup.html?ref="+str(code or ""),"rows":rows,"total":len(rows),
            "credited":sum(1 for r in rows if r.get("reward_status")=="Credited"),
            "earned":sum(float(r.get("reward_amount") or 0) for r in rows if r.get("reward_status")=="Credited"),
            "available":available,"eligible":eligible,"payout_amount":settings.payout_amount_ngn}

@app.post("/api/orders")
async def create_order(payload: OrderCreate, user=Depends(current_user)):
    if payload.is_custom and payload.template_id: raise HTTPException(400,"Custom orders cannot include template_id")
    if not payload.is_custom and not payload.template_id: raise HTTPException(400,"template_id is required")
    if payload.is_custom and not payload.brief: raise HTTPException(400,"brief is required")
    level=payload.complexity_level
    if not level: raise HTTPException(400,"complexity_level is required")
    price=validate_category_level(payload.category_id, payload.subcategory_id, level, payload.template_id)
    order={"user_id":user["id"],"template_id":payload.template_id,"is_custom":payload.is_custom,
           "complexity_level":level.upper(),"category_id":payload.category_id,"subcategory_id":payload.subcategory_id,
           "brief":payload.brief,"total_price":price,"currency":settings.currency,"order_status":"Pending"}
    r=supabase.table("orders").insert(order).execute()
    if not r.data: raise HTTPException(500,"Could not create order")
    return r.data[0]

@app.get("/api/orders")
async def my_orders(user=Depends(current_user)):
    return supabase.table("orders").select("id,total_price,currency,order_status,complexity_level,is_custom,brief,created_at,template_id,templates(title,preview_image),categories(name),subcategories(name)").eq("user_id",user["id"]).order("created_at",desc=True).execute().data

@app.get("/api/orders/{order_id}")
async def get_order(order_id:str,user=Depends(current_user)):
    return owned_order(user["id"],order_id)

@app.get("/api/payments/mine")
async def my_payments(user=Depends(current_user)):
    return supabase.table("payments").select(
        "id,order_id,amount,currency,payment_method,transaction_reference,payment_status,payment_date,created_at"
    ).eq("user_id",user["id"]).order("created_at",desc=True).execute().data

@app.post("/api/payments/initialize")
async def initialize_payment(payload: PaymentInit,user=Depends(current_user)):
    order=owned_order(user["id"],payload.order_id)
    if order["order_status"] in ("Cancelled","Completed","Paid","In Progress"): raise HTTPException(400,"Order cannot be paid")
    email=payload.email or user.get("email")
    if not email: raise HTTPException(400,"Email is required for Paystack")
    reference=f"STARLOG-{order['id'][:8]}-{secrets.token_hex(6).upper()}"
    data=await paystack_request("POST","/transaction/initialize",{
        "email":email,"amount":int(round(float(order["total_price"])*100)),"currency":order["currency"],
        "reference":reference,"channels":["card"],
        "callback_url":settings.frontend_url.rstrip('/')+"/payment.html?order="+order["id"],
        "metadata":{"order_id":order["id"],"user_id":user["id"],"product_amount":str(order["total_price"])}
    })
    supabase.table("payments").insert({"order_id":order["id"],"user_id":user["id"],"amount":order["total_price"],"currency":order["currency"],"payment_method":"card","transaction_reference":reference,"payment_status":"Pending"}).execute()
    return {"authorization_url":data.get("authorization_url"),"access_code":data.get("access_code"),"reference":reference,"public_key":settings.paystack_public_key}

@app.post("/api/payments/bank-transfer")
async def create_bank_transfer(payload:BankTransferCreate,user=Depends(current_user)):
    order=owned_order(user["id"],payload.order_id)
    if order["order_status"] != "Pending": raise HTTPException(400,"Order is not awaiting payment")
    existing=supabase.table("payments").select("id,payment_status,transaction_reference").eq("order_id",order["id"]).in_("payment_status",["Pending"]).limit(1).execute().data
    if existing: return existing[0]
    ref=f"BANK-{order['id'][:8]}-{secrets.token_hex(6).upper()}"
    r=supabase.table("payments").insert({"order_id":order["id"],"user_id":user["id"],"amount":order["total_price"],"currency":order["currency"],"payment_method":"bank_transfer","transaction_reference":ref,"payment_status":"Pending"}).execute()
    return r.data[0] if r.data else {"transaction_reference":ref,"payment_status":"Pending"}

@app.get("/api/payments/verify/{reference}")
async def verify_payment(reference:str,user=Depends(current_user)):
    rows=supabase.table("payments").select("*").eq("transaction_reference",reference).eq("user_id",user["id"]).limit(1).execute().data
    if not rows: raise HTTPException(404,"Payment not found")
    return await verify_and_settle(reference)

@app.post("/api/payments/webhook")
async def paystack_webhook(request:Request):
    raw=await request.body(); signature=request.headers.get("x-paystack-signature","")
    if not settings.paystack_secret_key or not hmac.compare_digest(hmac.new(settings.paystack_secret_key.encode(),raw,hashlib.sha512).hexdigest(),signature):
        raise HTTPException(401,"Invalid signature")
    event=await request.json(); data=event.get("data") or {}
    if event.get("event")=="charge.success" and data.get("reference"):
        try: await verify_and_settle(data["reference"])
        except HTTPException: pass
    elif event.get("event") in {"transfer.success","transfer.failed","transfer.reversed"}:
        ref=data.get("reference")
        if ref:
            status={"transfer.success":"Paid","transfer.failed":"Rejected","transfer.reversed":"Cancelled"}[event["event"]]
            supabase.table("payout_requests").update({"status":status,"processed_at":datetime.now(timezone.utc).isoformat()}).eq("transfer_reference",ref).execute()
    return {"received":True}

@app.post("/api/admin/payments/{payment_id}/verify")
async def admin_verify_payment(payment_id:str,user=Depends(require_admin)):
    rows=supabase.table("payments").select("*").eq("id",payment_id).limit(1).execute().data
    if not rows: raise HTTPException(404,"Payment not found")
    p=rows[0]
    if p["payment_method"] != "bank_transfer": raise HTTPException(400,"Only manual bank transfers can be manually verified")
    supabase.table("payments").update({
        "payment_status":"Successful",
        "payment_date":datetime.now(timezone.utc).isoformat()
    }).eq("id",payment_id).execute()

    # A manually verified bank transfer also releases the order for fulfillment.
    supabase.table("orders").update({
        "order_status":"Paid"
    }).eq("id",p["order_id"]).eq("order_status","Pending").execute()

    return {"ok":True,"order_id":p["order_id"],"payment_status":"Successful"}

@app.post("/api/payouts")
async def request_payout(payload:PayoutCreate,user=Depends(current_user)):
    uid=user["id"]
    # Backend decides both eligibility and the fixed reward amount.
    available=supabase.rpc("available_referral_balance",{"_user_id":uid}).execute().data
    available=float(available or 0)
    if available < settings.payout_amount_ngn: raise HTTPException(400,"You are not eligible for a payout yet")
    pending=supabase.table("payout_requests").select("id").eq("user_id",uid).in_("status",["Pending","Processing"]).limit(1).execute().data
    if pending: raise HTTPException(409,"You already have a pending payout request")
    r=supabase.table("payout_requests").insert({"user_id":uid,"amount":settings.payout_amount_ngn,"bank_name":payload.bank_name,"account_number":payload.account_number,"account_name":payload.account_name,"status":"Pending"}).execute()
    if not r.data: raise HTTPException(500,"Could not create payout request")
    return r.data[0]

@app.get("/api/payouts")
async def my_payouts(user=Depends(current_user)):
    return supabase.table("payout_requests").select("*").eq("user_id",user["id"]).order("created_at",desc=True).execute().data

@app.post("/api/admin/payouts/{payout_id}/process")
async def process_payout(payout_id:str,user=Depends(require_admin)):
    rows=supabase.table("payout_requests").select("*").eq("id",payout_id).limit(1).execute().data
    if not rows: raise HTTPException(404,"Payout not found")
    p=rows[0]
    if p["status"] not in ("Pending",): raise HTTPException(400,"Payout is not pending")
    banks=await paystack_request("GET","/bank?country=nigeria&perPage=100")
    bank_code=None
    bank_rows = banks if isinstance(banks,list) else banks.get("data",[]) if isinstance(banks,dict) else []
    for b in bank_rows:
        if str(b.get("name","")).strip().lower()==p["bank_name"].strip().lower(): bank_code=b.get("code")
    if not bank_code: raise HTTPException(400,"Bank not found in Paystack bank list")
    recipient=await paystack_request("POST","/transferrecipient",{"type":"nuban","name":p["account_name"],"account_number":p["account_number"],"bank_code":bank_code,"currency":"NGN"})
    transfer=await paystack_request("POST","/transfer",{"source":"balance","amount":int(settings.payout_amount_ngn*100),"recipient":recipient["recipient_code"],"reason":"Starlog referral reward","reference":"STARLOG-PAYOUT-"+payout_id[:8].upper()})
    supabase.table("payout_requests").update({"status":"Processing","transfer_reference":transfer.get("reference")}).eq("id",payout_id).execute()
    return {"status":"Processing","reference":transfer.get("reference")}

@app.get("/api/admin/orders")
async def admin_orders(user=Depends(require_admin)):
    return supabase.table("orders").select("*,profiles(full_name,email),templates(title)").order("created_at",desc=True).execute().data

@app.patch("/api/admin/orders/{order_id}")
async def admin_order_status(order_id:str, request:Request, user=Depends(require_admin)):
    body=await request.json(); status=body.get("order_status")
    allowed={"Pending","Paid","In Progress","Completed","Cancelled"}
    if status not in allowed: raise HTTPException(400,"Invalid order status")
    r=supabase.table("orders").update({"order_status":status}).eq("id",order_id).execute()
    if not r.data: raise HTTPException(404,"Order not found")
    return r.data[0]

@app.get("/api/admin/payouts")
async def admin_payouts(user=Depends(require_admin)):
    return supabase.table("payout_requests").select("*,profiles(full_name,email)").order("created_at",desc=True).execute().data

@app.patch("/api/admin/payouts/{payout_id}")
async def admin_payout_status(payout_id:str,payload:PayoutStatusUpdate,user=Depends(require_admin)):
    r=supabase.table("payout_requests").update({"status":payload.status,"admin_note":payload.admin_note}).eq("id",payout_id).execute()
    if not r.data: raise HTTPException(404,"Payout not found")
    return r.data[0]

@app.get("/api/admin/payments")
async def admin_payments(user=Depends(require_admin)):
    return supabase.table("payments").select("*,orders(id,total_price,order_status),profiles(full_name,email)").order("created_at",desc=True).execute().data

@app.post("/api/custom-requests")
async def create_custom_request(payload:CustomRequestCreate,user=Depends(current_user)):
    order=owned_order(user["id"],payload.order_id)
    if order["order_status"] not in ("Paid","In Progress","Completed"): raise HTTPException(400,"Payment must be verified before submitting a customization request")
    r=supabase.table("custom_requests").insert({"order_id":order["id"],"user_id":user["id"],"instructions":payload.instructions,"status":"Pending"}).execute()
    if not r.data: raise HTTPException(500,"Could not create customization request")
    return r.data[0]

@app.post("/api/custom-requests/{request_id}/files")
async def upload_custom_request_file(request_id:str,file:UploadFile=File(...),user=Depends(current_user)):
    row=supabase.table("custom_requests").select("id,order_id,user_id").eq("id",request_id).eq("user_id",user["id"]).limit(1).execute().data
    if not row: raise HTTPException(404,"Customization request not found")
    allowed={"image/png","image/jpeg","application/pdf"}
    if file.content_type not in allowed: raise HTTPException(400,"Only PNG, JPG/JPEG or PDF files are allowed")
    data=await file.read()
    if len(data)>10*1024*1024: raise HTTPException(413,"File is too large")
    path=f"{user['id']}/{request_id}/{uuid.uuid4().hex}-{os.path.basename(file.filename or 'file')}"
    supabase.storage.from_(settings.customer_upload_bucket).upload(path,data,{"content-type":file.content_type,"upsert":False})
    current=supabase.table("custom_requests").select("additional_files").eq("id",request_id).single().execute().data
    files=list(current.get("additional_files") or [])
    files.append(path)
    supabase.table("custom_requests").update({"additional_files":files}).eq("id",request_id).execute()
    return {"path":path}

@app.get("/api/custom-requests")
async def my_custom_requests(user=Depends(current_user)):
    return supabase.table("custom_requests").select("*,orders(id,total_price,order_status,templates(title))").eq("user_id",user["id"]).order("created_at",desc=True).execute().data

@app.get("/api/admin/custom-requests")
async def admin_custom_requests(user=Depends(require_admin)):
    return supabase.table("custom_requests").select("*,profiles(full_name,email),orders(id,total_price,order_status,templates(title))").order("created_at",desc=True).execute().data

@app.patch("/api/admin/custom-requests/{request_id}")
async def admin_custom_request_status(request_id:str,payload:CustomRequestStatusUpdate,user=Depends(require_admin)):
    r=supabase.table("custom_requests").update({"status":payload.status}).eq("id",request_id).execute()
    if not r.data: raise HTTPException(404,"Customization request not found")
    return r.data[0]

@app.post("/api/admin/designs/upload")
async def admin_design_upload(
    category_id:str=Form(...), title:str=Form(...), description:str=Form(""), complexity_level:str=Form("CLASSIC"),
    file:UploadFile=File(...), user=Depends(require_admin)):
    allowed={"image/png","image/jpeg"}
    if file.content_type not in allowed: raise HTTPException(400,"Only PNG, JPG/JPEG files are allowed")
    if complexity_level.upper() not in {"SIMPLE","CLASSIC","PREMIUM","SUPA"}: raise HTTPException(400,"Invalid design level")
    data=await file.read()
    if len(data)>8*1024*1024: raise HTTPException(413,"Image is too large")
    ext=".png" if file.content_type=="image/png" else ".jpg"
    design_id=str(uuid.uuid4())
    path=f"admin/{design_id}{ext}"
    supabase.storage.from_(settings.design_preview_bucket).upload(path,data,{"content-type":file.content_type,"upsert":False})
    public_url=f"{settings.supabase_url}/storage/v1/object/public/{settings.design_preview_bucket}/{path}"
    price=PRICES[complexity_level.title()]
    r=supabase.table("templates").insert({"id":design_id,"category_id":category_id,"title":title,"slug":title.lower().replace(" ","-"),"description":description,"preview_image":public_url,"price":price,"currency":"NGN","complexity_level":complexity_level.upper(),"is_active":True}).execute()
    if not r.data: raise HTTPException(500,"Could not save design metadata")
    return r.data[0]


@app.post("/api/admin/hot-picks/upload")
async def admin_hot_pick_upload(
    slot:int=Form(...), title:str=Form(""), description:str=Form(""), file:UploadFile=File(...), user=Depends(require_admin)):
    if slot < 1 or slot > 10: raise HTTPException(400,"Hot Pick slot must be between 1 and 10")
    if file.content_type not in {"image/png","image/jpeg"}: raise HTTPException(400,"Only PNG, JPG/JPEG files are allowed")
    data=await file.read()
    if len(data)>8*1024*1024: raise HTTPException(413,"Image is too large")
    ext=".png" if file.content_type=="image/png" else ".jpg"
    path=f"hot-picks/slot-{slot}{ext}"
    supabase.storage.from_(settings.design_preview_bucket).upload(path,data,{"content-type":file.content_type,"upsert":True})
    public_url=f"{settings.supabase_url}/storage/v1/object/public/{settings.design_preview_bucket}/{path}"
    existing=supabase.table("hot_picks").select("id").eq("display_order",slot).limit(1).execute().data
    payload={"title":title or f"Hot Pick {slot}","description":description,"image_url":public_url,"display_order":slot,"is_active":True}
    if existing:
        r=supabase.table("hot_picks").update(payload).eq("id",existing[0]["id"]).execute()
    else:
        r=supabase.table("hot_picks").insert(payload).execute()
    if not r.data: raise HTTPException(500,"Could not save Hot Pick")
    return r.data[0]

@app.get("/api/admin/categories")
async def admin_categories(user=Depends(require_admin)):
    return supabase.table("categories").select("id,name").eq("is_active",True).order("sort_order").execute().data
