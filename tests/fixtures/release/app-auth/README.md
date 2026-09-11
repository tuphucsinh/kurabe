P102M3T13 authentic local Supabase fixture lane

This directory contains non-secret fixture metadata for the authentic local Supabase lane. Mika owns the disposable local Supabase stack and supplies the runtime environment variables:

- KURABE_LOCAL_STACK_OWNED=1: confirms the stack is the task-owned disposable local stack.
- KURABE_SUPABASE_URL: loopback URL for the real Kong API (e.g. http://127.0.0.1:55443).
- KURABE_SUPABASE_ANON_KEY / KURABE_SUPABASE_SERVICE_ROLE_KEY: local synthetic API keys.
- KURABE_DB_HOST / KURABE_DB_PORT / KURABE_DB_NAME / KURABE_DB_USER / KURABE_DB_PASSWORD: local disposable DB connection only.
- KURABE_SUPABASE_STACK_NAME / KURABE_SUPABASE_NETWORK_ID: ownership metadata.

The lane drives the real local Supabase stack through Kong, PostgREST, and PostgreSQL without custom in-process REST adapters or synthetic authenticated shortcuts. Local DB queries are used strictly for synthetic fixture seed, readback verification, identity queries, and idempotent targeted cleanup. Unrelated data and containers are never modified or stopped.

Public module API

- tests/browser/app-auth-harness.mjs: createAppAuthFixture(), startNextApplication(), createBrowserSession(), requestJson().
- tests/integration/app-auth-bootstrap.mjs: real local Supabase DB identity, PostgREST seed readback, invalid API key rejection, and opaque session storage boundary.
- tests/browser/app-auth-bootstrap.mjs: exact source identity, private production build, actual Chrome login, rendered DB-backed data trace, authenticated role-denial boundary, broken auth/read probe, and idempotent cleanup.

All credentials, tokens, and sensitive connection parameters are strictly redacted as [REDACTED].