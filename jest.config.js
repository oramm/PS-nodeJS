module.exports = {
    preset: 'ts-jest',
    testEnvironment: 'node',
    maxWorkers: 2,
    roots: ['<rootDir>/src'],
    testMatch: ['**/__tests__/**/*.test.ts'],
    collectCoverageFrom: [
        'src/**/*.ts',
        '!src/**/*.d.ts',
        '!src/**/__tests__/**',
        '!src/index.ts',
    ],
    coverageDirectory: 'coverage',
    coverageReporters: ['text', 'lcov', 'html'],
    moduleNameMapper: {
        '^@/(.*)$': '<rootDir>/src/$1',
    },
    // Konfiguracja ts-jest musi siedziec w `transform`, a nie w `globals` (ts-jest 29
    // wypisuje inaczej ostrzezenie o przestarzalym ustawieniu przy kazdym uruchomieniu).
    // `isolatedModules` wylacza sprawdzanie typow w testach: pelne sprawdzenie typow calego
    // grafu zaleznosci (glownie `googleapis`) nie miesci sie w domyslnym limicie sterty Node
    // i zimny przebieg konczyl sie `JavaScript heap out of memory`. Typy pilnuje `yarn build`.
    transform: {
        '^.+\\.tsx?$': [
            'ts-jest',
            {
                tsconfig: {
                    esModuleInterop: true,
                    allowSyntheticDefaultImports: true,
                    isolatedModules: true,
                },
            },
        ],
    },
    setupFilesAfterEnv: ['<rootDir>/src/__tests__/setup.ts'],
    clearMocks: true,
    restoreMocks: true,
};
