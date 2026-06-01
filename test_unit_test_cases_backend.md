# Backend Unit Test Cases — Smart Outage Management Portal

These unit test cases are derived from the attached instructions (source of truth).
Each test case includes the required fields:
- Test ID
- Component/Function being tested
- Test description
- Input / Setup
- Expected output
- Pass/Fail criteria

> Note: The repository currently does not contain backend source code modules. Jest unit tests are scaffolded separately in `test_backend_units.test.js` and will need to be wired to actual module paths once implemented.

---

## TC-BE-VAL-001 — Outage creation validation (all required fields)

- **Test ID:** TC-BE-VAL-001
- **Component/Function being tested:** `validateOutageCreate(payload)`
- **Test description:** Valid payload with all required fields passes validation.
- **Input / Setup:**
  - Payload includes required fields: `title`, `postcode`, `priority`, `startTime` (and any other required by implementation).
- **Expected output:** Validation returns `{ ok: true }` (or no exception).
- **Pass/Fail criteria:**
  - Pass if validator indicates success and returns normalized payload (if applicable).
  - Fail if validator rejects a complete payload.

## TC-BE-VAL-002 — Outage creation validation rejects missing fields

- **Test ID:** TC-BE-VAL-002
- **Component/Function being tested:** `validateOutageCreate(payload)`
- **Test description:** Missing required fields is rejected with meaningful error details.
- **Input / Setup:**
  - Payload missing `title` and/or `postcode`.
- **Expected output:** `{ ok: false, errors: [...] }` or throws a validation error.
- **Pass/Fail criteria:**
  - Pass if missing fields are detected and clearly reported.
  - Fail if validator allows incomplete payloads.

---

## TC-BE-AUTH-001 — JWT token generation includes expiry

- **Test ID:** TC-BE-AUTH-001
- **Component/Function being tested:** `generateJwt({ userId, roles, now })`
- **Test description:** JWT generation produces token with correct claims and expiration.
- **Input / Setup:**
  - Known `userId`, known `roles`, fixed `now` timestamp.
- **Expected output:** Token string; decoded payload includes `sub/userId`, `roles`, and `exp` > `now`.
- **Pass/Fail criteria:**
  - Pass if decoded claims match and expiry is set correctly.
  - Fail if expiry missing or claims incorrect.

## TC-BE-AUTH-002 — JWT expiry validation rejects expired token

- **Test ID:** TC-BE-AUTH-002
- **Component/Function being tested:** `verifyJwt(token, { now })`
- **Test description:** Expired JWT is rejected.
- **Input / Setup:**
  - Token whose `exp` is < `now`.
- **Expected output:** Verification fails (returns error or throws).
- **Pass/Fail criteria:**
  - Pass if expired token is rejected.
  - Fail if expired token is accepted.

---

## TC-BE-RBAC-001 — Role middleware blocks wrong role

- **Test ID:** TC-BE-RBAC-001
- **Component/Function being tested:** `requireRole(['DISPATCHER'])(req,res,next)`
- **Test description:** Middleware denies access if user lacks required role.
- **Input / Setup:**
  - `req.user.roles = ['CUSTOMER']`
- **Expected output:** Response set to 403 or error thrown; `next` not called.
- **Pass/Fail criteria:**
  - Pass if 403 is returned and handler is not reached.
  - Fail if request proceeds.

## TC-BE-RBAC-002 — Role middleware allows correct role

- **Test ID:** TC-BE-RBAC-002
- **Component/Function being tested:** `requireRole(['DISPATCHER'])(req,res,next)`
- **Test description:** Middleware allows access if required role present.
- **Input / Setup:**
  - `req.user.roles = ['DISPATCHER']`
- **Expected output:** `next()` called.
- **Pass/Fail criteria:**
  - Pass if next called once and no response sent.
  - Fail if incorrectly blocked.

---

## TC-BE-NOTIF-001 — Notification trigger fires on outage create

- **Test ID:** TC-BE-NOTIF-001
- **Component/Function being tested:** `notificationTrigger.onOutageCreated(outage)`
- **Test description:** Creating an outage triggers notification creation.
- **Input / Setup:**
  - Mock notification service/repository.
  - Valid outage object.
