# Simple Deployment Guide (Beginner Friendly)
## Step-by-Step Instructions - Beginner ke liye

---

## PHASE 1: Preparation (Taiyari)

### Step 1: MongoDB Database Setup
```
1. https://www.mongodb.com/cloud/atlas par jao
2. Free account create karo
3. "Build a Database" click karo
4. Free plan (M0) select karo
5. Cluster name daalo (e.g., "ims-cluster")
6. Username aur Password create karo (YAD RAKHNA!)
7. Network Access mein "Allow Access from Anywhere" select karo
8. Database Connection String copy karo
```

**Example Connection String:**
```
mongodb+srv://yourusername:yourpassword@cluster.mongodb.net/ims?retryWrites=true&w=majority
```

---

### Step 2: Backend Configuration

#### 2.1 Backend folder mein jao
```bash
cd ims/backend
```

#### 2.2 Dependencies install karo
```bash
npm install
```

#### 2.3 .env file create karo
```bash
copy .env.production .env
```

#### 2.4 .env file edit karo (Notepad ya VS Code se)
```bash
# File open karo: .env
# Niche diye gaye values replace karo:

PORT=5002
NODE_ENV=production

# MongoDB URI - Step 1 wali string yahan paste karo
MONGO_URI=mongodb+srv://yourusername:yourpassword@cluster.mongodb.net/ims?retryWrites=true&w=majority

# Security secrets - random strong keys daalo
JWT_SECRET=your_super_secret_random_key_minimum_32_characters_long
JWT_EXPIRY=8h
FRONTEND_URL=http://localhost:3000
CORS_ORIGIN=http://localhost:3000
SOCKET_CORS_ORIGIN=http://localhost:3000

# Rate limiting
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100

# Logging
LOG_LEVEL=info
LOG_FILE=logs/app.log

# Security
BCRYPT_ROUNDS=12
SESSION_SECRET=another_random_secret_key_minimum_32_characters
```

#### 2.5 Backend test karo
```bash
npm start
```

**Agar yeh dikhta hai toh sahi hai:**
```
IMS Server on port 5002
MongoDB Connected: cluster.mongodb.net
```

**Ctrl+C se stop karo**

---

### Step 3: Frontend Configuration

#### 3.1 Frontend folder mein jao
```bash
cd ../frontend
```

#### 3.2 Dependencies install karo
```bash
npm install
```

#### 3.3 .env.production file edit karo
```bash
# File open karo: .env.production
# Niche diye gaye values daalo:

REACT_APP_API_URL=http://localhost:5002/api
REACT_APP_SOCKET_URL=http://localhost:5002
REACT_APP_ENABLE_DEBUG=true
REACT_APP_ENABLE_ANALYTICS=false
REACT_APP_API_TIMEOUT=30000
REACT_APP_RETRY_ATTEMPTS=3
REACT_APP_APP_NAME=Investor Management System
REACT_APP_VERSION=1.0.0
```

#### 3.4 Frontend start karo
```bash
npm start
```

**Browser mein http://localhost:3000 open karo**

**Agar dikhta hai toh sahi hai!**

**Ctrl+C se stop karo**

---

## PHASE 2: Production Deployment

### OPTION A: Local Testing (Sabse Pehle Yeh Try Karo)

#### Backend Start
```bash
# Terminal 1
cd ims/backend
npm start
```

#### Frontend Start
```bash
# Terminal 2
cd ims/frontend
npm start
```

**Browser mein http://localhost:3000 open karo**
- Login karo
- Test karo sab features

---

### OPTION B: VPS Deployment (DigitalOcean - Recommended)

#### Step 1: VPS Buy Karo
```
1. https://www.digitalocean.com par jao
2. Account create karo
3. "Droplet" create karo
4. Ubuntu 22.04 select karo
5. Basic plan ($6/month) select karo
6. Password set karo (YAD RAKHNA!)
7. Droplet create karo
```

#### Step 2: VPS Connect Karo
```bash
# Terminal mein
ssh root@your-droplet-ip
# Password daalo
```

#### Step 3: VPS Par Software Install Karo
```bash
# Update system
apt update && apt upgrade -y

# Node.js install
curl -fsSL https://deb.nodesource.com/setup_18.x | bash -
apt install -y nodejs

# Git install
apt install -y git

# Nginx install
apt install -y nginx

# PM2 install (process manager)
npm install -g pm2
```

