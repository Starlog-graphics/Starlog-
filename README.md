# Starlog Frontend

Static frontend for Starlog. Authentication/catalogue reads use Supabase; orders, payments, referrals, payouts and customization requests use the FastAPI backend.

## Configure the backend URL
Edit `starlog.js`:

```js
apiBaseUrl: "https://YOUR-RENDER-SERVICE.onrender.com"
```

This value is public configuration, not a secret.

## Authentication
Google sign-in uses Supabase Auth OAuth. Apple sign-in has been removed. Configure Google and the redirect URLs in Supabase Authentication.

## Payment
The Payment page provides Bank Transfer and Card. Card details are collected by Paystack Checkout, not by Starlog. Starlog never stores raw card numbers or CVV.

## Admin
Authorized admins can open `admin.html` to upload PNG/JPG/JPEG designs, verify manual bank transfers, manage customization request statuses and initiate referral payouts.

## Customization
After payment is verified, customers can open `customize.html?order=ORDER_ID` to submit instructions and optional PNG/JPG/PDF references.
