# Complete Deployment Guide

## Step 1: MongoDB Atlas Setup (Database)

1. Go to https://www.mongodb.com/cloud/atlas
2. Sign up / Login
3. Create New Project → "IMS-Project"
4. Build Database → Choose "FREE TIER (M0)"
5. Select Region: Choose closest to your users (e.g., Mumbai for India)
6. Create Cluster

### Database Access:
- Database Access → Add New Database User
- Username: `ims_admin`
- Password: Generate strong password (SAVE THIS!)
- Built-in Role: Read and Write to Any Database

### Network Access:
- Network Access → Add IP Address
- Click "Allow Access from Anywhere" (for now) → 0.0.0.0/0

### Get Connection String:
- Clusters → Click "Connect"
- Choose "Drivers" → Node.js
- Copy connection string:
  ```
  mongodb+srv://ims_admin:<password>@cluster0.xxxxx.mongodb.net/investor_management_system?retryWrites=true&w=majority
  ```
- Replace `<password>` with actual password
- Save this string - needed for Backend deploy

---

## Step 2: Backend Deploy (Render.com)

### Create Render Account:
1. Go to https://render.com
2. Sign up with GitHub
3. Click "New Web Service"
4. Connect GitHub repo: `onlySatyareddy/msi`

### Configuration:
- **Name**: `ims-backend`
- **Environment**: Node
- **Build Command**: `cd ims/backend && npm install`
- **Start Command**: `cd ims/backend && npm start`
- **Plan**: Free

### Environment Variables (Add these in Render Dashboard):
```
PORT=5002
NODE_ENV=production
MONGO_URI=mongodb+srv://ims_admin:PASSWORD@cluster0.xxxxx.mongodb.net/investor_management_system?retryWrites=true&w=majority
JWT_SECRET=your_super_secret_jwt_key_min_32_chars_long
JWT_EXPIRY=8h
FRONTEND_URL=https://ims-frontend.vercel.app
CORS_ORIGIN=*
BCRYPT_ROUNDS=12
SESSION_SECRET=your_super_secret_session_key_min_32_chars
```

### After Deploy:
- Get backend URL: `https://ims-backend.onrender.com`
- Test: `https://ims-backend.onrender.com/api/health`
- Save this URL for Frontend deploy

---

## Step 3: Frontend Deploy (Vercel)

### Option A: Dashboard (Easy)
1. Go to https://vercel.com
2. Sign up with GitHub
3. Click "Add New Project"
4. Import GitHub repo: `onlySatyareddy/msi`
5. Configure:
   - **Framework Preset**: Create React App
   - **Root Directory**: `ims/frontend`
   - **Build Command**: `npm run build`
   - **Output Directory**: `build`

6. Environment Variables:
   ```
   REACT_APP_API_URL=https://ims-backend.onrender.com/api
   ```

7. Click Deploy

### Option B: CLI
```bash
cd ims/frontend
vercel
# Follow prompts
# Set root: ims/frontend
# Add env: REACT_APP_API_URL=https://ims-backend.onrender.com/api
```

---

## Step 4: Update Backend CORS (IMPORTANT!)

After Frontend deploy:
1. Copy frontend URL: `https://ims-frontend.vercel.app`
2. Go to Render dashboard → ims-backend → Environment
3. Update these variables:
   ```
   FRONTEND_URL=https://ims-frontend.vercel.app
   CORS_ORIGIN=https://ims-frontend.vercel.app
   ```
4. Backend will auto-restart

---

## URLs After Deploy:
- **Frontend**: https://ims-frontend.vercel.app
- **Backend**: https://ims-backend.onrender.com
- **Database**: MongoDB Atlas

## First Time Setup:
1. Open Frontend URL
2. Register admin account
3. System is ready to use!

---

## Troubleshooting:

### CORS Errors:
- Check CORS_ORIGIN matches frontend URL exactly
- Include https:// and no trailing slash

### Database Connection Failed:
- Verify MONGO_URI in Render
- Check IP whitelist in MongoDB Atlas (0.0.0.0/0)
- Test connection string locally first

### API Not Working:
- Test: `https://ims-backend.onrender.com/api/health`
- Check Render logs for errors
- Verify all env variables are set
