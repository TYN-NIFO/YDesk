# Email Service Setup Guide

## Feedback notifications and weekly summaries

The feedback portal sends submission receipts and status updates through Resend, with legacy SendGrid/SMTP support. Automated email tests stub providers and send no real messages. Weekly reports for handlers list every feedback received in the reporting period, grouped by category, with its reference, full subject, feedback type, received date in IST, and current status. Totals, status changes, and a portal link are also included. Reports for summary viewers contain aggregate counts only. Names, descriptions, reviewer notes, and attachments are excluded from weekly reports. Synthetic previews use the same template as the scheduled report and are clearly marked SAMPLE.

Weekly automation is implemented in `.github/workflows/weekly-feedback-summary.yml`, scheduled for Fridays at 18:00 Asia/Kolkata (12:30 UTC), with retry runs at 18:30 and 19:00. It is disabled unless the repository variable `WEEKLY_SUMMARY_ENABLED` equals `true`. Successful recipients are skipped during retries. No schedule or mail delivery was activated during local development.

The GitHub workflow uses Resend over HTTPS. Configure repository secrets `MONGODB_URI`, `RESEND_API_KEY`, and `EMAIL_FROM`, plus repository variable `FRONTEND_URL` pointing to the deployed frontend. Optional variable `RESEND_FROM` overrides `EMAIL_FROM`. The sender must belong to a domain verified in Resend, and a Sending access key is sufficient. The job explicitly ignores the old SendGrid key. It reads its own GitHub secrets and does not inherit Render's environment.

For the Render API, set `RESEND_API_KEY`, `EMAIL_FROM` (or `RESEND_FROM`), and `FRONTEND_URL` in the service environment, then deploy. Resend takes priority over legacy SendGrid/SMTP configuration for password reset emails, password reset confirmations, and feedback notifications. Authentication or sender errors do not fall back to another provider. Never put the API key in frontend variables, code, logs, or chat.

The `/api/health` response reports the selected email provider and whether its required settings are present. It never exposes API keys. Configuration presence does not verify provider acceptance or inbox delivery.

Render Free blocks outbound SMTP on ports 25, 465, and 587. Resend uses HTTPS and avoids those SMTP restrictions. Weekly sends include an idempotency key in addition to MongoDB delivery tracking. A manual dry run generates the report without submitting an email to Resend; it does not prove that the key or sender domain is valid or that a recipient inbox will accept a message.

Recipients must be active accounts with explicit `grievanceAccess: handler` or `summary`; a person's application role alone does not subscribe them. Optional `WEEKLY_SUMMARY_RECIPIENTS` restricts this eligible list to specified comma-separated delivery addresses. Set reviewer access using the existing access-management script. Summary access receives counts only, with a link to `/feedback`; handler access receives detailed reports.

The administrative `weeklySummaryEmail` account field can route weekly reports to another mailbox while preserving the existing login, password, role, feedback ownership, and delivery deduplication. It does not grant feedback access. Configure it with `node scripts/set-weekly-summary-email.js <login-email> <delivery-email>`; use `none` as the delivery email to restore the login address. Password recovery and transactional notifications continue to use the login email. There is no need to duplicate or synchronize user accounts.

Run `npm run weekly-summary` from `backend` for a dry run against the explicitly configured database. It prints the reporting week and delivery counts without email addresses or feedback content. Actual sending requires both `WEEKLY_SUMMARY_ENABLED=true` and `node scripts/weekly-feedback-summary.js --send`. A manual GitHub workflow run defaults to dry-run mode and can run while scheduled sending is disabled. Keep the manual Send real emails input off during validation. The first reporting period starts at Monday 00:00 IST and ends at the first send attempt. Later periods start at the previous completed report's cutoff, including intervening weekend changes. Each window includes its start and excludes its end to prevent duplicates at the boundary. Retries retain the original cutoff. The open count and displayed item statuses reflect the current database state.

Successful deliveries are recorded per recipient and reporting week to prevent duplicate sends. A report is complete only when every eligible recipient has a confirmed `sent` delivery; no-recipient reports remain pending. Failed deliveries can be retried, including deliveries belonging to a report previously marked complete incorrectly; successful ones are skipped. The CLI exits unsuccessfully while recipients remain pending so monitoring can detect incomplete delivery. If a process stops while a delivery is marked `sending`, inspect provider delivery logs before resetting that entry to `failed`, since the email may already have been accepted. These ambiguous deliveries are never retried automatically, even after a timeout.

Local preview runs deliberately skip production environment files and do not configure mail. Checking that an API key exists does not verify sender authorization or inbox delivery. Use a designated test recipient for a separate delivery check before enabling production automation.

## Overview
The application supports three email providers:
1. **Resend API** (preferred when `RESEND_API_KEY` is configured)
2. **SendGrid API** (legacy fallback when no Resend key is configured)
3. **SMTP/Gmail** (fallback when neither API key is configured and the host permits SMTP)

Provider selection is Resend, then SendGrid, then SMTP. The sections below describe legacy provider setup; the production weekly workflow uses Resend.

---

## Option 1: SendGrid Setup (Recommended for Render/Cloud)

### Why SendGrid?
- ✅ Works reliably on all cloud platforms (Render, AWS, Azure, etc.)
- ✅ No SMTP port blocking issues
- ✅ Better deliverability rates
- ✅ Free tier: 100 emails/day
- ✅ Better tracking and analytics

