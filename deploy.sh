#!/bin/bash

echo "🚀 Deploying Netbanx Dashboard Portal to Vercel..."
echo ""

echo "📦 Running initial deployment..."
npx vercel --prod

echo ""
echo "✅ Deployment initiated!"
echo ""
echo "⚠️  NEXT STEPS:"
echo "1. Copy your deployment URL from above"
echo "2. Add environment variables in Vercel dashboard"
echo "3. Redeploy with: npx vercel --prod"
echo ""
echo "🔑 Environment variables needed:"
echo "DATABASE_URL (from Supabase)"
echo "DIRECT_URL (from Supabase)"
echo "JWT_SECRET (use generated secret)"
echo "NEXTAUTH_SECRET (use generated secret)"
echo "NEXTAUTH_URL (your vercel app URL)"
echo ""
echo "📖 Full guide: see DEPLOYMENT_GUIDE.md"