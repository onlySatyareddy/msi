# Production Deployment Guide
## Investor Management System (IMS)

### Prerequisites
- Node.js 18+ and npm
- MongoDB 6.0+
- Domain name with SSL certificate
- Production server (AWS, DigitalOcean, Heroku, etc.)

---

## 1. Environment Configuration

### Backend (.env.production)
```bash
# Server Configuration
PORT=5002
NODE_ENV=production
MONGO_URI=mongodb+srv://username:password@cluster.mongodb.net/ims_prod?retryWrites=true&w=majority

# Security (CHANGE THESE!)
JWT_SECRET=your_strong_random_secret_key_min_32_chars
JWT_EXPIRY=8h
SESSION_SECRET=your_strong_random_session_secret_min_32_chars
BCRYPT_ROUNDS=12

# CORS Configuration
FRONTEND_URL=https://yourdomain.com
CORS_ORIGIN=https://yourdomain.com
SOCKET_CORS_ORIGIN=https://yourdomain.com

# Rate Limiting
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100

# Logging
LOG_LEVEL=info
LOG_FILE=logs/app.log
```

### Frontend (.env.production)
```bash
# API Configuration
REACT_APP_API_URL=https://api.yourdomain.com/api
REACT_APP_SOCKET_URL=https://api.yourdomain.com

# Feature Flags
REACT_APP_ENABLE_DEBUG=false
REACT_APP_ENABLE_ANALYTICS=true

# API Configuration
REACT_APP_API_TIMEOUT=30000
REACT_APP_RETRY_ATTEMPTS=3

# Application Settings
REACT_APP_APP_NAME=Investor Management System
REACT_APP_VERSION=1.0.0
```

---

## 2. Database Setup

### MongoDB Atlas (Recommended)
1. Create MongoDB Atlas account
2. Create cluster (M10 or higher for production)
3. Create database user with read/write permissions
4. Whitelist your server IP addresses
5. Enable encryption at rest
6. Enable backup (daily backups recommended)

### Connection String Format
```
mongodb+srv://username:password@cluster.mongodb.net/database_name?retryWrites=true&w=majority
```

---

## 3. Security Checklist

### ✅ Required for Production
- [ ] Change all default passwords and secrets
- [ ] Enable HTTPS/SSL
- [ ] Configure CORS to allow only your domain
- [ ] Enable rate limiting (already implemented)
- [ ] Use environment variables for all sensitive data
- [ ] Enable MongoDB authentication
- [ ] Enable MongoDB encryption at rest
- [ ] Set up database backups
- [ ] Configure firewall rules
- [ ] Enable helmet.js security headers
- [ ] Implement request size limits
- [ ] Add input validation and sanitization
- [ ] Enable audit logging

### Security Headers (Add to server.js)
```javascript
const helmet = require('helmet');
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
    },
  },
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true
  }
}));
```

---

## 4. Build & Deploy

### Backend Deployment

```bash
# Install dependencies
cd backend
npm install

# Load production environment
cp .env.production .env
# Edit .env with your production values

# Start production server
npm run prod
```

### Frontend Deployment

```bash
# Install dependencies
cd frontend
npm install

# Load production environment
cp .env.production .env.production
# Edit .env.production with your production values

# Build for production
npm run build

# Deploy build folder to your web server
# The build folder contains optimized static files
```

---

## 5. Deployment Options

### Option A: VPS (DigitalOcean, AWS EC2, Linode)

#### Backend
```bash
# Install PM2 for process management
npm install -g pm2

# Start backend with PM2
cd backend
pm2 start server.js --name ims-backend --env production

# Configure PM2 to start on boot
pm2 startup
pm2 save
```

#### Frontend (Nginx)
```nginx
server {
    listen 80;
    server_name yourdomain.com;
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name yourdomain.com;

    ssl_certificate /path/to/certificate.crt;
    ssl_certificate_key /path/to/private.key;

    root /var/www/ims-frontend/build;
    index index.html;

    location / {
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

### Option B: Docker Deployment

#### Dockerfile (Backend)
```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
EXPOSE 5002
CMD ["node", "server.js"]
```

#### Dockerfile (Frontend)
```dockerfile
FROM node:18-alpine as build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM nginx:alpine
COPY --from=build /app/build /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
```

#### docker-compose.yml
```yaml
version: '3.8'
services:
  backend:
    build: ./backend
    ports:
      - "5002:5002"
    environment:
      - NODE_ENV=production
      - MONGO_URI=${MONGO_URI}
      - JWT_SECRET=${JWT_SECRET}
    depends_on:
      - mongo
    restart: always

  frontend:
    build: ./frontend
    ports:
      - "80:80"
    depends_on:
      - backend
    restart: always

  mongo:
    image: mongo:6
    volumes:
      - mongo-data:/data/db
    restart: always

