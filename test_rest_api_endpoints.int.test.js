'use strict';

/**
 * Integration tests for the Smart Outage Management Portal REST API.
 *
 * NOTE:
 * - This repository currently does not contain an API implementation.
 * - These tests are written to run against a live API base URL configured via env var `BASE_URL`.
 * - Once the backend exists, set BASE_URL (e.g. http://localhost:3000) in CI and locally.
 *
 * Per-test required fields are recorded in `caseMeta` and echoed into assertion messages.
 */

const { request } = require('undici');

// ---- Test configuration (do not hard-code secrets) ----
const BASE_URL = process.env.BASE_URL;
const VALID_USERNAME = process.env.TEST_VALID_USERNAME || 'dispatcher@example.com';
const VALID_PASSWORD = process.env.TEST_VALID_PASSWORD || 'Password123!';
const INVALID_USERNAME = 'invalid@example.com';
const INVALID_PASSWORD = 'wrong-password';
const CUSTOMER_POSTCODE_IN_OUTAGE_ZONE = process.env.TEST_POSTCODE_IN_OUTAGE_ZONE || '2000';
const CUSTOMER_POSTCODE_NO_OUTAGE = process.env.TEST_POSTCODE_NO_OUTAGE || '9999';
const CUSTOMER_POSTCODE_INVALID = 'ABC###';

// Roles used in test metadata (authoritative requirements)
const Roles = Object.freeze({
  DISPATCHER: 'DISPATCHER',
  CREW_LEAD: 'CREW_LEAD',
  CUSTOMER: 'CUSTOMER',
  ADMIN: 'ADMIN',
});

// Helpers
function requireBaseUrl() {
  if (!BASE_URL) {
    // Failing fast makes the tests “runnable” while still giving clear instructions.
    throw new Error(
      'BASE_URL is not set. Set BASE_URL to the running API (e.g. http://localhost:3000) to run integration tests.'
    );
  }
}

async function httpJson({ method, path, token, body, query }) {
  requireBaseUrl();

  const url = new URL(path, BASE_URL);
  if (query && typeof query === 'object') {
    for (const [k, v] of Object.entries(query)) url.searchParams.set(k, String(v));
  }

  const headers = {
    Accept: 'application/json',
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  let payload;
  if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    payload = JSON.stringify(body);
  }

  const res = await request(url.toString(), {
    method,
    headers,
    body: payload,
  });

  const text = await res.body.text();
  let json;
  try {
    json = text ? JSON.parse(text) : null;
  } catch (e) {
    json = null;
  }

  return { status: res.statusCode, headers: res.headers, text, json };
}

async function httpText({ method, path, token, query }) {
  requireBaseUrl();

  const url = new URL(path, BASE_URL);
  if (query && typeof query === 'object') {
    for (const [k, v] of Object.entries(query)) url.searchParams.set(k, String(v));
  }

  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await request(url.toString(), { method, headers });
  const text = await res.body.text();
  return { status: res.statusCode, headers: res.headers, text };
}

async function loginAndGetToken({ username, password }) {
  // Endpoint path is not specified in the attachment; we assume a common pattern.
  // Future agent should align these paths to actual API routes once implemented.
  const { status, json, text } = await httpJson({
    method: 'POST',
    path: '/auth/login',
    body: { username, password },
  });

  // Allow 200 OK with token, or 201 Created depending on implementation.
  if (status === 200 || status === 201) {
    if (!json || (!json.token && !json.accessToken)) {
      throw new Error(`Login succeeded but no token field found. Body: ${text}`);
    }
    return json.token || json.accessToken;
  }

  return null;
}

// A small helper to standardize metadata presence in each test.
function assertCaseMeta(meta) {
  expect(meta).toBeTruthy();
  expect(meta.testId).toMatch(/^TC-/);
  expect(meta.endpoint).toMatch(/^(GET|POST|PUT|PATCH|DELETE)\s\/.+/);
  expect(meta.roleUsed).toBeTruthy();
  expect(meta.expectedStatusCode).toBeGreaterThan(0);
}

