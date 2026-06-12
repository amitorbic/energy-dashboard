# Broker Portal — Server Cheatsheet

**Live URL:** https://broker.enertsol.com  
**VPS Path:** `/var/www/energyapp/broker/`  
**Server IP:** 82.112.231.44

---

## PM2 Processes

| PM2 Name | What | Port |
|----------|------|------|
| `broker-portal` | Next.js frontend | 3003 |
| `energyapp-api` | FastAPI backend (shared) | 8002 |
| `energyapp-consumer` | Consumer portal Next.js | — |
| `energyapp-frontend` | Main app frontend | — |

```bash
pm2 list                          # list all processes
pm2 logs broker-portal --lines 50 # broker frontend logs
pm2 logs energyapp-api --lines 50 # FastAPI logs
pm2 restart broker-portal --update-env
pm2 restart energyapp-api
pm2 save                          # persist current process list
```

---

## Deploy (Standard)

```bash
cd /var/www/energyapp

# 1. Pull latest code
git pull origin master

# 2. Rebuild frontend (always — rewrites are baked at build time)
cd broker
npm run build

# 3. Restart frontend
pm2 restart broker-portal --update-env

# 4. Restart API (only if you changed api/ files)
pm2 restart energyapp-api
```

---

## First-Time Setup (new server)

```bash
cd /var/www/energyapp/broker

# Install dependencies
npm install

# Create production .env.local
cat > .env.local << 'EOF'
NEXT_PUBLIC_API_URL=/api
NEXT_PUBLIC_COMMISSION_BASE_URL=http://ameripowerpricing.com/
API_PORT=8002
EOF

# Build
npm run build

# Start with PM2
pm2 start npm --name broker-portal -- run start
pm2 save
```

---

## Nginx Config

**Config file:** `/etc/nginx/sites-available/broker.enertsol.com`

```nginx
server {
    listen 80;
    server_name broker.enertsol.com;

    location / {
        proxy_pass         http://127.0.0.1:3003;
        proxy_http_version 1.1;
        proxy_set_header   Upgrade $http_upgrade;
        proxy_set_header   Connection 'upgrade';
        proxy_set_header   Host $host;
        proxy_set_header   X-Real-IP $remote_addr;
        proxy_set_header   X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
```

```bash
sudo nginx -t                    # test config
sudo systemctl reload nginx      # apply changes
sudo certbot --nginx -d broker.enertsol.com   # SSL (first time)
```

---

## Environment Files

### Frontend — `/var/www/energyapp/broker/.env.local`
```env
NEXT_PUBLIC_API_URL=/api
NEXT_PUBLIC_COMMISSION_BASE_URL=http://ameripowerpricing.com/
API_PORT=8002
```
> Changing `API_PORT` requires a full `npm run build` — it is baked into the Next.js rewrite at build time.

### Backend — `/var/www/energyapp/api/.env`
```bash
cat /var/www/energyapp/api/.env   # view
nano /var/www/energyapp/api/.env  # edit (then pm2 restart energyapp-api)
```

---

## Database

```bash
# Connect
mysql -u root -p energyapp

# Key queries
SELECT name, email, md5_decode, role FROM contract_user;

# Reset a broker user password
UPDATE contract_user 
SET password = MD5('NewPassword'), md5_decode = 'NewPassword' 
WHERE name = 'Username';

# Add new admin user
INSERT INTO contract_user (name, email, password, md5_decode, broker_id, role)
VALUES ('Admin', 'email@example.com', MD5('Password'), 'Password', 'ADMIN', '1');

# Check active accounts for a broker
SELECT DISTINCT company_name, contract_end_date 
FROM contract_renewal 
WHERE broker_code = 'V1234' 
ORDER BY contract_end_date ASC;
```

---

## Troubleshooting

### 502 Bad Gateway
```bash
pm2 list                          # check broker-portal is online with a real pid
ss -tlnp | grep 3003              # confirm port 3003 is listening
pm2 logs broker-portal --lines 30 # check for startup errors
```

### Login 401 — Wrong Password
```bash
# Check what's in contract_user
mysql -u root -p energyapp -e \
  "SELECT name, email, md5_decode, password=MD5(md5_decode) as ok FROM contract_user;"

# Reset if needed
mysql -u root -p energyapp -e \
  "UPDATE contract_user SET password=MD5('Admin@1234'), md5_decode='Admin@1234' WHERE role='1';"
```

### API calls return Django 400
The Next.js proxy is hitting port 8001 (Django) instead of 8002 (FastAPI).
```bash
grep API_PORT /var/www/energyapp/broker/.env.local   # must be 8002
# If wrong:
sed -i 's/API_PORT=8001/API_PORT=8002/' /var/www/energyapp/broker/.env.local
npm run build
pm2 restart broker-portal --update-env
```

### JS chunks 404 (form doesn't submit, redirects to /?)
Stale browser cache or mismatched build output.
```bash
rm -rf /var/www/energyapp/broker/.next
npm run build
pm2 restart broker-portal --update-env
```
Then open site in incognito or hard-refresh (Ctrl+Shift+R).

### FastAPI broker routes missing (404 on /api/broker/*)
New broker routes were added to the codebase but the running gunicorn hasn't reloaded.
```bash
pm2 restart energyapp-api
curl -s http://localhost:8002/api/broker/auth/login -X POST \
  -H "Content-Type: application/json" \
  -d '{"login":"Admin","password":"Amit@2025"}'
```

### Check which DB the API is using
```bash
grep DB_NAME /var/www/energyapp/api/.env
```

---

## Port Reference

| Port | Service |
|------|---------|
| 80 / 443 | Nginx |
| 3003 | Broker portal (Next.js) |
| 3002 | Consumer portal (Next.js) |
| 8001 | Main app Django (gunicorn) |
| 8002 | FastAPI shared backend (uvicorn) |
| 3306 | MySQL |