### Setup Steps:

#### 1. Create SendGrid Account
1. Go to [https://sendgrid.com](https://sendgrid.com)
2. Sign up for a free account
3. Verify your email address

#### 2. Create API Key
1. Go to Settings → API Keys
2. Click "Create API Key"
3. Name it: `claim-app-production`
4. Select "Full Access" or "Restricted Access" with Mail Send permission
5. Copy the API key (you won't see it again!)

#### 3. Verify Sender Email (Important!)
1. Go to Settings → Sender Authentication
2. Click "Verify a Single Sender"
3. Fill in details:
   - From Name: `The Yellow Network Claims`
   - From Email: `info@theyellownetwork.com`
   - Reply To: (same as from email or support email)
4. Check your email and click verification link

#### 4. Configure Environment Variables

**On Render Dashboard:**
- Go to your service → Environment tab
- Add these variables:
  ```
  SENDGRID_API_KEY=SG.xxxxxxxxxxxxxxxxxxxxxxxxxxxxx
  EMAIL_FROM=info@theyellownetwork.com
  FRONTEND_URL=https://claim-settle-management-gyjm.vercel.app
  ```

**In local `config.env`:**
```env
# SendGrid Configuration (Recommended for Production)
SENDGRID_API_KEY=SG.xxxxxxxxxxxxxxxxxxxxxxxxxxxxx
EMAIL_FROM=info@theyellownetwork.com

# Frontend URL
FRONTEND_URL=http://localhost:3000
```

#### 5. Deploy
- Commit and push changes
- Render will automatically redeploy
- Test the forgot password feature

---

## Option 2: SMTP/Gmail Setup

### Setup Steps:

#### 1. Enable 2-Factor Authentication on Gmail
1. Go to your Google Account settings
2. Enable 2-Factor Authentication

#### 2. Generate App Password
1. Go to Google Account → Security → 2-Step Verification → App passwords
2. Select "Mail" and "Other (Custom name)"
3. Name it: "Claim App"
4. Copy the 16-character password (format: xxxx xxxx xxxx xxxx)

#### 3. Configure Environment Variables

**In `config.env`:**
```env
# SMTP Configuration (Development or if SendGrid not available)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=465
SMTP_USER=innovation@theyellow.network
SMTP_PASS=xxxx xxxx xxxx xxxx
SMTP_FROM=info@theyellownetwork.com

# Frontend URL
FRONTEND_URL=http://localhost:3000
```

⚠️ **Note:** SMTP (especially port 587 and 465) is often blocked on cloud platforms like Render, AWS, Azure. Use SendGrid for production.

---

## Testing

### Local Testing:
```bash
cd backend
npm install @sendgrid/mail  # If using SendGrid
npm run dev
```

### Test Forgot Password Flow:
1. Go to `http://localhost:3000/login`
2. Click "Forgot your password?"
3. Enter a registered email
4. Check email inbox (and spam folder)
5. Click the reset link
6. Enter new password
7. Log in with new password

### Check Logs:
The enhanced logging will show:
```
📧 Using SendGrid Email Service
✅ SendGrid Email Service initialized successfully
📧 Attempting to send password reset email via SendGrid
✅ Password reset email sent successfully via SendGrid
```

Or if using SMTP:
```
📧 Using SMTP Email Service
📧 Initializing Email Service with config
✅ Email service is ready to send messages
📧 Attempting to send password reset email
✅ Password reset email sent successfully
```

---

## Troubleshooting

### SendGrid Issues:

**"Sender email not verified"**
- Go to SendGrid → Settings → Sender Authentication
- Verify your sender email address
- Wait for verification email and click the link

**"API key invalid"**
- Regenerate API key in SendGrid dashboard
- Make sure you copied it correctly (starts with `SG.`)
- Update environment variable and redeploy

**"Email not arriving"**
- Check spam folder
- Verify sender email is verified in SendGrid
- Check SendGrid → Activity Feed for delivery status

### SMTP Issues:

**"Connection timeout"**
- Port 587/465 is blocked by your cloud provider
- Switch to SendGrid instead
- Or contact your cloud provider to whitelist SMTP ports

**"Invalid credentials"**
- Regenerate app password in Google Account
- Make sure 2FA is enabled
- Copy password without spaces

**"Authentication failed"**
- Double-check SMTP_USER and SMTP_PASS
- Use app password, not regular Gmail password

---

## Production Checklist

✅ SendGrid account created and verified  
✅ API key generated and securely stored  
✅ Sender email verified in SendGrid  
✅ Environment variables configured on Render  
✅ `FRONTEND_URL` set to production URL  
✅ Test email sending in production  
✅ Check email deliverability (inbox, not spam)  
✅ Monitor SendGrid Activity Feed for issues  
✅ Set up email alerts in SendGrid dashboard  

---

## Cost Comparison

| Provider | Free Tier | Paid Plans |
|----------|-----------|------------|
| **SendGrid** | 100 emails/day | $19.95/month for 50K emails |
| **Gmail SMTP** | ~500 emails/day | Subject to Gmail limits |

For production apps, SendGrid provides better deliverability and reliability.

---

## Support

- SendGrid Docs: https://docs.sendgrid.com
- Gmail SMTP: https://support.google.com/mail/answer/7126229
- Issues: Check backend logs for detailed error messages

