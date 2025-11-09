// Manual mock for OfferRepository
// This file is automatically used by Jest when OfferRepository is imported in tests

const mockRepository = {
    getFromDbList: jest.fn(),
    addInDb: jest.fn(),
    editInDb: jest.fn(),
    deleteFromDb: jest.fn(),
};

export default {
    getInstance: jest.fn(() => mockRepository),
};
