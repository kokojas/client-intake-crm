# Verification

## Automated checks

```sh
npm run typecheck
npm test
npm run build
```

TypeScript, all 24 tests and the production build passed on 27 October 2026. Ordinary tests do not contact paid model APIs.

The tests cover receipt idempotency, conflicting payloads, client reuse, failed and stale analysis, task/stage transitions, persistence, semantic validation, API origin checks and spending controls.

HTTP smoke checks cover repeated-event deduplication, conflicting-payload HTTP 409, disabled-AI HTTP 503 and cross-origin mutation HTTP 403. Protected-mode checks cover anonymous API HTTP 401 and workspace redirects to login.

## Database checks

`tests/cloud-verification.sql` covers owner isolation, cross-tenant mutation denial, anonymous read denial, atomic receipt, analysis claims/cache and task history. Fixtures roll back.

`tests/shared-budget-verification.sql` covers incorrect capabilities, private-table denial, bounded reservations, non-increasing allowances and idempotent usage receipts. A separate concurrent REST check confirmed that reservations stop when a fixture allowance is exhausted.

The SECURITY DEFINER RPCs use explicit owner or capability checks and narrow grants. Private meter tables have no direct API role access. See [architecture.md](architecture.md).

## Provider checks

Opt-in synthetic OpenAI checks cover unknown budget/ambiguous deadline, explicit budget/currency/date extraction and hostile instructions embedded in client text. A browser request produced a brief, tasks, reply draft and activity; repeating ready analysis returned the cached result without another model call.

To run paid provider verification with your own configuration:

```sh
npx tsx scripts/verify-openai.ts --one
```

## Browser coverage

Board/List switching, search, service filters, request tabs, stage changes, tasks, activity, clipboard feedback, manual intake and public intake were checked in the browser.

Responsive checks covered desktop, 833 × 1112 tablet and 390 × 844 mobile layouts. Page width matched viewport width, with horizontal scrolling confined to the board. Mobile drawers had no horizontal overflow. Escape dismissal, modal focus wrapping and keyboard access to the form's save action were verified. Workspace and public-form browser warning/error logs were empty.

Screenshots: [desktop](../design/redesign-v1-desktop.png) and [mobile](../design/redesign-v1-mobile-normalized.png).

## Deployment checks still required

Verify the final hosted Auth callback and owner sign-in in the target deployment environment. A public production deployment, Gmail ingestion and automated outbound email are outside the current scope.
