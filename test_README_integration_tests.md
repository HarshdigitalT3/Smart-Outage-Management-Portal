# Integration Tests (REST API)

These tests are written based on the attached requirements (Auth, Outages, Crew & Dispatch, Customer Portal, Notifications, Audit).

## Prerequisites
Because the repository currently does not contain an API implementation, tests run against a live environment:

- `BASE_URL` (required): base URL of the running API, e.g. `http://localhost:3000`

Optional test credentials / data:
- `TEST_VALID_USERNAME`
- `TEST_VALID_PASSWORD`
- `TEST_POSTCODE_IN_OUTAGE_ZONE`
- `TEST_POSTCODE_NO_OUTAGE`

## Running (example)
```bash
# Ensure a backend is running somewhere first.
export BASE_URL="http://localhost:3000"
export TEST_VALID_USERNAME="dispatcher@example.com"
export TEST_VALID_PASSWORD="Password123!"
node --test  # if you later migrate to node:test
```

If using Jest in CI, add a `package.json` later (once the project exists) with:
- `jest`
- `undici`

Then run:
```bash
BASE_URL="http://localhost:3000" npx jest -c test_jest.config.js
```

## Notes
- Endpoint paths are assumed (`/auth/login`, `/outages`, `/crew/available`, `/dispatch/assign`, `/customer/outage-status`, `/notifications`, `/audit`, `/audit/export.csv`).
- Once the backend is implemented, align paths and any field names (`token` vs `accessToken`, response schemas, etc.).
- Each test embeds required per-test metadata: Test ID, endpoint, role, request, expected status, expected response, edge case.
