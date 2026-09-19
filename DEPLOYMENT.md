# Starlog production deployment

## Render
1. Push the backend directory to GitHub, or use a monorepo and set Render Root Directory to `backend`.
2. Create a Render Web Service.
3. Build: `pip install -r requirements.txt`.
4. Start: `uvicorn app.main:app --host 0.0.0.0 --port $PORT`.
5. Add the variables in `.env.example`; never commit `.env`.
6. Confirm `/health` returns `ok`.

## Environment
`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `PAYSTACK_SECRET_KEY`, `PAYSTACK_PUBLIC_KEY`, `PAYSTACK_BASE_URL`, `FRONTEND_URL`, `FRONTEND_URL_ALIASES`, `CURRENCY`, `REFERRAL_REWARD_NGN`, `PAYOUT_AMOUNT_NGN`, `MAX_RECUSTOMIZATION_REQUESTS`, `BANK_NAME`, `BANK_ACCOUNT_NUMBER`, `BANK_ACCOUNT_NAME`, `DESIGN_PREVIEW_BUCKET`, `CUSTOMER_UPLOAD_BUCKET`, `ORIGINAL_DESIGN_BUCKET`.

## Supabase
Apply `Starlog_Database_Schema-4.sql`. Ensure the configured storage buckets exist.

## Frontend
Set `STARLOG_CONFIG.apiBaseUrl` in `frontend/starlog.js` to the deployed Render URL and serve the frontend over HTTPS.

## CORS
Set `FRONTEND_URL` to the exact frontend origin. Add any additional exact origins to `FRONTEND_URL_ALIASES`.

## Paystack
Set the Paystack webhook to `https://YOUR-RENDER-SERVICE.onrender.com/api/payments/webhook`. The backend verifies webhook signatures and transaction reference, amount and currency before the order can become Paid. Paystack's current Nigerian card support includes Visa, Mastercard and Verve.

For transfers/payouts, enable Paystack Transfers for the business. Paystack transfer webhooks update payout status.

## Google OAuth
Configure Google as an OAuth provider in Supabase Authentication. Apple sign-in has been removed from Starlog. Add the production redirect URLs and Google provider credentials in the Supabase dashboard. The browser only calls Supabase `signInWithOAuth`; provider secrets are not shipped to Starlog frontend code.

## Email confirmation
Enable email confirmations in Supabase Authentication. Starlog signup now tells users to check their email and click the confirmation link; it no longer asks for a six-digit OTP. Password recovery also uses Supabase's email reset link flow. Configure the Site URL and Redirect URLs in Supabase so the confirmation/reset links return to the deployed Starlog frontend. Supabase documents that email signup can redirect after the user clicks the confirmation link, and password reset uses `resetPasswordForEmail()` followed by `updateUser()`.

## Admin design upload
An authorized admin opens `admin.html`, selects a category/package, chooses a PNG or JPG/JPEG and uploads. The backend validates the MIME type and size, stores the preview in the configured design-previews bucket and creates template metadata.

## Customization requests
After payment is verified, the customer opens `customize.html?order=ORDER_ID`, enters instructions and optional PNG/JPG/PDF references. The backend verifies ownership and paid status, stores the request in `custom_requests`, and stores file paths in `additional_files`. Admins manage status in `admin.html`.

## Referral flow
Referral links use `signup.html?ref=CODE`. Supabase signup metadata is consumed by the database signup trigger; a uniqueness constraint prevents duplicate referral attribution and the self-referral constraint blocks self-referrals. The first verified purchase credits one NGN 1,000 reward. The payout endpoint calculates eligibility and amount server-side and rejects duplicate pending requests.

## Bank transfer
Set `BANK_NAME=Paystack`, `BANK_ACCOUNT_NUMBER` and `BANK_ACCOUNT_NAME`. The frontend reads these display values from `/api/config/public`; users cannot mark a transfer as paid. An authorized admin verifies pending manual transfers. If Paystack Pay with Transfer/dedicated virtual accounts are enabled, replace the manual confirmation with the Paystack transfer channel and reconcile its webhook events.

## Hot Picks management
The homepage has exactly 10 Hot Pick slots. An admin can open `admin.html` and upload a PNG/JPG image to each numbered slot. The backend stores the image in the public `design-previews` Supabase Storage bucket and records the slot in `hot_picks`. Empty slots remain visible as placeholders until an image is uploaded.

## Failed to fetch troubleshooting
If the frontend shows `Failed to fetch`, the browser normally could not reach the FastAPI API at all. Starlog's frontend defaults to `http://localhost:8000`, which only works when the backend is running on the same computer. After deployment, set `STARLOG_API_BASE` in the frontend's `starlog.js` (or replace the fallback URL there) with the public Render URL of the FastAPI service, for example `https://starlog-api.onrender.com`. Also set the backend `FRONTEND_URL` to the exact frontend origin and include any additional frontend origins in `FRONTEND_URL_ALIASES`.

Then test `https://YOUR-BACKEND.onrender.com/health` in a browser. It should return a JSON status. If `/health` works but buttons still fail, check browser DevTools > Network for CORS errors and make sure the frontend origin exactly matches the backend CORS allow-list. FastAPI requires the frontend origin to be explicitly allowed when browser requests cross origins. Never use a wildcard origin for authenticated requests.

Also make sure the Render backend has `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `PAYSTACK_SECRET_KEY`, `PAYSTACK_PUBLIC_KEY`, `FRONTEND_URL`, and the bank/payout settings configured. A missing backend environment variable can make an API endpoint fail even though the website itself loads.