- **Expected output:** Notification service called with expected template/type.
- **Pass/Fail criteria:**
  - Pass if notification service called once with correct payload.
  - Fail if no call or wrong type.

## TC-BE-NOTIF-002 — Notification trigger fires on outage resolve

- **Test ID:** TC-BE-NOTIF-002
- **Component/Function being tested:** `notificationTrigger.onOutageResolved(outage, resolution)`
- **Test description:** Resolving an outage triggers “resolved” notification.
- **Input / Setup:**
  - Mock notification service/repository.
  - Outage + resolution notes.
- **Expected output:** Notification service called with RESOLVED notification type.
- **Pass/Fail criteria:**
  - Pass if correct notification emitted.
  - Fail if missing/incorrect.

---

## TC-BE-AUD-001 — Audit record auto-generation on resolve

- **Test ID:** TC-BE-AUD-001
- **Component/Function being tested:** `auditRecorder.recordOutageResolved(outageId, actor, notes)`
- **Test description:** Resolving an outage automatically creates an audit record.
- **Input / Setup:**
  - Mock audit repository.
  - Outage resolve event inputs.
- **Expected output:** Audit repository called with expected shape (who/what/when).
- **Pass/Fail criteria:**
  - Pass if audit write occurs with correct fields.
  - Fail if not recorded.

---

## TC-BE-CSV-001 — CSV export formatting

- **Test ID:** TC-BE-CSV-001
- **Component/Function being tested:** `formatAuditCsv(records)`
- **Test description:** Export CSV contains header row and properly escaped values.
- **Input / Setup:**
  - Records include commas, quotes, and newlines in fields.
- **Expected output:** CSV string is valid (header present; values quoted/escaped).
- **Pass/Fail criteria:**
  - Pass if CSV parses into expected rows/columns and escapes are correct.
  - Fail if malformed CSV.

---

## TC-BE-ZONE-001 — Postcode/zone lookup logic

- **Test ID:** TC-BE-ZONE-001
- **Component/Function being tested:** `isPostcodeInOutageZone(postcode, zoneIndex)`
- **Test description:** Known in-zone postcode returns true; out-of-zone returns false.
- **Input / Setup:**
  - Provide zone index fixture (ranges or set).
  - Test two postcodes: in-zone and not.
- **Expected output:** Boolean value for each postcode.
- **Pass/Fail criteria:**
  - Pass if boolean matches expected.
  - Fail if mismatch.

## TC-BE-ZONE-002 — Postcode validation rejects invalid format

- **Test ID:** TC-BE-ZONE-002
- **Component/Function being tested:** `validatePostcode(postcode)`
- **Test description:** Invalid postcode format returns validation error.
- **Input / Setup:** Postcode `"ABC###"` or empty.
- **Expected output:** `{ ok: false }` / throws.
- **Pass/Fail criteria:**
  - Pass if invalid postcodes rejected.
  - Fail if accepted.

---

## TC-BE-STATUS-001 — Status transition validation allows valid chain

- **Test ID:** TC-BE-STATUS-001
- **Component/Function being tested:** `validateJobStatusTransition(from, to)`
- **Test description:** Valid chain is allowed: `EN_ROUTE → ON_SITE → RESOLVED`.
- **Input / Setup:** Pairs (EN_ROUTE, ON_SITE) and (ON_SITE, RESOLVED).
- **Expected output:** Allowed (true / no error).
- **Pass/Fail criteria:**
  - Pass if both transitions allowed.
  - Fail if blocked.

## TC-BE-STATUS-002 — Status transition validation rejects invalid transition

- **Test ID:** TC-BE-STATUS-002
- **Component/Function being tested:** `validateJobStatusTransition(from, to)`
- **Test description:** Invalid transition is rejected (e.g., `EN_ROUTE → RESOLVED`).
- **Input / Setup:** Pair (EN_ROUTE, RESOLVED).
- **Expected output:** Rejected (false / throws with reason).
- **Pass/Fail criteria:**
  - Pass if invalid transition rejected.
  - Fail if allowed.
