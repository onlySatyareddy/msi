# SSL/HTTPS Setup Guide
## Step-by-Step Instructions - Secure Connection Setup

---

## Prerequisites
- Domain name (e.g., yourdomain.com)
- VPS server with Nginx installed
- Root access to server
- Domain pointing to your server IP

---

## OPTION 1: Let's Encrypt (FREE SSL) - Recommended

### Step 1: Domain Point Karo Server Par
```
1. Domain provider (GoDaddy, Namecheap, etc.) mein jao
2. DNS settings mein jao
3. A Record add karo:
   - Type: A
   - Name: @ (ya www)
   - Value: Your VPS IP address
4. Save karo
5. Wait 5-10 minutes (propagation time)
```

### Step 2: Certbot Install Karo
```bash
# Server par SSH karo
ssh root@your-server-ip

# System update karo
apt update && apt upgrade -y

# Certbot install karo
apt install -y certbot python3-certbot-nginx
```

### Step 3: SSL Certificate Generate Karo
```bash
# SSL certificate get karo
certbot --nginx -d yourdomain.com -d www.yourdomain.com
```

**Questions jo puchhega:**
```
1. Email address daalo (renewal notifications ke liye)
2. Terms of Service agree karo (Y)
3. Email share karo? (N or Y - preference hai)
```

### Step 4: Auto-Renewal Setup
```bash
# Auto-renewal test karo
certbot renew --dry-run

# Auto-renewal already configured hota hai
# Verify karo:
systemctl status certbot.timer
```

### Step 5: Verify SSL
```
Browser mein https://yourdomain.com open karo
Lock icon dikhega (secure connection)
```

---

## OPTION 2: Paid SSL Certificate

### Step 1: SSL Buy Karo
```
Providers:
- Comodo SSL
- DigiCert
- GoDaddy SSL
- Namecheap SSL

Types:
- Domain Validation (DV) - Cheapest
- Organization Validation (OV) - Medium
- Extended Validation (EV) - Expensive
```

### Step 2: CSR Generate Karo
```bash
# Server par
openssl req -new -newkey rsa:2048 -nodes -keyout /etc/ssl/private/yourdomain.key -out /etc/ssl/csr/yourdomain.csr
```

**Information fill karo:**
```
Country: IN (India)
State: Your State
City: Your City
Organization: Your Company Name
Common Name: yourdomain.com
Email: your@email.com
```

### Step 3: CSR Submit Karo
```
1. SSL provider website par jao
2. CSR content paste karo (/etc/ssl/csr/yourdomain.csr)
3. Validation complete karo (email/DNS)
4. SSL certificate download karo
```

### Step 4: Certificate Install Karo
```bash
# Certificate files upload karo server par
# /etc/ssl/certs/yourdomain.crt
# /etc/ssl/private/yourdomain.key
# CA bundle file bhi chahiye

# Nginx configuration edit karo
nano /etc/nginx/sites-available/ims
```

**Nginx SSL Configuration:**
```nginx
server {
    listen 80;
    server_name yourdomain.com www.yourdomain.com;
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name yourdomain.com www.yourdomain.com;

    ssl_certificate /etc/ssl/certs/yourdomain.crt;
    ssl_certificate_key /etc/ssl/private/yourdomain.key;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
    ssl_prefer_server_ciphers on;

    # Rest of your configuration
    location / {
        root /var/www/ims-frontend/build;
        index index.html;
        try_files $uri $uri/ /index.html;
    }

    location /api {
        proxy_pass http://localhost:5002;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }

    location /socket.io {
        proxy_pass http://localhost:5002;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

### Step 5: Nginx Restart Karo
```bash
# Test configuration
nginx -t

# Restart Nginx
systemctl restart nginx
```

---

## OPTION 3: Cloudflare SSL (Easiest)

### Step 1: Cloudflare Account Create Karo
```
1. https://www.cloudflare.com par jao
2. Free account create karo
3. Add your domain
```

### Step 2: Nameservers Change Karo
```
1. Cloudflare nameservers copy karo
2. Domain provider mein jao
3. Nameservers update karo (Cloudflare ke)
4. Wait 24-48 hours (propagation)
```

### Step 3: SSL Mode Set Karo
```
1. Cloudflare dashboard mein jao
2. SSL/TLS tab mein jao
3. SSL mode select karo:
   - Flexible: Cloudflare to user (HTTPS)
   - Full: Cloudflare to server (HTTP)
   - Full (Strict): Cloudflare to server (HTTPS) - RECOMMENDED
