# 🚀 Netbanx Dashboard Deployment Guide

## Step 1: Database Setup (Supabase)

### 1.1 Create Supabase Project
1. Go to [supabase.com](https://supabase.com) and sign up/login
2. Click **"New project"**
3. Choose your organization 
4. Enter project details:
   - **Name**: `netbanx-dashboard`
   - **Database Password**: Generate a strong password and **SAVE IT**
   - **Region**: Choose closest to your users

### 1.2 Get Database URLs
1. Go to **Settings > Database** in your Supabase dashboard
2. Copy these connection strings:
   - **Connection pooling** (for DATABASE_URL)
   - **Direct connection** (for DIRECT_URL)

### 1.3 Setup Database Schema
1. Go to **SQL Editor** in Supabase
2. Copy and paste the contents of `prisma/schema.prisma`
3. Or use the following command after deployment:
   ```bash
   npx prisma db push
   ```

## Step 2: Deploy to Vercel

### 2.1 Login to Vercel
```bash
npx vercel login
```

### 2.2 Deploy the Application
```bash
npx vercel
```

When prompted:
- **Set up and deploy?** → Yes
- **Which scope?** → Choose your account
- **Link to existing project?** → No
- **Project name?** → `netbanx-dashboard` (or your preferred name)
- **Directory?** → `./` (current directory)
- **Override settings?** → No

### 2.3 Set Environment Variables

After deployment, go to your Vercel dashboard:

1. Go to **Settings > Environment Variables**
2. Add these variables:

#### 🔐 Database Configuration
```bash
DATABASE_URL = "postgresql://postgres:[PASSWORD]@db.[PROJECT_REF].supabase.co:5432/postgres?pgbouncer=true&connection_limit=1"

DIRECT_URL = "postgresql://postgres:[PASSWORD]@db.[PROJECT_REF].supabase.co:5432/postgres"
```

#### 🔑 Security Configuration
```bash
JWT_SECRET = "your-super-secure-jwt-secret-key-here"
NEXTAUTH_URL = "https://your-project.vercel.app"
NEXTAUTH_SECRET = "your-nextauth-secret-here"
```

#### 📧 Email Configuration (Optional)
```bash
SMTP_HOST = "smtp.gmail.com"
SMTP_PORT = "587"
SMTP_USER = "your-email@gmail.com"
SMTP_PASS = "your-app-password"
FROM_EMAIL = "your-email@gmail.com"
```

#### 🔧 Additional Settings
```bash
NODE_ENV = "production"
PRISMA_GENERATE_SKIP_AUTOINSTALL = "true"
```

### 2.4 Deploy Production Version
```bash
npx vercel --prod
```

## Step 3: Post-Deployment Setup

### 3.1 Initialize Database
After first deployment with environment variables:
```bash
# This will create all tables
npx prisma db push --preview-feature
```

### 3.2 Create Admin User
Visit: `https://your-app.vercel.app/api/setup/admin`

Or use the API:
```bash
curl -X POST https://your-app.vercel.app/api/setup/admin \
  -H "Content-Type: application/json" \
  -d '{
    "email": "admin@yourcompany.com",
    "password": "your-secure-password",
    "firstName": "Admin",
    "lastName": "User"
  }'
```

### 3.3 Test Your Deployment

#### Test Webhook Endpoints:
```bash
# Test account status webhook
curl -X POST https://your-app.vercel.app/api/webhooks/account-status/test

# Test transaction webhook  
curl -X POST https://your-app.vercel.app/api/webhooks/test
```

#### Test API Endpoints:
```bash
# Login and get token
curl -X POST https://your-app.vercel.app/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "admin@yourcompany.com",
    "password": "your-secure-password"
  }'

# Use token to access accounts API
curl -X GET https://your-app.vercel.app/api/v1/accounts \
  -H "Authorization: Bearer YOUR_TOKEN_HERE"
```

## Step 4: Configure Paysafe/Netbanx Webhooks

### 4.1 Webhook URLs for Paysafe Dashboard:
```
Transaction Webhooks: https://your-app.vercel.app/api/webhooks/netbanx
Account Status Webhooks: https://your-app.vercel.app/api/webhooks/account-status
```

### 4.2 Configure in Paysafe Developer Dashboard:
1. Login to your Paysafe/Netbanx developer account
2. Go to **Webhook Settings**
3. Add the webhook URLs above
4. Select event types:
   - Payment events
   - Account status changes
   - Onboarding status updates

## Step 5: Monitoring & Maintenance

### 5.1 View Logs
```bash
npx vercel logs --follow
```

### 5.2 Check Application Health
```
GET https://your-app.vercel.app/api/health
```

### 5.3 API Documentation
```
GET https://your-app.vercel.app/api/docs
```

## 🎉 Your Application is Live!

### Dashboard: `https://your-app.vercel.app`
### API: `https://your-app.vercel.app/api/v1/*`
### Webhooks: `https://your-app.vercel.app/api/webhooks/*`

---

## 🔧 Environment Variables Reference

| Variable | Description | Required |
|----------|-------------|----------|
| `DATABASE_URL` | Supabase connection pooling URL | Yes |
| `DIRECT_URL` | Supabase direct connection URL | Yes |
| `JWT_SECRET` | Secret key for JWT tokens | Yes |
| `NEXTAUTH_URL` | Your app's URL | Yes |
| `NEXTAUTH_SECRET` | NextAuth secret | Yes |
| `SMTP_HOST` | Email server host | No |
| `SMTP_USER` | Email username | No |
| `SMTP_PASS` | Email password | No |
| `NODE_ENV` | Environment (production) | Yes |

## 🆘 Troubleshooting

### Database Connection Issues:
- Verify DATABASE_URL format
- Check Supabase project is active
- Ensure connection pooling is enabled

### Build Errors:
- Check environment variables are set
- Verify Prisma schema is valid
- Review Vercel build logs

### Webhook Issues:
- Verify URLs are accessible
- Check webhook payload format
- Review application logs

---

## 📞 Support

If you encounter issues:
1. Check Vercel deployment logs
2. Verify all environment variables
3. Test database connectivity
4. Review webhook configuration

Your Netbanx Dashboard Portal is ready for production! 🚀