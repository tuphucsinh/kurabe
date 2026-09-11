#!/usr/bin/env node
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import {
  BASE_SHA,
  FIXTURE_PERIOD_ID,
  createAppAuthFixture,
  createBrowserSession,
  requestJson,
  redactHandle,
} from '../browser/app-auth-harness.mjs';

/**
 * Public integration check for the authentic local Supabase auth lane.
 * It qualifies the real disposable PostgreSQL seed and loopback REST boundary;
 * browser lifecycle and rendered-page checks are owned by the browser module.
 */
export async function run() {
  const cases = [];
  let fixture;
  try {
    fixture = await createAppAuthFixture();
    const seed = fixture.readSeed();
    assert.equal(seed.period.id, FIXTURE_PERIOD_ID);
    assert.equal(seed.period.year, 2099);
    assert.equal(seed.manager.role, 'Manager');
    cases.push('exact-baseline-source-seed-readback');

    // Prove client target is loopback and PostgreSQL server identity is captured without secrets
    assert.equal(fixture.stackHandle.localOnlyValidation.dbLoopback, true);
    assert.equal(fixture.stackHandle.localOnlyValidation.restLoopback, true);
    assert.equal(fixture.stackHandle.serverIdentity.database, fixture.dbTarget.database);
    assert.equal(fixture.stackHandle.serverIdentity.hostBind, fixture.dbTarget.host);
    assert.equal(fixture.stackHandle.serverIdentity.currentUser, fixture.dbTarget.user);
    cases.push('loopback-db-server-identity-verified');

    // Real HTTP request to Supabase PostgREST with service-role key
    const periodResponse = await requestJson(
      `${fixture.restUrl}/rest/v1/evaluation_periods?select=id,year,name,status&id=eq.${FIXTURE_PERIOD_ID}`,
      { headers: fixture.getAuthHeaders('service_role') }
    );
    assert.equal(periodResponse.status, 200);
    assert.equal(periodResponse.body[0].id, FIXTURE_PERIOD_ID);
    assert.equal(periodResponse.body[0].name, 'P102M3T13 Seed Period');
    cases.push('authenticated-rest-read-traced-to-seeded-db');

    // PostgREST rejection on intentionally invalid API key
    const badKey = await requestJson(`${fixture.restUrl}/rest/v1/evaluation_periods?select=id`, {
      headers: { apikey: 'invalid', authorization: 'Bearer invalid' },
    });
    assert.equal(badKey.status, 401);
    cases.push('denied-invalid-api-key');

    // Create opaque session in DB
    const session = createBrowserSession(fixture, 'manager');

    // Direct raw token lookup in REST returns 0 rows (raw token is never persisted)
    const rawLookup = await requestJson(
      `${fixture.restUrl}/rest/v1/sessions?select=user_id,expires_at&token_hash=eq.${session.token}`,
      { headers: fixture.getAuthHeaders('service_role') }
    );
    assert.equal(rawLookup.status, 200);
    assert.equal(rawLookup.body.length, 0);

    // Hashed token lookup returns the exact seeded manager user_id
    const hashedLookup = await requestJson(
      `${fixture.restUrl}/rest/v1/sessions?select=user_id,expires_at&token_hash=eq.${session.tokenHash}`,
      { headers: fixture.getAuthHeaders('service_role') }
    );
    assert.equal(hashedLookup.status, 200);
    assert.equal(hashedLookup.body.length, 1);
    assert.equal(hashedLookup.body[0].user_id, fixture.manager.userId);
    cases.push('opaque-session-storage-boundary');

    return {
      real: true,
      passed: true,
      tier: 'real-DB',
      status: 'EXECUTED',
      authenticated: true,
      authenticatedCases: 3,
      cases,
      target: 'authentic-local-supabase-stack-plus-kong-rest',
      handles: {
        stack: fixture.stackHandle,
        seed: fixture.seedHandle,
        readback: fixture.readbackHandle,
        managerSession: redactHandle(session),
      },
      baseSha: BASE_SHA,
    };
  } finally {
    if (fixture) await fixture.stop();
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const result = await run();
    console.log(`APP_AUTH_BOOTSTRAP_INTEGRATION ${result.status} cases=${result.cases.length} tier=${result.tier}`);
  } catch (error) {
    if (error?.code === 'MISSING_RUNTIME_CAPABILITY') {
      console.error(`APP_AUTH_BOOTSTRAP_INTEGRATION BLOCKED missing-runtime-env: ${error.message}`);
      process.exitCode = 1;
    } else {
      console.error(`APP_AUTH_BOOTSTRAP_INTEGRATION FAIL ${error?.message || error}`);
      process.exitCode = 1;
    }
  }
}
