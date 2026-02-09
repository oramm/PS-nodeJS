# Testing Runbook

## Scope

Canonical testing guide for this repository.

## Tooling

- Jest
- ts-jest
- @types/jest

## Commands

- `yarn test`
- `yarn test:watch`
- `yarn test:coverage`
- `yarn test:offers`

## Baseline setup

1. Install dependencies:
   `yarn add --dev jest @types/jest ts-jest @jest/globals`
2. Ensure configs exist:
   - `jest.config.js`
   - `tsconfig.test.json`
   - `src/__tests__/setup.ts`
3. Run `yarn test`.

## Test strategy

1. Unit tests:
   - Mock DB, external APIs, and controller dependencies.
   - Keep business logic tests isolated.
2. Integration tests:
   - Use separate suite and controlled DB lifecycle.
   - Skip by default if test DB is not available.

## Existing focus areas

- `src/offers/__tests__/OffersController.test.ts`: orchestration behavior
- `src/offers/__tests__/OurOffer.test.ts`: business logic behavior
- `src/offers/__tests__/OffersController.integration.test.ts`: integration template

## Troubleshooting

- Missing Jest modules: reinstall test dependencies.
- Missing global test types: verify `@types/jest` and test tsconfig `types`.
- No tests found: check naming (`*.test.ts`, `*.spec.ts`) and jest `testMatch`.

## Coverage expectations

- Controller orchestration: strong branch coverage on error paths and dispatch.
- Model/business logic: higher function coverage than controllers.
- New features must include tests proportional to risk.
