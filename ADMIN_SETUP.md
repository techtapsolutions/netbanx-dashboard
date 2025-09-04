# Admin Setup Guide

This guide will help you set up the initial super admin user for the Netbanx Dashboard.

## Prerequisites

1. Make sure the database is running and configured
2. Install dependencies: `npm install`
3. Set up your environment variables (see below)

## Environment Variables

Copy `.env.example` to `.env` and configure the following variables:

```bash
# Required for admin setup
DATABASE_URL="postgresql://username:password@localhost:5432/netbanx_dashboard"
JWT_SECRET="your-jwt-secret-key-must-be-32-chars"
SETUP_KEY="your-setup-key-for-admin-initialization"

# Optional but recommended
ENCRYPTION_KEY="your-32-character-encryption-key"
NODE_ENV="development"
```

## Method 1: Using the Setup Script (Recommended)

### Option A: Command Line Arguments
```bash
npm run setup:admin admin@company.com SecurePassword123 John Doe
```

### Option B: Environment Variables
Set these in your `.env` file:
```bash
ADMIN_EMAIL="admin@company.com"
ADMIN_PASSWORD="SecurePassword123"
ADMIN_FIRST_NAME="John"
ADMIN_LAST_NAME="Doe"
```

Then run:
```bash
npm run setup:admin
```

## Method 2: Using the API Endpoint

### Step 1: Start the development server
```bash
npm run dev
```

### Step 2: Check if setup is required
```bash
curl http://localhost:3001/api/setup/admin
```

### Step 3: Create the super admin user
```bash
curl -X POST http://localhost:3001/api/setup/admin \
  -H "Content-Type: application/json" \
  -d '{
    "email": "admin@company.com",
    "password": "SecurePassword123",
    "firstName": "John",
    "lastName": "Doe",
    "setupKey": "your-setup-key-for-admin-initialization"
  }'
```

## Password Requirements

- Minimum 8 characters
- Use a strong, unique password
- Consider using a password manager

## Security Notes

1. **Setup Key**: The `SETUP_KEY` environment variable acts as a security measure to prevent unauthorized admin creation. Keep this secret and remove it from production after setup.

2. **One-time Setup**: The setup process can only be run once. After a super admin is created, the setup endpoints will refuse to create additional super admins.

3. **Environment Security**: Never commit your `.env` file to version control.

## Troubleshooting

### Error: "Super admin already exists"
This means the setup has already been completed. You can:
- Use the existing admin credentials
- Reset the database if you need to start over (⚠️ This will delete all data)

### Error: "Invalid setup key"
Make sure the `SETUP_KEY` in your environment matches the `setupKey` in your API request.

### Error: "Setup is disabled"
The `SETUP_KEY` environment variable is not configured. Add it to your `.env` file.

### Database Connection Issues
1. Verify your `DATABASE_URL` is correct
2. Make sure PostgreSQL is running
3. Check that the database exists
4. Run database migrations: `npm run db:migrate`

## What Happens After Setup

Once the super admin is created, you can:

1. **Login to the Dashboard**: Use the email and password you created
2. **Create Companies**: Super admins can create and manage company accounts
3. **Create Company Admins**: Each company can have their own admin users
4. **Configure Settings**: Set up webhooks, notifications, and API access

## Next Steps

1. **Start the development server**: `npm run dev`
2. **Visit the dashboard**: Open `http://localhost:3001`
3. **Login with your admin credentials**
4. **Create your first company** and start configuring the system

## Production Deployment

For production:
1. Remove the `SETUP_KEY` environment variable after completing setup
2. Use strong, unique passwords for all accounts
3. Configure HTTPS and proper security headers
4. Set up proper backup procedures for your database
5. Configure monitoring and logging

## Support

If you encounter any issues during setup:
1. Check the server logs for detailed error messages
2. Verify all environment variables are correctly configured
3. Ensure the database is accessible and migrations have been applied