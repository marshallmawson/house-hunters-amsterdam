# Email Alerts Configuration

This document describes how to configure email alerts for the scraper and processor.

## Overview

The scraper and processor now send email alerts to your Gmail address when:
- **Scraper fails**: When the Apify actor run fails or any unexpected error occurs
- **Scraper returns 0 results**: When the scraper completes but finds no listings
- **Processor fails**: When the processor encounters an unexpected error
- **Processor processes 0 results**: When the processor finds no listings to process or processes 0 listings

## Setup Instructions

### 1. Create a Gmail App Password

1. Go to your Google Account settings: https://myaccount.google.com/
2. Navigate to **Security** → **2-Step Verification** (enable it if not already enabled)
3. Scroll down to **App passwords**
4. Create a new app password for "Mail"
5. Copy the 16-character password (you'll need this for `GMAIL_APP_PASSWORD`)

### 2. Configure Environment Variables

**Add these lines to your existing `.env` file** (in the root of your project):

```bash
# ============================================
# Email Alerts Configuration
# ============================================
# Gmail account for SMTP authentication (the account with the app password)
GMAIL_USER=marshall.mawson@gmail.com

# Gmail App Password (16-character password from Google Account settings)
GMAIL_APP_PASSWORD=your-16-character-app-password-here

# Email address where alerts will be sent
GMAIL_ALERT_EMAIL=contact@huishunters.com

# Optional: Custom "From" address (defaults to GMAIL_USER if not set)
# Use this if you want emails to appear from your custom domain
GMAIL_FROM_EMAIL=contact@huishunters.com
```

**Configuration Notes**: 
- `GMAIL_USER`: Your Gmail account (`marshall.mawson@gmail.com`) - used for SMTP authentication
- `GMAIL_APP_PASSWORD`: The 16-character app password from your Gmail account (from step 1)
- `GMAIL_ALERT_EMAIL`: Where alerts will be sent (`contact@huishunters.com`) - will forward to your Gmail
- `GMAIL_FROM_EMAIL`: The "From" address shown in emails (`contact@huishunters.com`) - optional, defaults to `GMAIL_USER` if not set. This makes emails appear to come from your custom domain while using Gmail for authentication.

### 3. Set Environment Variables in Cloud Run Jobs

Since your scraper and processor run as Cloud Run Jobs, you need to set the email environment variables using the `gcloud` CLI. Run these commands to update both jobs:

```bash
# Update scraper-job with email environment variables
gcloud run jobs update scraper-job \
  --region europe-west4 \
  --update-env-vars GMAIL_USER=marshall.mawson@gmail.com,GMAIL_APP_PASSWORD=your-16-character-app-password,GMAIL_ALERT_EMAIL=contact@huishunters.com,GMAIL_FROM_EMAIL=contact@huishunters.com

# Update processor-job with email environment variables
gcloud run jobs update processor-job \
  --region europe-west4 \
  --update-env-vars GMAIL_USER=marshall.mawson@gmail.com,GMAIL_APP_PASSWORD=your-16-character-app-password,GMAIL_ALERT_EMAIL=contact@huishunters.com,GMAIL_FROM_EMAIL=contact@huishunters.com
```

**Note:** Replace `your-16-character-app-password` with your actual Gmail app password from step 1.

### 4. Test the Configuration

The email alerts will automatically work once the environment variables are set in Cloud Run. If the credentials are missing or incorrect, the scripts will print a warning but continue running.

## Alert Types

### Scraper Alerts

1. **Scraper Failed** (`🚨 Scraper Failed`)
   - Triggered when: Apify actor run fails or any unexpected error occurs
   - Includes: Error details and traceback

2. **Scraper Returned 0 Results** (`⚠️ Scraper Returned 0 Results`)
   - Triggered when: Scraper completes but finds 0 listings
   - Includes: Possible reasons for the issue

### Processor Alerts

1. **Processor Failed** (`🚨 Processor Failed`)
   - Triggered when: Processor encounters an unexpected error
   - Includes: Error details and traceback

2. **Processor Returned 0 Results** (`⚠️ Processor Returned 0 Results`)
   - Triggered when: Processor finds 0 listings with 'needs_processing' status

3. **Processor Processed 0 Results** (`⚠️ Processor Processed 0 Results`)
   - Triggered when: Processor completes but processes 0 listings (all were skipped)

## Troubleshooting

### Email alerts not sending

1. **Check environment variables**: Ensure all three variables are set correctly
2. **Verify app password**: Make sure you're using the 16-character app password, not your regular Gmail password
3. **Check 2-Step Verification**: App passwords require 2-Step Verification to be enabled
4. **Check logs**: The scripts will print warnings if email configuration is missing

### Email alerts sending but not receiving

1. **Check spam folder**: Gmail may filter automated emails
2. **Verify recipient email**: Ensure `GMAIL_ALERT_EMAIL` is correct
3. **Check Gmail settings**: Ensure your account allows less secure apps (though app passwords should work regardless)

## Implementation Details

- Email utility module: `email_utils.py` (copied to both `scraper/` and `processor/` directories)
- Uses Python's built-in `smtplib` and `email` modules (no additional dependencies)
- SMTP server: `smtp.gmail.com:587` with TLS encryption
- All alerts include timestamps in the email body
