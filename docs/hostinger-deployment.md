# Hostinger Deployment Guide

Deploy HMS with Stella to Hostinger shared hosting.

---

## Structure on Hostinger

```
public_html/
  index.html          ← React frontend (from dist/)
  assets/             ← React built assets
  favicon.svg
  robots.txt
  api/                ← Laravel backend folder
    index.php         ← from backend/public/index.php
    .htaccess         ← from backend/public/.htaccess
    storage -> ../storage/app/public  (symlink or copy)
```

---

## Step 1 — Upload the Frontend

The frontend is already built in the `dist/` folder.

1. Open Hostinger File Manager or connect via FTP
2. Go to `public_html/`
3. Upload everything inside `dist/` directly into `public_html/`
   - `index.html`
   - `assets/` folder
   - `favicon.svg`, `robots.txt`, `placeholder.svg`

---

## Step 2 — Upload the Backend

The Laravel backend goes into `public_html/api/`.

**What to upload:**

Upload the entire `backend/` folder contents EXCEPT:
- `vendor/` — install via composer on server
- `node_modules/` — not needed
- `.env` — create fresh on server
- `storage/logs/` — will be created automatically

**Folder structure inside `public_html/api/`:**

```
api/
  app/
  bootstrap/
  config/
  database/
  public/         ← IMPORTANT: contents go to api/ root (see below)
  resources/
  routes/
  storage/
  artisan
  composer.json
  composer.lock
```

**IMPORTANT — public/ folder handling:**

Hostinger needs `index.php` and `.htaccess` at the root of `api/`, not inside `public/`.

Option A (recommended): Copy `backend/public/index.php` and `backend/public/.htaccess` directly into `api/` and edit `index.php` to fix the paths:

```php
// In api/index.php — change these lines:
require __DIR__.'/../vendor/autoload.php';
$app = require_once __DIR__.'/../bootstrap/app.php';
```

Option B: Use Hostinger's subdomain pointing to `api/public/` as document root (if available in your plan).

---

## Step 3 — Create the Database

1. Go to Hostinger hPanel → Databases → MySQL Databases
2. Create a new database (e.g. `u123456_hms`)
3. Create a database user and assign it to the database
4. Note the host, database name, username, password

---

## Step 4 — Configure .env on Server

In Hostinger File Manager, create `api/.env` with these values:

```env
APP_NAME="HMS with Stella"
APP_ENV=production
APP_KEY=                    ← generate with: php artisan key:generate
APP_DEBUG=false
APP_URL=https://yourdomain.com/api

DB_CONNECTION=mysql
DB_HOST=localhost
DB_PORT=3306
DB_DATABASE=u123456_hms
DB_USERNAME=u123456_hmsuser
DB_PASSWORD=your_db_password

SESSION_DRIVER=file
CACHE_STORE=file
QUEUE_CONNECTION=sync

SANCTUM_STATEFUL_DOMAINS=yourdomain.com
FRONTEND_URL=https://yourdomain.com

IPFS_DRIVER=pinata
IPFS_PINATA_JWT=your_pinata_jwt
IPFS_GATEWAY=https://gateway.pinata.cloud/ipfs

STELLAR_NETWORK=testnet
STELLAR_HORIZON_URL=https://horizon-testnet.stellar.org
STELLAR_SOROBAN_RPC_URL=https://soroban-testnet.stellar.org
STELLAR_HOSPITAL_PUBLIC_KEY=your_public_key
STELLAR_HOSPITAL_SECRET_KEY=your_secret_key
STELLAR_INSURANCE_CONTRACT_ID=CCPOLYYXKPOBMU4CCDQMKMDLYZK5UMCIGL5WA6TMILXLUCMN4MXWE2HW
STELLAR_PAYMENT_CONTRACT_ID=CB764BLLWRJP5QGQXBY7PKJE5ROWFHMOMLLWPGYWSUSALBSSSHUTWOZP

ZENOPAY_API_KEY=your_zenopay_key
ZENOPAY_MERCHANT_ID=your_merchant_id
ZENOPAY_API_URL=https://zenoapi.com
ZENOPAY_ENV=production
ZENOPAY_TEST_MODE=false
ZENOPAY_CALLBACK_URL=https://yourdomain.com/api/payments/zenopay/callback
ZENOPAY_RETURN_URL=https://yourdomain.com/billing/payment-success

MAIL_MAILER=smtp
MAIL_HOST=smtp.hostinger.com
MAIL_PORT=587
MAIL_USERNAME=noreply@yourdomain.com
MAIL_PASSWORD=your_email_password
MAIL_ENCRYPTION=tls
MAIL_FROM_ADDRESS=noreply@yourdomain.com
MAIL_FROM_NAME="HMS with Stella"
```

---

## Step 5 — Install Dependencies via SSH

Hostinger Business/Premium plans include SSH access.

```bash
cd public_html/api
composer install --no-dev --optimize-autoloader
php artisan key:generate
php artisan migrate --force
php artisan config:cache
php artisan route:cache
php artisan view:cache
```

If no SSH access, upload the `vendor/` folder from your local machine (it's large — ~50MB).

---

## Step 6 — Fix Storage Permissions

```bash
chmod -R 775 storage bootstrap/cache
php artisan storage:link
```

---

## Step 7 — Configure CORS

Edit `backend/config/cors.php` — update `allowed_origins`:

```php
'allowed_origins' => ['https://yourdomain.com'],
```

---

## Step 8 — Test the Deployment

1. Visit `https://yourdomain.com` — should show the login page
2. Visit `https://yourdomain.com/api/health` — should return:
   ```json
   { "system": "operational", "services": { "database": "ok", ... } }
   ```
3. Login with your credentials
4. Register a patient and verify the full flow works

---

## Troubleshooting

**500 error on API:**
- Check `api/storage/logs/laravel.log`
- Make sure `APP_KEY` is set
- Make sure database credentials are correct

**CORS errors in browser:**
- Update `allowed_origins` in `config/cors.php`
- Make sure `.htaccess` CORS headers match your domain

**Stellar/IPFS not working:**
- These work from the server — make sure PHP can make outbound HTTPS requests
- Check Hostinger doesn't block outbound connections (most plans allow it)

**ZenoPay callback not working:**
- The callback URL must be publicly accessible
- Set `ZENOPAY_CALLBACK_URL=https://yourdomain.com/api/payments/zenopay/callback`

---

## Going to Mainnet

When ready for real payments, update `.env`:

```env
STELLAR_NETWORK=mainnet
STELLAR_HORIZON_URL=https://horizon.stellar.org
STELLAR_SOROBAN_RPC_URL=https://soroban-mainnet.stellar.org
STELLAR_HOSPITAL_PUBLIC_KEY=your_mainnet_public_key
STELLAR_HOSPITAL_SECRET_KEY=your_mainnet_secret_key
ZENOPAY_TEST_MODE=false
APP_DEBUG=false
```

And redeploy the Soroban contracts to mainnet:
```bash
cd hms-contracts
stellar contract deploy --wasm target\wasm32v1-none\release\hms_insurance.wasm --source your-identity --network mainnet
stellar contract deploy --wasm target\wasm32v1-none\release\hms_payment.wasm --source your-identity --network mainnet
```