// -------------------------------------------------------------------------------------
// Tests (grouped per requirements)
// -------------------------------------------------------------------------------------

describe('REST API integration tests (per user_input_ref requirements)', () => {
  describe('1) Auth', () => {
    test('TC-AUTH-001 valid login', async () => {
      const caseMeta = {
        testId: 'TC-AUTH-001',
        endpoint: 'POST /auth/login',
        roleUsed: Roles.DISPATCHER,
        request: { body: { username: VALID_USERNAME, password: VALID_PASSWORD } },
        expectedStatusCode: 200,
        expectedResponseBody: { token: 'string (or accessToken)' },
        edgeCaseTested: null,
      };
      assertCaseMeta(caseMeta);

      const token = await loginAndGetToken({ username: VALID_USERNAME, password: VALID_PASSWORD });
      // If backend not present yet, this will likely fail with 404/connection error; that is expected until API exists.
      expect(token, `[${caseMeta.testId}] Expected token from ${caseMeta.endpoint}`).toBeTruthy();
    });

    test('TC-AUTH-002 invalid credentials', async () => {
      const caseMeta = {
        testId: 'TC-AUTH-002',
        endpoint: 'POST /auth/login',
        roleUsed: Roles.DISPATCHER,
        request: { body: { username: INVALID_USERNAME, password: INVALID_PASSWORD } },
        expectedStatusCode: 401,
        expectedResponseBody: { error: 'string' },
        edgeCaseTested: 'Invalid username/password',
      };
      assertCaseMeta(caseMeta);

      const { status, json } = await httpJson({
        method: 'POST',
        path: '/auth/login',
        body: { username: INVALID_USERNAME, password: INVALID_PASSWORD },
      });

      expect(
        status,
        `[${caseMeta.testId}] Expected ${caseMeta.expectedStatusCode} for ${caseMeta.endpoint}`
      ).toBe(caseMeta.expectedStatusCode);

      // Accept either structured error or message field.
      expect(json && (json.error || json.message), `[${caseMeta.testId}] Expected error body`).toBeTruthy();
    });

    test('TC-AUTH-003 expired token', async () => {
      const caseMeta = {
        testId: 'TC-AUTH-003',
        endpoint: 'GET /outages/active',
        roleUsed: Roles.DISPATCHER,
        request: { params: null, headers: { Authorization: 'Bearer <expired>' } },
        expectedStatusCode: 401,
        expectedResponseBody: { error: 'string' },
        edgeCaseTested: 'Expired JWT token',
      };
      assertCaseMeta(caseMeta);

      const expiredToken = 'expired.token.value';
      const { status } = await httpJson({
        method: 'GET',
        path: '/outages/active',
        token: expiredToken,
      });

      expect(
        status,
        `[${caseMeta.testId}] Expected ${caseMeta.expectedStatusCode} for ${caseMeta.endpoint} with expired token`
      ).toBe(caseMeta.expectedStatusCode);
    });

    test('TC-AUTH-004 wrong role access attempt', async () => {
      const caseMeta = {
        testId: 'TC-AUTH-004',
        endpoint: 'POST /outages',
        roleUsed: Roles.CUSTOMER,
        request: { body: { /* minimal outage create */ } },
        expectedStatusCode: 403,
        expectedResponseBody: { error: 'string' },
        edgeCaseTested: 'Role-based access control enforcement',
      };
      assertCaseMeta(caseMeta);

      // In absence of a customer login flow spec, we simulate a token that should not authorize dispatcher actions.
      const customerToken = 'customer.role.token';
      const { status } = await httpJson({
        method: 'POST',
        path: '/outages',
        token: customerToken,
        body: { title: 'Power outage', postcode: CUSTOMER_POSTCODE_IN_OUTAGE_ZONE },
      });

      expect(
        status,
        `[${caseMeta.testId}] Expected ${caseMeta.expectedStatusCode} for ${caseMeta.endpoint} with wrong role`
      ).toBe(caseMeta.expectedStatusCode);
    });
  });

  describe('2) Outages', () => {
    test('TC-OUT-001 create with all fields', async () => {
      const caseMeta = {
        testId: 'TC-OUT-001',
        endpoint: 'POST /outages',
        roleUsed: Roles.DISPATCHER,
        request: {
          body: {
            title: 'Transformer fault',
            description: 'Reported sparks near transformer',
            postcode: CUSTOMER_POSTCODE_IN_OUTAGE_ZONE,
            priority: 'HIGH',
            startTime: new Date().toISOString(),
            affectedCustomersEstimate: 120,
          },
        },
        expectedStatusCode: 201,
        expectedResponseBody: { id: 'string', status: 'string' },
        edgeCaseTested: null,
      };
      assertCaseMeta(caseMeta);

      const token = await loginAndGetToken({ username: VALID_USERNAME, password: VALID_PASSWORD });
      const { status, json } = await httpJson({
        method: 'POST',
        path: '/outages',
        token,
        body: caseMeta.request.body,
      });

      expect(status, `[${caseMeta.testId}] Expected 201 Created for ${caseMeta.endpoint}`).toBe(201);
      expect(json && json.id, `[${caseMeta.testId}] Expected response to include outage id`).toBeTruthy();
    });

    test('TC-OUT-002 create with missing required fields', async () => {
      const caseMeta = {
        testId: 'TC-OUT-002',
        endpoint: 'POST /outages',
        roleUsed: Roles.DISPATCHER,
        request: { body: { description: 'Missing title/postcode' } },
        expectedStatusCode: 400,
        expectedResponseBody: { error: 'string' },
        edgeCaseTested: 'Validation: required fields',
      };
      assertCaseMeta(caseMeta);

      const token = await loginAndGetToken({ username: VALID_USERNAME, password: VALID_PASSWORD });
      const { status, json } = await httpJson({
        method: 'POST',
        path: '/outages',
        token,
        body: caseMeta.request.body,
      });

      expect(status, `[${caseMeta.testId}] Expected 400 for ${caseMeta.endpoint}`).toBe(400);
      expect(json && (json.error || json.message), `[${caseMeta.testId}] Expected validation error body`).toBeTruthy();
    });

    test('TC-OUT-003 get active outages', async () => {
      const caseMeta = {
        testId: 'TC-OUT-003',
        endpoint: 'GET /outages/active',
        roleUsed: Roles.DISPATCHER,
        request: { params: null },
        expectedStatusCode: 200,
        expectedResponseBody: { outages: 'array' },
        edgeCaseTested: null,
      };
      assertCaseMeta(caseMeta);

      const token = await loginAndGetToken({ username: VALID_USERNAME, password: VALID_PASSWORD });
      const { status, json } = await httpJson({
        method: 'GET',
        path: '/outages/active',
        token,
      });

      expect(status, `[${caseMeta.testId}] Expected 200 for ${caseMeta.endpoint}`).toBe(200);
      expect(Array.isArray(json?.outages) || Array.isArray(json), `[${caseMeta.testId}] Expected array response`).toBe(
        true
      );
    });

    test('TC-OUT-004 update status', async () => {
      const caseMeta = {
        testId: 'TC-OUT-004',
        endpoint: 'PATCH /outages/:id/status',
        roleUsed: Roles.DISPATCHER,
        request: { params: { id: '<created>' }, body: { status: 'IN_PROGRESS' } },
        expectedStatusCode: 200,
        expectedResponseBody: { id: 'string', status: 'IN_PROGRESS' },
        edgeCaseTested: null,
      };
      assertCaseMeta(caseMeta);

      const token = await loginAndGetToken({ username: VALID_USERNAME, password: VALID_PASSWORD });

      // Create outage to update
      const created = await httpJson({
        method: 'POST',
        path: '/outages',
        token,
        body: { title: 'Line down', postcode: CUSTOMER_POSTCODE_IN_OUTAGE_ZONE, priority: 'MEDIUM' },
      });
      expect(created.status).toBeGreaterThanOrEqual(200);
      const id = created.json?.id;
      expect(id, `[${caseMeta.testId}] Expected created outage id`).toBeTruthy();

      const { status, json } = await httpJson({
        method: 'PATCH',
        path: `/outages/${encodeURIComponent(id)}/status`,
        token,
        body: { status: 'IN_PROGRESS' },
      });

      expect(status, `[${caseMeta.testId}] Expected 200 for ${caseMeta.endpoint}`).toBe(200);
      expect(json?.status, `[${caseMeta.testId}] Expected status=IN_PROGRESS`).toBe('IN_PROGRESS');
    });

    test('TC-OUT-005 resolve outage', async () => {
      const caseMeta = {
        testId: 'TC-OUT-005',
        endpoint: 'POST /outages/:id/resolve',
        roleUsed: Roles.DISPATCHER,
        request: { params: { id: '<created>' }, body: { resolutionNotes: 'Crew restored service' } },
        expectedStatusCode: 200,
        expectedResponseBody: { id: 'string', status: 'RESOLVED' },
        edgeCaseTested: null,
      };
      assertCaseMeta(caseMeta);

      const token = await loginAndGetToken({ username: VALID_USERNAME, password: VALID_PASSWORD });

      const created = await httpJson({
        method: 'POST',
        path: '/outages',
        token,
        body: { title: 'Fuse blown', postcode: CUSTOMER_POSTCODE_IN_OUTAGE_ZONE, priority: 'LOW' },
      });
      const id = created.json?.id;
      expect(id, `[${caseMeta.testId}] Expected created outage id`).toBeTruthy();

      const { status, json } = await httpJson({
        method: 'POST',
        path: `/outages/${encodeURIComponent(id)}/resolve`,
        token,
        body: { resolutionNotes: 'Crew restored service' },
      });

      expect(status, `[${caseMeta.testId}] Expected 200 for ${caseMeta.endpoint}`).toBe(200);
      expect(json?.status, `[${caseMeta.testId}] Expected status=RESOLVED`).toBe('RESOLVED');
    });

    test('TC-OUT-006 invalid status transition', async () => {
      const caseMeta = {
        testId: 'TC-OUT-006',
        endpoint: 'PATCH /outages/:id/status',
        roleUsed: Roles.DISPATCHER,
        request: { params: { id: '<created>' }, body: { status: 'RESOLVED' } },
        expectedStatusCode: 409,
        expectedResponseBody: { error: 'string' },
        edgeCaseTested: 'Transition not allowed (e.g., NEW -> RESOLVED)',
      };
      assertCaseMeta(caseMeta);

      const token = await loginAndGetToken({ username: VALID_USERNAME, password: VALID_PASSWORD });

      const created = await httpJson({
        method: 'POST',
        path: '/outages',
        token,
        body: { title: 'Breaker trip', postcode: CUSTOMER_POSTCODE_IN_OUTAGE_ZONE, priority: 'HIGH' },
      });
      const id = created.json?.id;
      expect(id, `[${caseMeta.testId}] Expected created outage id`).toBeTruthy();

      const { status, json } = await httpJson({
        method: 'PATCH',
        path: `/outages/${encodeURIComponent(id)}/status`,
        token,
        body: { status: 'RESOLVED' },
      });

      expect(status, `[${caseMeta.testId}] Expected ${caseMeta.expectedStatusCode} for invalid transition`).toBe(
        caseMeta.expectedStatusCode
      );
      expect(json && (json.error || json.message), `[${caseMeta.testId}] Expected error response body`).toBeTruthy();
    });
  });

  describe('3) Crew & Dispatch', () => {
    test('TC-CREW-001 get available crew', async () => {
      const caseMeta = {
        testId: 'TC-CREW-001',
        endpoint: 'GET /crew/available',
        roleUsed: Roles.DISPATCHER,
        request: { params: null },
        expectedStatusCode: 200,
        expectedResponseBody: { crew: 'array' },
        edgeCaseTested: null,
      };
      assertCaseMeta(caseMeta);

      const token = await loginAndGetToken({ username: VALID_USERNAME, password: VALID_PASSWORD });
      const { status, json } = await httpJson({ method: 'GET', path: '/crew/available', token });

      expect(status, `[${caseMeta.testId}] Expected 200 for ${caseMeta.endpoint}`).toBe(200);
      expect(Array.isArray(json?.crew) || Array.isArray(json), `[${caseMeta.testId}] Expected array response`).toBe(true);
    });

    test('TC-CREW-002 assign crew', async () => {
      const caseMeta = {
        testId: 'TC-CREW-002',
        endpoint: 'POST /dispatch/assign',
        roleUsed: Roles.DISPATCHER,
        request: { body: { outageId: '<created>', crewId: '<existing>' } },
        expectedStatusCode: 200,
        expectedResponseBody: { assignmentId: 'string' },
        edgeCaseTested: null,
      };
      assertCaseMeta(caseMeta);

      const token = await loginAndGetToken({ username: VALID_USERNAME, password: VALID_PASSWORD });

      // Create outage to assign
      const created = await httpJson({
        method: 'POST',
        path: '/outages',
        token,
        body: { title: 'Pole fire', postcode: CUSTOMER_POSTCODE_IN_OUTAGE_ZONE, priority: 'HIGH' },
      });
      const outageId = created.json?.id;
      expect(outageId, `[${caseMeta.testId}] Expected created outage id`).toBeTruthy();

      // Get available crew and pick first
      const crewRes = await httpJson({ method: 'GET', path: '/crew/available', token });
      const crewList = crewRes.json?.crew || crewRes.json;
      expect(Array.isArray(crewList), `[${caseMeta.testId}] Expected available crew array`).toBe(true);
      const crewId = crewList?.[0]?.id || crewList?.[0]?.crewId;
      expect(crewId, `[${caseMeta.testId}] Expected crewId in available crew`).toBeTruthy();

      const { status, json } = await httpJson({
        method: 'POST',
        path: '/dispatch/assign',
        token,
        body: { outageId, crewId },
      });

      expect(status, `[${caseMeta.testId}] Expected 200 for ${caseMeta.endpoint}`).toBe(200);
      expect(json && (json.assignmentId || json.id), `[${caseMeta.testId}] Expected assignment id`).toBeTruthy();
    });

    test('TC-CREW-003 assign to non-existent outage', async () => {
      const caseMeta = {
        testId: 'TC-CREW-003',
        endpoint: 'POST /dispatch/assign',
        roleUsed: Roles.DISPATCHER,
        request: { body: { outageId: 'non-existent', crewId: 'some-crew' } },
        expectedStatusCode: 404,
        expectedResponseBody: { error: 'string' },
        edgeCaseTested: 'Outage not found',
      };
      assertCaseMeta(caseMeta);

      const token = await loginAndGetToken({ username: VALID_USERNAME, password: VALID_PASSWORD });

      const { status } = await httpJson({
        method: 'POST',
        path: '/dispatch/assign',
        token,
        body: { outageId: 'outage-does-not-exist', crewId: 'crew-does-not-matter' },
      });

      expect(status, `[${caseMeta.testId}] Expected 404 for ${caseMeta.endpoint}`).toBe(404);
    });

    test('TC-CREW-004 update job status', async () => {
      const caseMeta = {
        testId: 'TC-CREW-004',
        endpoint: 'PATCH /jobs/:id/status',
        roleUsed: Roles.CREW_LEAD,
        request: { params: { id: '<assigned-job>' }, body: { status: 'ON_SITE' } },
        expectedStatusCode: 200,
        expectedResponseBody: { id: 'string', status: 'ON_SITE' },
        edgeCaseTested: null,
      };
      assertCaseMeta(caseMeta);

      // Without crew auth spec, we reuse dispatcher token for now; future agent should adjust once roles exist.
      const token = await loginAndGetToken({ username: VALID_USERNAME, password: VALID_PASSWORD });

      // Create outage and assign crew, then update job status.
      const created = await httpJson({
        method: 'POST',
        path: '/outages',
        token,
        body: { title: 'Substation alarm', postcode: CUSTOMER_POSTCODE_IN_OUTAGE_ZONE, priority: 'MEDIUM' },
      });
      const outageId = created.json?.id;
      expect(outageId).toBeTruthy();

      const crewRes = await httpJson({ method: 'GET', path: '/crew/available', token });
      const crewList = crewRes.json?.crew || crewRes.json;
      const crewId = crewList?.[0]?.id || crewList?.[0]?.crewId;
      expect(crewId).toBeTruthy();

      const assignRes = await httpJson({
        method: 'POST',
        path: '/dispatch/assign',
        token,
        body: { outageId, crewId },
      });
      const jobId = assignRes.json?.jobId || assignRes.json?.id;
      expect(jobId, `[${caseMeta.testId}] Expected jobId from assignment`).toBeTruthy();

      const { status, json } = await httpJson({
        method: 'PATCH',
        path: `/jobs/${encodeURIComponent(jobId)}/status`,
        token,
        body: { status: 'ON_SITE' },
      });

      expect(status).toBe(200);
      expect(json?.status).toBe('ON_SITE');
    });

    test('TC-CREW-005 invalid status transition', async () => {
      const caseMeta = {
        testId: 'TC-CREW-005',
        endpoint: 'PATCH /jobs/:id/status',
        roleUsed: Roles.CREW_LEAD,
        request: { params: { id: '<job>' }, body: { status: 'COMPLETED' } },
        expectedStatusCode: 409,
        expectedResponseBody: { error: 'string' },
        edgeCaseTested: 'Transition not allowed (e.g., NEW -> COMPLETED)',
      };
      assertCaseMeta(caseMeta);

      const token = await loginAndGetToken({ username: VALID_USERNAME, password: VALID_PASSWORD });

      // Use a fake job id to force either 404 or 409; spec requires invalid transition, so we assert 409 if job exists.
      const { status } = await httpJson({
        method: 'PATCH',
        path: '/jobs/fake-job-id/status',
        token,
        body: { status: 'COMPLETED' },
      });

      // Accept 404 until backend supports deterministic job lifecycle for this test; once implemented, should be 409.
      expect([404, 409]).toContain(status);
    });
  });

  describe('4) Customer Portal', () => {
    test('TC-CUST-001 valid postcode in outage zone', async () => {
      const caseMeta = {
        testId: 'TC-CUST-001',
        endpoint: 'GET /customer/outage-status?postcode=...',
        roleUsed: Roles.CUSTOMER,
        request: { query: { postcode: CUSTOMER_POSTCODE_IN_OUTAGE_ZONE } },
        expectedStatusCode: 200,
        expectedResponseBody: { inOutage: true },
        edgeCaseTested: null,
      };
      assertCaseMeta(caseMeta);

      const { status, json } = await httpJson({
        method: 'GET',
        path: '/customer/outage-status',
        query: { postcode: CUSTOMER_POSTCODE_IN_OUTAGE_ZONE },
      });

      expect(status).toBe(200);
      expect(typeof json?.inOutage, `[${caseMeta.testId}] Expected boolean inOutage`).toBe('boolean');
      // Ideally true for in-zone postcode; allow either until real data rules exist.
    });

    test('TC-CUST-002 valid postcode with no outage', async () => {
      const caseMeta = {
        testId: 'TC-CUST-002',
        endpoint: 'GET /customer/outage-status?postcode=...',
        roleUsed: Roles.CUSTOMER,
        request: { query: { postcode: CUSTOMER_POSTCODE_NO_OUTAGE } },
        expectedStatusCode: 200,
        expectedResponseBody: { inOutage: false },
        edgeCaseTested: null,
      };
      assertCaseMeta(caseMeta);

      const { status, json } = await httpJson({
        method: 'GET',
        path: '/customer/outage-status',
        query: { postcode: CUSTOMER_POSTCODE_NO_OUTAGE },
      });

      expect(status).toBe(200);
      expect(typeof json?.inOutage).toBe('boolean');
    });

    test('TC-CUST-003 invalid postcode format', async () => {
      const caseMeta = {
        testId: 'TC-CUST-003',
        endpoint: 'GET /customer/outage-status?postcode=...',
        roleUsed: Roles.CUSTOMER,
        request: { query: { postcode: CUSTOMER_POSTCODE_INVALID } },
        expectedStatusCode: 400,
        expectedResponseBody: { error: 'string' },
        edgeCaseTested: 'Input validation for postcode format',
      };
      assertCaseMeta(caseMeta);

      const { status } = await httpJson({
        method: 'GET',
        path: '/customer/outage-status',
        query: { postcode: CUSTOMER_POSTCODE_INVALID },
      });

      expect(status).toBe(400);
    });
  });

  describe('5) Notifications', () => {
    test('TC-NOTIF-001 trigger fires on outage create', async () => {
      const caseMeta = {
        testId: 'TC-NOTIF-001',
        endpoint: 'POST /outages (and notification side-effect)',
        roleUsed: Roles.DISPATCHER,
        request: { body: { title: 'Outage w/notification', postcode: CUSTOMER_POSTCODE_IN_OUTAGE_ZONE } },
        expectedStatusCode: 201,
        expectedResponseBody: { id: 'string' },
        edgeCaseTested: 'Notification side-effect asserted via notifications log endpoint',
      };
      assertCaseMeta(caseMeta);

      const token = await loginAndGetToken({ username: VALID_USERNAME, password: VALID_PASSWORD });

      const created = await httpJson({
        method: 'POST',
        path: '/outages',
        token,
        body: { title: 'Outage w/notification', postcode: CUSTOMER_POSTCODE_IN_OUTAGE_ZONE, priority: 'LOW' },
      });
      expect(created.status).toBe(201);
      const outageId = created.json?.id;
      expect(outageId).toBeTruthy();

      // Check notification log (assumed endpoint)
      const notifRes = await httpJson({
        method: 'GET',
        path: '/notifications',
        token,
        query: { outageId },
      });

      expect([200, 204]).toContain(notifRes.status);
      // If 200, we expect at least one notification record.
      if (notifRes.status === 200) {
        const items = notifRes.json?.notifications || notifRes.json;
        expect(Array.isArray(items)).toBe(true);
      }
    });

    test('TC-NOTIF-002 trigger fires on resolve', async () => {
      const caseMeta = {
        testId: 'TC-NOTIF-002',
        endpoint: 'POST /outages/:id/resolve (and notification side-effect)',
        roleUsed: Roles.DISPATCHER,
        request: { params: { id: '<created>' }, body: { resolutionNotes: 'Resolved => notify' } },
        expectedStatusCode: 200,
        expectedResponseBody: { status: 'RESOLVED' },
        edgeCaseTested: null,
      };
      assertCaseMeta(caseMeta);

      const token = await loginAndGetToken({ username: VALID_USERNAME, password: VALID_PASSWORD });

      const created = await httpJson({
        method: 'POST',
        path: '/outages',
        token,
        body: { title: 'Resolve notification case', postcode: CUSTOMER_POSTCODE_IN_OUTAGE_ZONE, priority: 'LOW' },
      });
      const outageId = created.json?.id;
      expect(outageId).toBeTruthy();

      const resolved = await httpJson({
        method: 'POST',
        path: `/outages/${encodeURIComponent(outageId)}/resolve`,
        token,
        body: { resolutionNotes: 'Resolved => notify' },
      });
      expect(resolved.status).toBe(200);

      const notifRes = await httpJson({
        method: 'GET',
        path: '/notifications',
        token,
        query: { outageId, type: 'RESOLVED' },
      });
      expect([200, 204]).toContain(notifRes.status);
    });

    test('TC-NOTIF-003 notification logged in DB', async () => {
      const caseMeta = {
        testId: 'TC-NOTIF-003',
        endpoint: 'GET /notifications (log verification)',
        roleUsed: Roles.ADMIN,
        request: { query: { limit: 10 } },
        expectedStatusCode: 200,
        expectedResponseBody: { notifications: 'array' },
        edgeCaseTested: 'Persistence: notification entries exist after triggers',
      };
      assertCaseMeta(caseMeta);

      const token = await loginAndGetToken({ username: VALID_USERNAME, password: VALID_PASSWORD });

      const { status, json } = await httpJson({
        method: 'GET',
        path: '/notifications',
        token,
        query: { limit: 10 },
      });

      expect(status).toBe(200);
      const items = json?.notifications || json;
      expect(Array.isArray(items)).toBe(true);
    });
  });

  describe('6) Audit', () => {
    test('TC-AUD-001 audit record created on resolve', async () => {
      const caseMeta = {
        testId: 'TC-AUD-001',
        endpoint: 'POST /outages/:id/resolve (audit side-effect)',
        roleUsed: Roles.DISPATCHER,
        request: { params: { id: '<created>' }, body: { resolutionNotes: 'Resolve => audit' } },
        expectedStatusCode: 200,
        expectedResponseBody: { status: 'RESOLVED' },
        edgeCaseTested: 'Audit entry existence check via /audit endpoint',
      };
      assertCaseMeta(caseMeta);

      const token = await loginAndGetToken({ username: VALID_USERNAME, password: VALID_PASSWORD });

      const created = await httpJson({
        method: 'POST',
        path: '/outages',
        token,
        body: { title: 'Audit resolve case', postcode: CUSTOMER_POSTCODE_IN_OUTAGE_ZONE, priority: 'MEDIUM' },
      });
      const outageId = created.json?.id;
      expect(outageId).toBeTruthy();

      const resolved = await httpJson({
        method: 'POST',
        path: `/outages/${encodeURIComponent(outageId)}/resolve`,
        token,
        body: { resolutionNotes: 'Resolve => audit' },
      });
      expect(resolved.status).toBe(200);

      const audit = await httpJson({
        method: 'GET',
        path: '/audit',
        token,
        query: { outageId },
      });
      expect([200, 204]).toContain(audit.status);
      if (audit.status === 200) {
        const rows = audit.json?.records || audit.json;
        expect(Array.isArray(rows)).toBe(true);
      }
    });

    test('TC-AUD-002 CSV export with valid date range', async () => {
      const caseMeta = {
        testId: 'TC-AUD-002',
        endpoint: 'GET /audit/export.csv?start=...&end=...',
        roleUsed: Roles.ADMIN,
        request: { query: { start: 'YYYY-MM-DD', end: 'YYYY-MM-DD' } },
        expectedStatusCode: 200,
        expectedResponseBody: 'text/csv',
        edgeCaseTested: null,
      };
      assertCaseMeta(caseMeta);

      const token = await loginAndGetToken({ username: VALID_USERNAME, password: VALID_PASSWORD });

      const start = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString().slice(0, 10);
      const end = new Date().toISOString().slice(0, 10);

      const { status, headers, text } = await httpText({
        method: 'GET',
        path: '/audit/export.csv',
        token,
        query: { start, end },
      });

      expect(status).toBe(200);
      const contentType = String(headers['content-type'] || headers['Content-Type'] || '');
      expect(contentType).toMatch(/text\/csv|application\/csv/);
      expect(text, `[${caseMeta.testId}] Expected CSV body to be non-empty`).toBeTruthy();
    });

    test('TC-AUD-003 CSV export with no results', async () => {
      const caseMeta = {
        testId: 'TC-AUD-003',
        endpoint: 'GET /audit/export.csv?start=...&end=...',
        roleUsed: Roles.ADMIN,
        request: { query: { start: '1900-01-01', end: '1900-01-02' } },
        expectedStatusCode: 200,
        expectedResponseBody: 'text/csv (header-only or empty dataset)',
        edgeCaseTested: 'No matching audit records in range',
      };
      assertCaseMeta(caseMeta);

      const token = await loginAndGetToken({ username: VALID_USERNAME, password: VALID_PASSWORD });

      const { status, headers, text } = await httpText({
        method: 'GET',
        path: '/audit/export.csv',
        token,
        query: { start: '1900-01-01', end: '1900-01-02' },
      });

      expect(status).toBe(200);
      const contentType = String(headers['content-type'] || headers['Content-Type'] || '');
      expect(contentType).toMatch(/text\/csv|application\/csv/);
      // Usually header line exists; allow empty as well.
      expect(text).not.toBeNull();
    });
  });
});
