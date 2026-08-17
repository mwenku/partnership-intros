import { apiKeyFingerprint, errorFields } from '../../../../src/utils/errorLogs'

describe('errorLogs unit tests', () => {
    describe('apiKeyFingerprint error handling', () => {
        it('should return present false if the api key is missing', () => {
            expect(apiKeyFingerprint(undefined)).toEqual({
                present: false,
                length: 0,
            })
        })

        it('should return present false if the api key is empty', () => {
            expect(apiKeyFingerprint('')).toEqual({
                present: false,
                length: 0,
            })
        })
    })

    describe('apiKeyFingerprint success', () => {
        it('should return prefix and suffix for a present api key', () => {
            expect(apiKeyFingerprint('test-key')).toEqual({
                present: true,
                length: 8,
                prefix: 'test-k',
                suffix: '-key',
            })
        })

        it('should return the full key as prefix and suffix when it is shorter than six characters', () => {
            expect(apiKeyFingerprint('ab')).toEqual({
                present: true,
                length: 2,
                prefix: 'ab',
                suffix: 'ab',
            })
        })
    })

    describe('errorFields error handling', () => {
        it('should return the raw value if the error is a string', () => {
            expect(errorFields('Tavily unavailable')).toEqual({
                error: 'Tavily unavailable',
            })
        })

        it('should return the raw value if the error is a plain object', () => {
            expect(errorFields({ statusCode: 500 })).toEqual({
                error: { statusCode: 500 },
            })
        })
    })

    describe('errorFields success', () => {
        it('should return name and message for a plain Error', () => {
            expect(errorFields(new Error('Tavily unavailable'))).toEqual({
                name: 'Error',
                message: 'Tavily unavailable',
            })
        })

        it('should return the custom error name when present', () => {
            const error = new Error('Tavily unavailable')
            error.name = 'TavilyError'

            expect(errorFields(error)).toEqual({
                name: 'TavilyError',
                message: 'Tavily unavailable',
            })
        })
    })
})
