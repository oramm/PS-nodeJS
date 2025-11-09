# 🚀 Quick Start: Automated Testing

## ⚡ 3-Step Setup

### Step 1: Install Dependencies

```bash
yarn add --dev jest @types/jest ts-jest @jest/globals
```

### Step 2: Add Scripts to package.json

Add these lines to the `"scripts"` section:

```json
"test": "jest",
"test:watch": "jest --watch",
"test:coverage": "jest --coverage",
"test:offers": "jest src/offers"
```

### Step 3: Run Tests

```bash
yarn test
```

## 📊 What You Get

### ✅ Created Files:

```
├── jest.config.js                          # Jest configuration
├── tsconfig.test.json                       # TypeScript config for tests
├── TESTING.md                               # Full documentation
├── setup-tests.ps1                          # Automated setup script
└── src/
    ├── __tests__/
    │   └── setup.ts                         # Global test setup
    └── offers/
        └── __tests__/
            ├── OffersController.test.ts     # 6 tests (orchestration)
            ├── OurOffer.test.ts             # 6 tests (business logic)
            └── OffersController.integration.test.ts  # Integration tests (skipped)
```

### ✅ Test Coverage:

**OffersController.test.ts** - Orchestration Logic

-   ✅ sendOurOffer() - complete flow
-   ✅ Method call order verification
-   ✅ Error propagation
-   ✅ Dispatcher pattern (delete)

**OurOffer.test.ts** - Business Logic

-   ✅ createSentEvent() - event creation
-   ✅ markAsSent() - status update
-   ✅ Integration between methods

## 🎯 Usage Examples

### Run all tests

```bash
yarn test
```

### Watch mode (auto-rerun on save)

```bash
yarn test:watch
```

### Coverage report

```bash
yarn test:coverage
```

### Run specific test file

```bash
yarn test OurOffer
```

### Run specific test

```bash
yarn test -- -t "should create OfferEvent"
```

## 📈 Expected Output

```
PASS  src/offers/__tests__/OffersController.test.ts
  OffersController
    sendOurOffer
      ✓ should orchestrate sending OurOffer (5ms)
      ✓ should call methods in correct order (3ms)
      ✓ should propagate errors (2ms)
    delete (dispatcher)
      ✓ should call deleteOurOffer (1ms)
      ✓ should call deleteExternalOffer (1ms)
      ✓ should throw error (1ms)

PASS  src/offers/__tests__/OurOffer.test.ts
  OurOffer - Business Logic
    createSentEvent
      ✓ should create OfferEvent (2ms)
      ✓ should preserve properties (1ms)
      ✓ should use offer.id (1ms)
    markAsSent
      ✓ should update status (1ms)
      ✓ should replace lastEvent (1ms)
      ✓ should be idempotent (1ms)

Tests:       12 passed, 12 total
Time:        2.5s
```

## 🔧 Next Steps

1. **Fix TypeScript errors** in test files (already handled by @types/jest)
2. **Run tests** to verify everything works
3. **Add more tests** for other methods (edit, delete, addNew)
4. **Watch coverage grow** - aim for 80%+

## 💡 Key Benefits

✅ **Instant feedback** - know immediately if refactoring breaks something  
✅ **Regression prevention** - catch bugs before they reach production  
✅ **Documentation** - tests show how code should be used  
✅ **Confidence** - refactor fearlessly with safety net  
✅ **Fast** - all tests run in < 5 seconds

## 📚 Learn More

See [TESTING.md](./TESTING.md) for:

-   Detailed test examples
-   Testing patterns
-   Integration tests
-   Coverage goals
-   Best practices

## ❓ Troubleshooting

**Error: Cannot find module 'jest'**

```bash
yarn add --dev jest @types/jest ts-jest
```

**Error: Cannot find name 'describe'**

```bash
yarn add --dev @types/jest @jest/globals
```

**Tests not found**

```bash
# Check test file naming: *.test.ts or *.spec.ts
# Check jest.config.js testMatch pattern
```

**TypeScript errors in tests**

```bash
# Check tsconfig.test.json includes "jest" in types
# Check jest.config.js preset is 'ts-jest'
```
