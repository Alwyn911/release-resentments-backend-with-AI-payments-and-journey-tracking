# RELEASE Resentments Backend Environment Variables
# Copy this file to .env and fill in your actual values

# Server Configuration
NODE_ENV=development
PORT=5000

# MongoDB Connection
MONGODB_URI=mongodb://localhost:27017/release-resentments
# For production, use MongoDB Atlas:
# MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/release-resentments?retryWrites=true&w=majority

# JWT Secret (generate a random string)
JWT_SECRET=your-super-secret-jwt-key-change-this-in-production

# Frontend URL (for email links and CORS)
FRONTEND_URL=http://localhost:3000
# For production: https://resentmentrelease.com

# Stripe Configuration
STRIPE_SECRET_KEY=sk_test_your_stripe_secret_key
STRIPE_PUBLISHABLE_KEY=pk_test_your_stripe_publishable_key
STRIPE_WEBHOOK_SECRET=whsec_your_webhook_secret
STRIPE_PRICE_ID=price_your_monthly_subscription_price_id
# Get these from: https://dashboard.stripe.com/apikeys

# Anthropic API (Claude AI)
ANTHROPIC_API_KEY=sk-ant-your-anthropic-api-key
# Get this from: https://console.anthropic.com/

# Email Configuration (using SendGrid, Mailgun, or SMTP)
EMAIL_SERVICE=sendgrid
EMAIL_API_KEY=your_email_service_api_key
EMAIL_FROM=noreply@resentmentrelease.com
EMAIL_FROM_NAME=RELEASE Resentments

# Optional: SMTP Configuration (if not using SendGrid/Mailgun)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-specific-password

# Zoom Integration (optional, for future)
ZOOM_API_KEY=your_zoom_api_key
ZOOM_API_SECRET=your_zoom_api_secret

# Session Configuration
SESSION_SECRET=your-session-secret-change-this-too

# Rate Limiting
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100

# Logging
LOG_LEVEL=info