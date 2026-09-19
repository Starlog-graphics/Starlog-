from pydantic import BaseModel, Field, EmailStr
from typing import Optional, Literal

Complexity = Literal["Simple", "Classic", "Premium", "Supa"]

class OrderCreate(BaseModel):
    template_id: Optional[str] = None
    is_custom: bool = False
    complexity_level: Optional[Complexity] = None
    category_id: Optional[str] = None
    subcategory_id: Optional[str] = None
    brief: Optional[str] = Field(default=None, max_length=10000)

class PaymentInit(BaseModel):
    order_id: str
    email: Optional[EmailStr] = None

class BankTransferCreate(BaseModel):
    order_id: str

class VerifyPayment(BaseModel):
    reference: str

class ReferralClaim(BaseModel):
    referral_code: str = Field(min_length=4, max_length=32)

class CustomRequestCreate(BaseModel):
    order_id: str
    instructions: str = Field(min_length=1, max_length=10000)

class PayoutCreate(BaseModel):
    bank_name: str = Field(min_length=2, max_length=120)
    account_number: str = Field(pattern=r"^\d{10}$")
    account_name: str = Field(min_length=3, max_length=120)

class PayoutStatusUpdate(BaseModel):
    status: Literal["Processing", "Paid", "Rejected", "Cancelled"]
    admin_note: Optional[str] = Field(default=None, max_length=2000)

class PaymentStatusUpdate(BaseModel):
    status: Literal["Successful", "Failed", "Refunded"]

class CustomRequestStatusUpdate(BaseModel):
    status: Literal["Pending", "Reviewing", "In Progress", "Completed", "Cancelled"]
    admin_note: Optional[str] = Field(default=None, max_length=2000)
