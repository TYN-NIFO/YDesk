## Vercel Deployment via GitHub Actions (Monorepo)

## Workspace UI

Internal screens share the navy/yellow design tokens in `src/app/workspace.css`. Use `PageHeading`, `FormSection`, `Field`, and `Dialog` from `components/ui/WorkspaceUI` for new forms. Form pages use `ui-form-layout` with `ui-form-main` and an optional `ui-summary` sidebar, which stacks below the form on narrow screens.

Use `ui-control` for text inputs/selects, `ui-check` for checkboxes/radios, and `ui-button` with `ui-button-primary`, `ui-button-secondary`, or `ui-button-danger` for actions. Keep green/red for outcomes and validation. Tables use `ui-table`, `ui-table-head`, `ui-table-th`, and `ui-table-td` inside a horizontal overflow container. `Dialog` supplies a responsive portal, focus trapping/restoration, Escape dismissal, and background scroll locking; pass `busy` while a request is running.

This project is deployed from the `frontend/` directory using Vercel CLI in CI.

### Prerequisites

Create the following GitHub repository secrets (Settings → Secrets and variables → Actions):

- `VERCEL_TOKEN`: Personal token from Vercel
- `VERCEL_ORG_ID`: Vercel Organization ID
- `VERCEL_PROJECT_ID`: Vercel Project ID for this frontend

You can get these by running in `frontend/` locally after `npm i -g vercel` and logging in:

```
vercel link
vercel project ls
```

### Workflow

The workflow `.github/workflows/deploy-frontend-vercel.yml`:
- Only runs on changes under `frontend/**` or manual dispatch
- Installs dependencies, pulls env, builds, then deploys a prebuilt artifact to production

### Environment variables

Configure environment variables in Vercel project settings for production (and preview if needed). The app expects:

- `NEXT_PUBLIC_API_URL` → Backend API base (e.g. `https://api.example.com/api`)

This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
