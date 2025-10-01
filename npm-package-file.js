{
  "name": "release-resentments-backend",
  "version": "1.0.0",
  "description": "Backend API for RELEASE Resentments - Forgiveness Journey Platform",
  "main": "server.js",
  "scripts": {
    "start": "node server.js",
    "dev": "nodemon server.js",
    "test": "jest --coverage",
    "lint": "eslint ."
  },
  "keywords": [
    "forgiveness",
    "mental-health",
    "wellness",
    "resentment"
  ],
  "author": "RELEASE Resentments",
  "license": "MIT",
  "dependencies": {
    "@anthropic-ai/sdk": "^0.24.0",
    "@sendgrid/mail": "^8.1.0",
    "bcryptjs": "^2.4.3",
    "cors": "^2.8.5",
    "dotenv": "^16.3.1",
    "express": "^4.18.2",
    "express-rate-limit": "^7.1.5",
    "helmet": "^7.1.0",
    "jsonwebtoken": "^9.0.2",
    "mongoose": "^8.0.3",
    "nodemailer": "^6.9.7",
    "stripe": "^14.10.0"
  },
  "devDependencies": {
    "eslint": "^8.56.0",
    "jest": "^29.7.0",
    "nodemon": "^3.0.2",
    "supertest": "^6.3.3"
  },
  "engines": {
    "node": ">=18.0.0",
    "npm": ">=9.0.0"
  }
}