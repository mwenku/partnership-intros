import type { Config } from 'jest'

const config: Config = {
    coveragePathIgnorePatterns: ['/node_modules/'],
    roots: ['<rootDir>/test'],
    testEnvironment: 'node',
    testMatch: ['**/*.test.ts'],
    transform: {
        '^.+\\.tsx?$': ['ts-jest', { isolatedModules: true }],
    },
    moduleNameMapper: {
        '^@/(.*)$': '<rootDir>/$1',
    },
}

export default config