volumes:
  mongo-data:
```

---

## 6. Monitoring & Logging

### PM2 Monitoring
```bash
# Monitor application
pm2 monit

# View logs
pm2 logs ims-backend

# Restart application
pm2 restart ims-backend
```

### Application Logging
- Backend logs are written to `logs/app.log`
- Use Winston for structured logging
- Set up log rotation to prevent disk space issues

### Monitoring Tools (Recommended)
- **Application Performance**: New Relic, Datadog, or AppDynamics
- **Error Tracking**: Sentry
- **Uptime Monitoring**: UptimeRobot, Pingdom
- **Database Monitoring**: MongoDB Atlas built-in monitoring

---

## 7. Backup Strategy

### Database Backups
- Enable MongoDB Atlas automated backups (daily)
- Set retention period (minimum 7 days, recommended 30 days)
- Test restore process regularly

### Application Backups
- Backup environment variables securely
- Backup uploaded files (if any)
- Version control (Git) for code backup

---

## 8. SSL/TLS Configuration

### Using Let's Encrypt (Free)
```bash
# Install Certbot
sudo apt-get install certbot python3-certbot-nginx

# Obtain SSL certificate
sudo certbot --nginx -d yourdomain.com

# Auto-renewal is configured automatically
```

---

## 9. Post-Deployment Checklist

- [ ] Test all API endpoints
- [ ] Test authentication flow
- [ ] Test WebSocket connection
- [ ] Test file uploads (if applicable)
- [ ] Test email notifications
- [ ] Verify rate limiting is working
- [ ] Test error handling
- [ ] Verify database connection
- [ ] Test with multiple concurrent users
- [ ] Monitor server resources (CPU, RAM, Disk)
- [ ] Set up alerts for critical errors
- [ ] Configure backup monitoring
- [ ] Document deployment process
- [ ] Train team on deployment process

---

## 10. Scaling Considerations

### Horizontal Scaling
- Use load balancer (Nginx, AWS ALB)
- Deploy multiple backend instances
- Use Redis for session storage (if needed)
- Use CDN for static assets (CloudFlare, AWS CloudFront)

### Vertical Scaling
- Increase server resources (CPU, RAM)
- Optimize database queries
- Add database indexes
- Use caching (Redis)

---

## 11. Troubleshooting

### Common Issues

#### Port Already in Use
```bash
# Find process using port 5002
netstat -tulpn | grep 5002
# Kill process
kill -9 <PID>
```

#### Database Connection Failed
- Check MongoDB connection string
- Verify IP whitelist in MongoDB Atlas
- Check firewall rules
- Verify credentials

#### CORS Errors
- Verify FRONTEND_URL in .env
- Check CORS configuration in server.js
- Verify domain name matches exactly

---

## 12. Maintenance

### Regular Tasks
- Weekly: Review logs for errors
- Monthly: Update dependencies
- Monthly: Review security advisories
- Quarterly: Test disaster recovery
- Quarterly: Review and update documentation

### Dependency Updates
```bash
# Check for outdated packages
npm outdated

# Update packages
npm update

# Audit for security vulnerabilities
npm audit
npm audit fix
```

---

## 13. Support & Contact

For deployment issues, check:
- Application logs: `logs/app.log`
- PM2 logs: `pm2 logs ims-backend`
- MongoDB Atlas logs
- Server system logs

---

## Quick Start Summary

```bash
# 1. Configure environment variables
cd backend
cp .env.production .env
# Edit .env with production values

# 2. Install dependencies
npm install

# 3. Start backend
npm run prod

# 4. Build and deploy frontend
cd ../frontend
npm install
npm run build
# Deploy build folder to web server

# 5. Configure Nginx reverse proxy
# See Nginx configuration above

# 6. Enable SSL
# Use Let's Encrypt or your SSL certificate
```

---

**Last Updated**: April 2026
**Version**: 1.0.0