```

### Step 4: Page Rules (Optional)
```
1. Always use HTTPS:
   - URL pattern: yourdomain.com/*
   - Setting: Always Use HTTPS = ON
```

### Step 5: DNS Settings
```
1. DNS tab mein jao
2. A record add karo:
   - Type: A
   - Name: @
   - IPv4 address: Your VPS IP
   - Proxy status: Proxied (Orange cloud)
```

---

## Complete Nginx Configuration with SSL

### Production Nginx Config
```nginx
# HTTP to HTTPS redirect
server {
    listen 80;
    server_name yourdomain.com www.yourdomain.com;
    return 301 https://$server_name$request_uri;
}

# HTTPS Server
server {
    listen 443 ssl http2;
    server_name yourdomain.com www.yourdomain.com;

    # SSL Certificate (Let's Encrypt)
    ssl_certificate /etc/letsencrypt/live/yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/yourdomain.com/privkey.pem;

    # SSL Configuration
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers 'ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384';
    ssl_prefer_server_ciphers on;
    ssl_session_cache shared:SSL:10m;
    ssl_session_timeout 10m;

    # Security Headers
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;

    # Frontend
    location / {
        root /var/www/ims-frontend/build;
        index index.html;
        try_files $uri $uri/ /index.html;
    }

    # Backend API
    location /api {
        proxy_pass http://localhost:5002;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }

    # WebSocket
    location /socket.io {
        proxy_pass http://localhost:5002;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
```

---

## SSL Renewal (Let's Encrypt)

### Manual Renewal
```bash
# Renew certificate
certbot renew

# Renew with dry-run (test)
certbot renew --dry-run

# Force renewal
certbot renew --force-renewal
```

### Auto-Renewal Check
```bash
# Timer status check
systemctl status certbot.timer

# Renewal logs
journalctl -u certbot.timer -f
```

---

## SSL Verification

### Online Tools
```
1. https://www.ssllabs.com/ssltest/
   - Domain daalo
   - Test karo
   - A+ grade aim karo

2. https://www.whynopadlock.com/
   - Domain check karo
   - SSL status dekho
```

### Browser Check
```
1. https://yourdomain.com open karo
2. Lock icon check karo
3. Certificate details dekho
4. Valid dates check karo
```

### Command Line Check
```bash
# SSL certificate info
openssl s_client -connect yourdomain.com:443 -servername yourdomain.com

# Certificate expiry check
echo | openssl s_client -servername yourdomain.com -connect yourdomain.com:443 2>/dev/null | openssl x509 -noout -dates
```

---

## Troubleshooting

### Problem 1: SSL Certificate Not Working
**Solutions:**
- Domain pointing check karo (A record)
- Nginx configuration test karo: `nginx -t`
- Nginx restart karo: `systemctl restart nginx`
- Firewall check karo (port 443 open hai)

### Problem 2: Mixed Content Error
**Solution:**
- Nginx config mein HTTP to HTTPS redirect add karo
- Frontend code mein HTTP URLs ko HTTPS mein change karo
- .env.production mein API URL HTTPS use karo

### Problem 3: Certificate Expired
**Solution:**
```bash
# Renew certificate
certbot renew
# Nginx restart
systemctl restart nginx
```

### Problem 4: SSL Handshake Failed
**Solutions:**
- Certificate chain complete hai check karo
- Intermediate certificates install karo
- SSL protocols check karo (TLSv1.2, TLSv1.3)

---

## Security Best Practices

### 1. HSTS Enable Karo
```nginx
add_header Strict-Transport-Security "max-age=31536000; includeSubDomains; preload" always;
```

### 2. Secure Ciphers Use Karo
```nginx
ssl_ciphers 'ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256';
ssl_prefer_server_ciphers on;
```

### 3. OCSP Stapling Enable Karo
```nginx
ssl_stapling on;
ssl_stapling_verify on;
ssl_trusted_certificate /etc/letsencrypt/live/yourdomain.com/chain.pem;
```

### 4. Regular Updates
```bash
# Certbot update
apt update && apt upgrade certbot

# Nginx update
apt update && apt upgrade nginx
```

---

## Quick Commands Reference

```bash
# SSL Certificate Get (Let's Encrypt)
certbot --nginx -d yourdomain.com -d www.yourdomain.com

# SSL Certificate Renew
certbot renew

# SSL Certificate Test
certbot renew --dry-run

# Nginx Test
nginx -t

# Nginx Restart
systemctl restart nginx

# SSL Certificate Info
openssl s_client -connect yourdomain.com:443

# Certificate Expiry Check
echo | openssl s_client -servername yourdomain.com -connect yourdomain.com:443 2>/dev/null | openssl x509 -noout -dates
```

---

## Recommendation

**For Beginners:** Let's Encrypt (Free)
- Easy to setup
- Auto-renewal
- Trusted by all browsers

**For Production:** Let's Encrypt + Cloudflare
- Free SSL
- DDoS protection
- CDN
- Performance boost

**For Enterprise:** Paid SSL (DigiCert)
- Higher warranty
- Better support
- Organization validation

---

**Next Steps:**
1. Domain point karo server par
2. Let's Encrypt SSL install karo
3. Nginx configure karo
4. Test karo https://yourdomain.com
5. Auto-renewal verify karo

**Good Luck! 🔒**
