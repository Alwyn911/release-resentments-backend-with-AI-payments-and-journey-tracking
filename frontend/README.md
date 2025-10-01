# Frontend Files

This folder contains the frontend web application files.

## Files:
- **landing-page.html** - Marketing landing page with pricing
- **app-integrated.html** - Main web application with backend integration

## Setup for Danish:

In `app-integrated.html`, find this line (around line 625):

const API_URL = 'https://your-api-url.com/api';

Change it to your deployed backend URL:

const API_URL = 'https://your-deployed-backend.railway.app/api';

Then deploy frontend to Netlify or serve from backend.
