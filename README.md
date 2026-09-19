# Starlog Python Backend

FastAPI backend for Starlog. It is designed to work with Supabase Auth + PostgreSQL and Paystack.

## What it handles
- Server-side order creation and authoritative pricing
- Custom orders and briefs
- Supabase token validation
- Paystack initialization, verification and signed webhooks
- Payment amount/currency verification
- Re-customization limit (3)
- Referral balance and payout requests
- Admin order/referral/payout endpoints
- Health and pricing endpoints

## Security
- Keep `SUPABASE_SERVICE_ROLE_KEY` and `PAYSTACK_SECRET_KEY` on the server only.
- Never put `.env` into the frontend or Git.
- Configure CORS to the exact deployed frontend origin.
- Paystack webhooks must point to `/api/payments/webhook`.

## Setup
1. Create a Python 3.11+ environment.
2. `pip install -r requirements.txt`
3. Copy `.env.example` to `.env` and fill secrets.
4. Apply the matching `starlog_schema_1000.sql` supplied with this project.
5. Start: `uvicorn app.main:app --host 0.0.0.0 --port 8000`
6. API docs: `/docs`.

## Paystack keys
1. Open the backend folder.
2. Copy `.env.example` to `.env`.
3. Put your Paystack **Secret Key** in `PAYSTACK_SECRET_KEY=`. Use the test secret key while testing and the live secret key only when you are ready for real payments.
4. Put your Supabase service-role key in `SUPABASE_SERVICE_ROLE_KEY=`.
5. Set `FRONTEND_URL=` to the address where the frontend is served.
6. Never place the Paystack secret key or Supabase service-role key in the frontend.

## Frontend integration
Send the Supabase access token as:
`Authorization: Bearer <access_token>`

The backend should be the authority for money, payment verification, referral crediting, and privileged actions. Keep public catalogue reads in Supabase if desired, but do not trust frontend prices or payment success flags.
