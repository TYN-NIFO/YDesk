# Workspace UI and role flows

YDesk retains navy #0f2347, yellow #ffcc00, white surfaces and pale grey backgrounds. Shared controls, headings, dialogs and responsive calendar use the same design tokens. Mobile calendar days show request counts; selecting a day moves to the complete list. Desktop previews show two names, with the complete count and list always available. Search/status/owner filters never cap results.

## Account and role mapping

| Role | Default workspace | Time off | Administration |
| --- | --- | --- | --- |
| Employee | /employee | Own requests and team availability | None |
| Supervisor | /employee | Own requests and team availability | Existing assigned-employee claim scope |
| Finance manager | /finance | Own requests and team availability | Expense review and payment workflows |
| Executive | /executive | Own requests, team availability, approvals and organisation analytics | Existing executive claim workflow |
| Administrator | /admin | Own requests and team availability | People and policy management |

The server enforces access independently of navigation. Administrator and supervisor roles do not imply executive leave approval authority. `/approvals` uses the same executive-only pending queue as Time off. Feedback handler/summary capabilities remain explicit account grants, independent of role.

Google SSO binds to an existing active account; it preserves the existing role and capabilities. Additional Google login addresses require explicit alias mapping. Never create a second user just to attach another login email. `frontend/src/lib/roles.ts` is the shared navigation/capability mapping; backend middleware remains authoritative. No production accounts were reassigned during this UI work.

## Attendance dates

The organisation calendar uses Asia/Kolkata. Personal and calendar lists include overlapping requests across month/year boundaries. Queries use an exclusive upper boundary at the following day's/month's midnight. Calendar responses preserve timestamp offsets via full ISO timestamps. Only the owner and executive receive a request's reason; the team calendar exposes availability. Paginated personal requests and pending approvals provide Previous/Next controls.

## Verification

Run `npm run type-check`, `npm run lint`, and `npm run build` in frontend; `npm test` and `npm run build` in backend. Backend regression coverage includes all five role permissions, SSO account binding, month-spanning attendance, invalid dates and reason visibility. Browser verification uses isolated fixtures, including a 24-request day, and never writes attendance records or sends email.

Verified on 10 November 2026: 72 fixture-based page/viewport/access checks across guest and all five roles; busy-day filtering and complete visibility; executive-only approvals; production login at 1280×720, 375×667 and 320×640 without document overflow; SVG favicon served. Screenshots and JSON reports are in `.local/verification/ui-revamp/` (ignored local artifacts). Frontend lint, type checking and production build passed. Backend syntax validation, the 96-test suite, and the additional integrated date/privacy regression passed. No production deployment was performed as part of this change.
