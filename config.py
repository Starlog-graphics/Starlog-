from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    supabase_url: str
    supabase_service_role_key: str
    paystack_secret_key: str = ""
    paystack_public_key: str = ""
    paystack_base_url: str = "https://api.paystack.co"
    frontend_url: str = "http://localhost:5500"
    frontend_url_aliases: str = ""
    currency: str = "NGN"
    referral_reward_ngn: int = 1000
    payout_amount_ngn: int = 1000
    max_recustomization_requests: int = 3
    bank_name: str = "Paystack"
    bank_account_number: str = ""
    bank_account_name: str = ""
    design_preview_bucket: str = "design-previews"
    customer_upload_bucket: str = "customer-uploads"
    original_design_bucket: str = "original-design-files"
    model_config = SettingsConfigDict(env_file=".env", case_sensitive=False)

    @property
    def allowed_origins(self):
        return [x.strip().rstrip('/') for x in (self.frontend_url + ',' + self.frontend_url_aliases).split(',') if x.strip()]

settings = Settings()
