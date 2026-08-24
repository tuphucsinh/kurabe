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

## Development

### Verification

To verify the codebase locally or in CI, run the standard suite of verification commands:

```bash
# 1. Install exact dependencies
npm ci

# 2. Code style & static linting
npm run lint

# 3. Static type-checking (clean incremental state)
npm run typecheck

# 4. Automated unit and regression test suite
npm test

# 5. Production build
npm run build
```

- **Test Runner (`npm test`)**: Invokes `scripts/run-tests.mjs` to automatically discover and run all `*.test.mjs` and `*.test.ts` test files under `tests/` in isolated child processes.
- **Excluded Test Artifacts**: Default test discovery explicitly excludes performance benchmarks and reporting artifacts (`tests/perf/**`, `benchmark-harness.mjs`, `perf-report.json`) to keep regular verification fast and deterministic.
- **Lint Status**: `npm run lint` enforces ESLint rules (0 errors required). If any non-blocking warning occurs, it must not conceal real errors or test failures.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
