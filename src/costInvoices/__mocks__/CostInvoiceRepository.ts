// Manual mock for CostInvoiceRepository
// This file is automatically used by Jest when CostInvoiceRepository is imported in tests

const CostInvoiceRepository = jest.fn().mockImplementation(() => {
    return {
        findById: jest.fn(),
        findByKsefNumber: jest.fn(),
        findAll: jest.fn(),
        findExistingKsefNumbers: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        findItemsByInvoiceId: jest.fn(),
        createItem: jest.fn(),
        updateItem: jest.fn(),
        findLastCompletedSync: jest.fn(),
        createSync: jest.fn(),
        updateSync: jest.fn(),
        findSyncById: jest.fn(),
        findAllCategories: jest.fn(),
    };
});

export default CostInvoiceRepository;