#### Step 4: Project Clone Karo
```bash
# VPS par
cd /var/www
git clone your-github-repo-url ims
cd ims
```

#### Step 5: Backend Setup
```bash
cd backend
npm install

# .env file create karo
nano .env
# .env.production ka content yahan paste karo
# MongoDB URI, JWT_SECRET change karo
# Save: Ctrl+X, Y, Enter

# Start backend
pm2 start server.js --name ims-backend
pm2 save
pm2 startup
```

#### Step 6: Frontend Build
```bash
cd ../frontend
npm install
npm run build

# Build folder ko Nginx par copy karo
cp -r build /var/www/ims-frontend
```

#### Step 7: Nginx Configure Karo
```bash
nano /etc/nginx/sites-available/ims
```

**Niche ka content paste karo:**
```nginx
server {
    listen 80;
    server_name your-domain.com;

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

```bash
# Enable site
ln -s /etc/nginx/sites-available/ims /etc/nginx/sites-enabled/

# Test Nginx
nginx -t

# Restart Nginx
systemctl restart nginx
```

#### Step 8: SSL Setup (HTTPS)
```bash
# Certbot install
apt install -y certbot python3-certbot-nginx

# SSL certificate get karo
certbot --nginx -d your-domain.com

# Auto-renewal enable ho jayega automatically
```

#### Step 9: Test Karo
```
Browser mein https://your-domain.com open karo
Login karo
Test karo
```

---

### OPTION C: Heroku (Easiest - Free Tier)

#### Backend Deploy
```bash
# Heroku CLI install karo
# https://devcenter.heroku.com/articles/heroku-cli

# Login
heroku login

# Backend folder mein jao
cd ims/backend

# Heroku app create
heroku create your-app-name

# MongoDB Atlas connection string add karo
heroku config:set MONGO_URI="your-mongodb-connection-string"
heroku config:set JWT_SECRET="your-secret-key"
heroku config:set FRONTEND_URL="https://your-app-name.herokuapp.com"

# Deploy
git init
git add .
git commit -m "Initial commit"
heroku git:remote -a your-app-name
git push heroku main
```

#### Frontend Deploy (Vercel - Free)
```bash
# Frontend folder mein jao
cd ../frontend

# Vercel CLI install
npm install -g vercel

# Deploy
vercel
# Follow instructions
```

---

## PHASE 3: Testing

### Test Checklist
- [ ] Login page open ho raha hai
- [ ] Login successful ho raha hai
- [ ] Dashboard open ho raha hai
- [ ] Investors create ho rahe hain
- [ ] Holdings show ho rahe hain
- [ ] WebSocket connection working hai
- [ ] Notifications aa rahe hain

---

## Common Problems & Solutions

### Problem 1: MongoDB Connection Failed
**Solution:**
- Check karo MongoDB URI sahi hai
- IP whitelist check karo (MongoDB Atlas mein)
- Username/Password check karo

### Problem 2: Port Already in Use
**Solution:**
```bash
# Port find karo
netstat -tulpn | grep 5002
# Process kill karo
kill -9 <PID>
```

### Problem 3: CORS Error
**Solution:**
- .env mein FRONTEND_URL check karo
- Nginx configuration check karo

### Problem 4: Build Failed
**Solution:**
```bash
# Node modules delete karo
rm -rf node_modules
# Phir se install karo
npm install
```

---

## Quick Reference

### Backend Commands
```bash
cd ims/backend
npm install        # Dependencies install
npm start         # Start server
npm run prod      # Production mode
```

### Frontend Commands
```bash
cd ims/frontend
npm install        # Dependencies install
npm start         # Development mode
npm run build     # Production build
```

### PM2 Commands (VPS)
```bash
pm2 list          # Running processes
pm2 logs ims-backend  # Logs dekho
pm2 restart ims-backend  # Restart
pm2 stop ims-backend     # Stop
pm2 delete ims-backend   # Delete
```

---

## Important Notes

1. **Passwords secure rakho** - .env file ko git mein push mat karo
2. **Backup lo** - Database backup regularly
3. **SSL use karo** - HTTPS zaroori hai
4. **Monitor karo** - Logs check karo regularly
5. **Update karo** - Dependencies update karo

---

## Need Help?

- Backend logs: `pm2 logs ims-backend`
- Nginx logs: `tail -f /var/log/nginx/error.log`
- MongoDB Atlas logs check karo
- DEPLOYMENT_GUIDE.md mein advanced details hai

---

**Good Luck! 🚀**
