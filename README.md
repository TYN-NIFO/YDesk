# Claim Settlement Management System

## Feedback portal

The portal is available at `/feedback`; `/grievances` redirects there and the legacy API remains compatible. The neutral form offers General feedback, Suggestion, Appreciation, and Concern. Workload and grievance choices are absent from new submissions. Existing records and categories are preserved without a database migration.

All five app roles can submit and see their own feedback. Explicit handler access permits review of other people's submissions; handlers cannot act on their own. Explicit summary access permits aggregate reports, not other people's details or attachments. Roles alone do not grant portal-wide access. The disposable local preview assigns handler access to admin/finance and summary access to executives so each view can be tested; employee and supervisor accounts see only their own submissions.

Weekly email automation is implemented but opt-in and disabled by default. See `backend/EMAIL_SETUP.md` for its Monday schedule, eligible recipients, dry-run command, and deployment requirements.

## Local verification and preview

Use Node.js 22 or newer. Install dependencies with `npm ci` in `backend` and `frontend`.

- Backend checks: `cd backend`, then `npm run build` and `npm test`. Tests use a disposable MongoDB instance and stubbed storage; the first run downloads MongoDB.
- Frontend checks: `cd frontend`, then `npm run type-check`, `npm run lint`, and `npm run build`.
- Isolated API preview: run `npm run dev:local` in `backend`. It listens on port 5000, creates temporary preview accounts, and prints a temporary password. It does not load production credentials. Receipts and email require real infrastructure and are intentionally unavailable in this preview.
- Frontend preview in PowerShell: `$env:NEXT_PUBLIC_API_URL='http://127.0.0.1:5000/api'; npm run dev` from `frontend`.
- Open that preview on `http://127.0.0.1:3000` (or the selected port). Keep the frontend and API hostname identical so development refresh cookies remain same-site.

## Deployment notes for the security update

- Existing browser sessions must sign in again because refresh-token digests changed. Sign out now revokes all sessions for the account, including MCP OAuth sessions; password changes, resets, and admin session revocation also invalidate access tokens immediately.
- Claims always start as submitted. Only dedicated approval/payment actions can advance their status. Editing an approved claim requires approval again; settled claims cannot be edited.
- Monetary totals include amount plus GST, converted server-side and rounded to paise. Foreign currency uses configured policy exchange rates or Frankfurter's current reference rates; unavailable rates block submission rather than inventing a rate. Negative net payable represents an advance to reconcile.
- Policy responses expose the canonical policy object to frontend consumers. Category definitions are persisted with each policy version. Required document labels are enforced per line item; select the matching receipt label in the expense form.
- Confidential grievance files require a separate `AWS_S3_PRIVATE_BUCKET_NAME` in the same AWS region, with all four S3 Block Public Access settings enabled. Grant the backend role access to that bucket, including `s3:GetBucketPublicAccessBlock`. Uploads fail closed if this configuration is missing. Ordinary receipt/avatar storage continues using `AWS_S3_BUCKET_NAME`.
- Before enabling grievance attachments in production, run `node scripts/migrate-grievance-storage.js` from `backend` to inspect legacy files, then run it with `--apply` after reviewing the output. The apply command copies files into private storage, updates records, and deletes public originals. It can resume interrupted cleanup. Legacy attachments are unavailable through YDesk until migrated; their former public URLs remain a risk until migration completes. Review versioned originals and CDN caches separately if your bucket uses them.
- Keep environment files out of version control. Rotate any real accounts provisioned with credentials previously embedded in development scripts.
- Provisioning scripts now require `SEED_USER_PASSWORD` (at least 12 characters); the organization seed script takes `EMPLOYEE_PASSWORD`, `ADMIN_PASSWORD`, `SUPERVISOR_PASSWORD`, and `FINANCE_PASSWORD` instead. The standalone MCP integration test requires an explicit isolated API URL and test credentials, and must never run against production.

A full-stack, enterprise expense claim and settlement management application with Role-Based Access Control (RBAC), AWS S3 receipt storage, automated validation, and Model Context Protocol (MCP) AI integration.

---

## 📂 Project Structure

* **[`backend/`](./backend)**: Express.js REST API with MongoDB/Mongoose, JWT auth, and AWS S3 integration.
* **[`frontend/`](./frontend)**: Next.js (App Router) with Redux Toolkit and Tailwind CSS.
  * Live URL: [https://claim-settle-management-gyjm.vercel.app/](https://claim-settle-management-gyjm.vercel.app/)
* **[`mcp-server/`](./mcp-server)**: Model Context Protocol (MCP) server enabling conversational claim management via AI assistants (Claude Code, Google Gemini / Antigravity, Claude Desktop, Cursor).
  * Setup Guide: [mcp-server/README.md](./mcp-server/README.md)

---

## 🤖 AI Assistant Integration (MCP Server)

### Hosted endpoint (recommended)

The backend serves MCP itself at **`https://internaltyn.onrender.com/mcp`** (Streamable HTTP, stateless). Nothing to install or deploy separately. Users sign in with their existing YDesk email and password through OAuth, and tools act with exactly that user's permissions.

* **claude.ai / Claude Desktop / mobile**: Settings → Connectors → Add custom connector → URL `https://internaltyn.onrender.com/mcp`, then **Connect** and sign in on the YDesk page. On Team/Enterprise plans an Owner adds it once under Admin settings → Connectors.
* **Claude Code**: `claude mcp add --transport http ydesk-claims https://internaltyn.onrender.com/mcp`, then run `/mcp` in Claude Code to sign in.
* Tools: `get_current_user`, `get_company_policy`, `submit_claim` (receipts as base64), `list_claims`, `get_claim_details`, `finance_review_claim`, `settle_claim_payment`, `get_claim_stats`
* OAuth: discovery under `/.well-known/`, endpoints `/authorize`, `/token`, `/register`, `/revoke`. Allowed redirect URIs are Claude's callback and localhost; add others with `MCP_OAUTH_REDIRECT_URIS` (comma-separated). The public URL comes from `RENDER_EXTERNAL_URL`, or `PUBLIC_API_URL` if set.
* A `Authorization: Bearer <access token>` header from `POST /api/auth/token/` also works.
* Source: [`backend/mcp/`](./backend/mcp)

### Local stdio server

You can also run the standalone stdio server on your own machine:
* **Claude Code**: `claude mcp add claim-settlement node "D:/TYN/ClaimSettleManagement/mcp-server/index.js" -e API_BASE_URL="https://internaltyn.onrender.com"`
* **Google Gemini / Antigravity**: Configured via `~/.gemini/config/mcp_config.json`
* **Claude Desktop**: Configured via `%APPDATA%\Claude\claude_desktop_config.json`
* **Cursor**: Configured via `.cursor/mcp.json`

👉 For detailed setup guides, role permissions, and prompt examples, see **[mcp-server/README.md](./mcp-server/README.md)**.
