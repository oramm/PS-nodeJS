# 🧪 Automated Testing Framework for Offers Module

## 📋 Setup Instructions

### 1. Install Dependencies

```bash
yarn add --dev jest @types/jest ts-jest @jest/globals
```

### 2. Update package.json

Add test scripts to `package.json`:

```json
{
    "scripts": {
        "test": "jest",
        "test:watch": "jest --watch",
        "test:coverage": "jest --coverage",
        "test:offers": "jest src/offers"
    }
}
```

Or use the automated setup script:

```bash
.\setup-tests.ps1
```

### 3. Run Tests

```bash
# Run all tests
yarn test

# Run tests in watch mode (auto-rerun on file changes)
yarn test:watch

# Run tests with coverage report
yarn test:coverage

# Run only Offers module tests
yarn test:offers
```

## 📁 Test Structure

```
src/
├── offers/
│   ├── __tests__/
│   │   ├── OffersController.test.ts    # Controller orchestration tests
│   │   └── OurOffer.test.ts            # Business logic tests
│   ├── OffersController.ts
│   └── OurOffer.ts
└── __tests__/
    └── setup.ts                        # Global test setup
```

## ✅ Test Coverage

### OffersController.test.ts

Tests for **orchestration logic**:

-   ✅ `sendOurOffer()` - Complete flow with all dependencies
-   ✅ Method call order verification
-   ✅ Error propagation
-   ✅ Dispatcher pattern (delete, edit, addNew)

### OurOffer.test.ts

Tests for **business logic**:

-   ✅ `createSentEvent()` - Event creation with all properties
-   ✅ `markAsSent()` - Status update
-   ✅ Integration between methods

## 🎯 Test Philosophy

### Unit Tests (what we have now)

-   **Fast** - no database, no external APIs
-   **Isolated** - mock all dependencies
-   **Focused** - one function at a time
-   **Pure functions** preferred (createSentEvent, markAsSent)

### What to Mock

```typescript
// ✅ Always mock:
- Database (OfferRepository)
- External APIs (Google Drive, Email)
- Other Controllers (PersonsController, OfferEventsController)
- File system operations

// ❌ Don't mock:
- Business logic methods (createSentEvent, markAsSent)
- Pure functions
- Simple data transformations
```

## 📊 Example Test Output

```bash
PASS  src/offers/__tests__/OffersController.test.ts
  OffersController
    sendOurOffer
      ✓ should orchestrate sending OurOffer with correct flow (5ms)
      ✓ should call methods in correct order (3ms)
      ✓ should propagate errors from dependencies (2ms)
    delete (dispatcher)
      ✓ should call deleteOurOffer for OurOffer instance (1ms)
      ✓ should call deleteExternalOffer for ExternalOffer instance (1ms)
      ✓ should throw error for unknown offer type (1ms)

PASS  src/offers/__tests__/OurOffer.test.ts
  OurOffer - Business Logic
    createSentEvent
      ✓ should create OfferEvent with SENT type (2ms)
      ✓ should preserve all properties from newEventData (1ms)
      ✓ should use offer.id for offerId (1ms)
    markAsSent
      ✓ should update _lastEvent and status to DONE (1ms)
      ✓ should replace previous _lastEvent (1ms)
      ✓ should be idempotent (1ms)

Test Suites: 2 passed, 2 total
Tests:       12 passed, 12 total
Coverage:    85% (statements), 80% (branches), 90% (functions)
```

## 🔧 Advanced Testing Patterns

### 1. Testing Async Operations

```typescript
it('should handle async operations', async () => {
    // Use async/await
    await OffersController.sendOurOffer(...);
    expect(...).toHaveBeenCalled();
});
```

### 2. Testing Error Handling

```typescript
it('should handle errors', async () => {
    mockRepository.find.mockRejectedValue(new Error('DB error'));

    await expect(OffersController.getOffersList()).rejects.toThrow('DB error');
});
```

### 3. Testing Method Call Order

```typescript
it('should call methods in order', async () => {
    const callOrder: string[] = [];

    mock1.mockImplementation(() => callOrder.push('first'));
    mock2.mockImplementation(() => callOrder.push('second'));

    await testedFunction();

    expect(callOrder).toEqual(['first', 'second']);
});
```

### 4. Spy on Private Methods

```typescript
jest.spyOn(OffersController as any, 'privateMethod').mockResolvedValue(
    mockValue
);
```

## 📈 Coverage Goals

| Type       | Target | Current |
| ---------- | ------ | ------- |
| Statements | 80%    | -       |
| Branches   | 75%    | -       |
| Functions  | 90%    | -       |
| Lines      | 80%    | -       |

## 🚀 Next Steps

1. **Fix TypeScript errors** in test files (install @types/jest)
    ```bash
    yarn add --dev @types/jest @jest/globals
    ```
2. **Run tests** and verify they pass
    ```bash
    yarn test
    ```
3. **Add more test cases** for:
    - `addNew()` orchestration
    - `edit()` orchestration
    - `delete()` orchestration
    - Edge cases (null values, empty arrays, etc.)
4. **Integration tests** (with real database - separate suite)
5. **E2E tests** (with real API calls - separate suite)

## 📚 Resources

-   [Jest Documentation](https://jestjs.io/docs/getting-started)
-   [Testing Best Practices](https://testingjavascript.com/)
-   [TypeScript + Jest](https://kulshekhar.github.io/ts-jest/)

## 💡 Tips

-   **Write tests BEFORE refactoring** - ensures no functionality loss
-   **Keep tests simple** - one assertion per test when possible
-   **Use descriptive names** - test name should explain what's being tested
-   **Don't test implementation details** - test behavior, not internals
-   **Mock external dependencies** - tests should be fast and isolated
