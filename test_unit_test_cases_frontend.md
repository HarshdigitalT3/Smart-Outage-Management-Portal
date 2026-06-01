# Frontend Unit Test Cases — Smart Outage Management Portal

These unit test cases are derived from the attached instructions (source of truth).
Each test case includes the required fields:
- Test ID
- Component/Function being tested
- Test description
- Input / Setup
- Expected output
- Pass/Fail criteria

> Note: The repository currently does not contain frontend source code modules or React components. React Testing Library tests are scaffolded separately in `test_frontend_units.test.jsx` and will need to be wired to actual component paths once implemented.

---

## TC-FE-LOGIN-001 — Login form validation blocks empty submit

- **Test ID:** TC-FE-LOGIN-001
- **Component/Function being tested:** `<LoginForm />`
- **Test description:** Submitting empty form shows validation messages and does not call submit handler.
- **Input / Setup:**
  - Render form with mocked `onSubmit`.
  - Click submit with empty fields.
- **Expected output:** Validation errors shown; `onSubmit` not called.
- **Pass/Fail criteria:**
  - Pass if errors are visible and handler not called.
  - Fail if submit occurs.

## TC-FE-LOGIN-002 — Login form calls submit with valid credentials

- **Test ID:** TC-FE-LOGIN-002
- **Component/Function being tested:** `<LoginForm />`
- **Test description:** Valid username/password triggers submit callback with expected payload.
- **Input / Setup:**
  - Fill in fields.
  - Click submit.
- **Expected output:** `onSubmit({ username, password })` called once.
- **Pass/Fail criteria:**
  - Pass if called correctly.
  - Fail if not called or wrong args.

---

## TC-FE-OUTFORM-001 — Outage form field validation

- **Test ID:** TC-FE-OUTFORM-001
- **Component/Function being tested:** `<OutageForm />`
- **Test description:** Missing required fields (title/postcode/priority) shows errors and blocks submission.
- **Input / Setup:**
  - Render with `onSubmit` mocked.
  - Leave required fields empty.
- **Expected output:** Errors shown; no submission.
- **Pass/Fail criteria:**
  - Pass if submission prevented and errors displayed.
  - Fail if submission allowed.

---

## TC-FE-MAP-001 — Severity colour mapping (marker colours)

- **Test ID:** TC-FE-MAP-001
- **Component/Function being tested:** `getSeverityColor(severity)`
- **Test description:** Severity maps to the correct colour token.
- **Input / Setup:** Provide severities such as `LOW`, `MEDIUM`, `HIGH` (or whatever app uses).
- **Expected output:** Color values match spec (e.g. green/yellow/red).
- **Pass/Fail criteria:**
  - Pass if mapping correct for all severities.
  - Fail if incorrect mapping or default wrong.

---

## TC-FE-BADGE-001 — Status badge rendering by severity

- **Test ID:** TC-FE-BADGE-001
- **Component/Function being tested:** `<StatusBadge severity=... status=... />`
- **Test description:** Badge displays correct label and style/class for severity.
- **Input / Setup:** Render badge with each severity.
- **Expected output:** Text label correct; CSS class or style reflects severity.
- **Pass/Fail criteria:**
  - Pass if badge matches severity mapping.
  - Fail if styling/label mismatched.

---

## TC-FE-JOB-001 — Job card data display

- **Test ID:** TC-FE-JOB-001
- **Component/Function being tested:** `<JobCard job=... />`
- **Test description:** Card renders essential job fields (crew, location, status, ETA).
- **Input / Setup:** Render with a job fixture.
- **Expected output:** UI contains expected text elements for fields.
- **Pass/Fail criteria:**
  - Pass if all required fields are visible and formatted.
  - Fail if missing/incorrect.

---

## TC-FE-LIST-001 — Empty state rendering (no outages)

- **Test ID:** TC-FE-LIST-001
- **Component/Function being tested:** `<OutageList outages={[]} />` (or outages page)
- **Test description:** Shows “no outages” empty-state message when list is empty.
- **Input / Setup:** Render list/page with empty data.
- **Expected output:** Empty state message visible.
- **Pass/Fail criteria:**
  - Pass if message visible.
  - Fail if blank screen or incorrect state.

---

## TC-FE-LIST-002 — Error state rendering (API failure)

- **Test ID:** TC-FE-LIST-002
- **Component/Function being tested:** Outages page/container (with API call)
- **Test description:** When API fails, error UI is displayed.
- **Input / Setup:**
  - Mock API client to reject.
  - Render page and wait for error UI.
- **Expected output:** Error message/banner visible; retry action (if present) visible.
- **Pass/Fail criteria:**
  - Pass if error UI appears deterministically.
  - Fail if unhandled rejection or no error UI.
