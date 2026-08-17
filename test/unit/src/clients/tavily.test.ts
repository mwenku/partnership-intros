const mockError = jest.fn()
const mockWarn = jest.fn()
const mockInfo = jest.fn()
jest.mock('../../../../src/logger', () => ({
    logger: {
        error: mockError,
        warn: mockWarn,
        info: mockInfo,
    },
}))

const mockTavily = jest.fn()
jest.mock('@tavily/core', () => ({
    tavily: (options: unknown): unknown => mockTavily(options),
}))

import { getTavily, getWebsetWithItems } from '../../../../src/clients/tavily'
import { peopleQueryForCompany } from '../../../../src/utils/peopleFromSearch'

const mockGet = jest.fn()
const mockList = jest.fn()

function givenWebsetClient(): {
    websets: {
        get: typeof mockGet
        items: {
            list: typeof mockList
        }
    }
} {
    return {
        websets: {
            get: mockGet,
            items: {
                list: mockList,
            },
        },
    }
}

function givenWebset(overrides: Record<string, unknown> = {}): Record<string, unknown> {
    return {
        id: 'webset_123',
        status: 'idle',
        dashboardUrl: '',
        enrichments: [],
        searches: [],
        metadata: { vendorName: 'Harborline' },
        ...overrides,
    }
}

function givenListedItems(overrides: Record<string, unknown> = {}): Record<string, unknown> {
    return {
        data: [],
        hasMore: false,
        ...overrides,
    }
}

describe('tavily client unit tests', () => {
    beforeEach(() => {
        jest.resetAllMocks()
        process.env.TAVILY_API_KEY = 'test-key'
        delete process.env.OPENAI_API_KEY
        mockTavily.mockReturnValue({
            search: jest.fn(),
        })
    })

    describe('getTavily error handling', () => {
        it('should throw if TAVILY_API_KEY is missing', () => {
            delete process.env.TAVILY_API_KEY

            let thrown: unknown
            try {
                getTavily()
            } catch (error) {
                thrown = error
            }

            expect((thrown as Error).message).toEqual('TAVILY_API_KEY is missing')
            expect(mockError).toHaveBeenCalledWith('TAVILY_API_KEY is missing')
            expect(mockTavily).not.toHaveBeenCalled()
        })

        it('should throw if TAVILY_API_KEY is empty', () => {
            process.env.TAVILY_API_KEY = ''

            let thrown: unknown
            try {
                getTavily()
            } catch (error) {
                thrown = error
            }

            expect((thrown as Error).message).toEqual('TAVILY_API_KEY is missing')
            expect(mockError).toHaveBeenCalledWith('TAVILY_API_KEY is missing')
            expect(mockTavily).not.toHaveBeenCalled()
        })
    })

    describe('getTavily success', () => {
        it('should return a websets client when TAVILY_API_KEY is present', () => {
            const actual = getTavily()

            expect(mockTavily).toHaveBeenCalledWith({ apiKey: 'test-key' })
            expect(typeof actual.websets.create).toEqual('function')
            expect(typeof actual.websets.get).toEqual('function')
            expect(typeof actual.websets.items.list).toEqual('function')
            expect(typeof actual.websets.enrichments.create).toEqual('function')
        })
    })

    describe('getWebsetWithItems error handling', () => {
        it('should throw if Webset get fails', async () => {
            mockGet.mockRejectedValueOnce(new Error('Webset not found'))
            const client = givenWebsetClient()

            let thrown: unknown
            try {
                await getWebsetWithItems(client, 'webset_123')
            } catch (error) {
                thrown = error
            }

            expect((thrown as Error).message).toEqual('Webset not found')
            expect(mockGet).toHaveBeenCalledTimes(1)
            expect(mockGet).toHaveBeenCalledWith('webset_123')
            expect(mockList).not.toHaveBeenCalled()
        })

        it('should throw if Webset items list fails', async () => {
            mockGet.mockResolvedValueOnce(givenWebset())
            mockList.mockRejectedValueOnce(new Error('Items unavailable'))
            const client = givenWebsetClient()

            let thrown: unknown
            try {
                await getWebsetWithItems(client, 'webset_123')
            } catch (error) {
                thrown = error
            }

            expect((thrown as Error).message).toEqual('Items unavailable')
            expect(mockGet).toHaveBeenCalledTimes(1)
            expect(mockList).toHaveBeenCalledTimes(1)
            expect(mockList).toHaveBeenCalledWith('webset_123', { limit: 10 })
        })
    })

    describe('getWebsetWithItems success', () => {
        it('should return the Webset with listed items', async () => {
            const listed = givenListedItems({
                data: [{ id: 'item_1' }],
            })
            mockGet.mockResolvedValueOnce(givenWebset())
            mockList.mockResolvedValueOnce(listed)
            const client = givenWebsetClient()

            const actual = await getWebsetWithItems(client, 'webset_123')

            expect(actual).toEqual({
                ...givenWebset(),
                dashboardUrl: '',
                items: listed,
            })
            expect(mockGet).toHaveBeenCalledWith('webset_123')
            expect(mockList).toHaveBeenCalledWith('webset_123', { limit: 10 })
        })

        it('should return an empty dashboard url when dashboardUrl is missing', async () => {
            mockGet.mockResolvedValueOnce(
                givenWebset({
                    dashboardUrl: undefined,
                }),
            )
            mockList.mockResolvedValueOnce(givenListedItems())
            const client = givenWebsetClient()

            const actual = await getWebsetWithItems(client, 'webset_123')

            expect(actual.dashboardUrl).toEqual('')
        })
    })

    describe('websets.create people discovery error handling', () => {
        it('should skip companies when no partnership contact is found', async () => {
            const mockSearch = jest.fn()
            mockSearch.mockResolvedValue({
                results: [
                    {
                        title: 'Example Consulting',
                        url: 'https://example-consulting.com',
                        content: 'A UK consultancy.',
                    },
                ],
            })
            mockTavily.mockReturnValue({ search: mockSearch })
            const client = getTavily()

            const created = await client.websets.create({
                search: {
                    query: 'Find partnership leaders',
                    count: 1,
                    maxPeoplePerCompany: 1,
                },
            })
            const items = await client.websets.items.list(created.id)

            expect(items.data).toEqual([])
            expect(mockInfo).toHaveBeenCalledWith('no partnership contact found for company', {
                companyName: 'Example Consulting',
            })
            expect(mockWarn).toHaveBeenCalledWith('people discovery found no partnership contacts')
        })

        it('should skip a company if people search fails and global search finds nobody', async () => {
            const mockSearch = jest.fn()
            mockSearch
                .mockResolvedValueOnce({
                    results: [
                        {
                            title: 'Example Consulting',
                            url: 'https://example-consulting.com',
                            content: 'A UK consultancy.',
                        },
                    ],
                })
                .mockRejectedValueOnce(new Error('people search failed'))
                .mockResolvedValueOnce({ results: [] })
            mockTavily.mockReturnValue({ search: mockSearch })
            const client = getTavily()

            const created = await client.websets.create({
                search: {
                    query: 'Find partnership leaders',
                    count: 1,
                    maxPeoplePerCompany: 1,
                },
            })
            const items = await client.websets.items.list(created.id)

            expect(items.data).toEqual([])
            expect(mockWarn).toHaveBeenCalledWith('people discovery search failed', {
                query: peopleQueryForCompany('Example Consulting'),
                error: 'people search failed',
            })
        })
    })

    describe('websets.create people discovery success', () => {
        it('should attach a partnership contact and work email to the company', async () => {
            const mockSearch = jest.fn()
            mockSearch.mockImplementation(async (query: string) => {
                if (query.startsWith('Public work email')) {
                    return {
                        results: [
                            {
                                title: 'Contact Jane Smith',
                                url: 'https://example-consulting.com/team/jane',
                                content: 'Email Jane Smith at jane.smith@example-consulting.com',
                            },
                        ],
                    }
                }

                if (query.startsWith('Best current employee')) {
                    return {
                        results: [
                            {
                                title: 'Jane Smith - Head of Partnerships - Example Consulting | LinkedIn',
                                url: 'https://www.linkedin.com/in/jane-smith',
                                content: 'Jane Smith is Head of Partnerships at Example Consulting in London.',
                            },
                        ],
                    }
                }

                return {
                    results: [
                        {
                            title: 'Example Consulting',
                            url: 'https://example-consulting.com',
                            content: 'UK consultancy implementing payroll for international hiring.',
                        },
                    ],
                }
            })
            mockTavily.mockReturnValue({ search: mockSearch })
            const client = getTavily()

            const created = await client.websets.create({
                search: {
                    query: 'Find partnership leaders',
                    count: 1,
                    maxPeoplePerCompany: 1,
                    criteria: [{ description: 'UK consultancy' }],
                },
                enrichments: [
                    { description: '[employer] employer', metadata: { key: 'employer' } },
                    { description: '[email] email', format: 'email', metadata: { key: 'email' } },
                    { description: '[personFit] fit', metadata: { key: 'personFit' } },
                ],
            })
            const webset = await client.websets.get(created.id)
            const items = await client.websets.items.list(created.id)
            const emailEnrichment = (webset.enrichments || []).find((enrichment) => enrichment.metadata?.key === 'email')
            const employerEnrichment = (webset.enrichments || []).find(
                (enrichment) => enrichment.metadata?.key === 'employer',
            )
            const personFitEnrichment = (webset.enrichments || []).find(
                (enrichment) => enrichment.metadata?.key === 'personFit',
            )
            const item = items.data[0]

            expect(item.properties.person).toEqual({
                name: 'Jane Smith',
                location: 'London',
                position: 'Head of Partnerships',
                pictureUrl: '',
            })
            expect(item.properties.url).toEqual('https://www.linkedin.com/in/jane-smith')
            expect(item.enrichments.find((enrichment) => enrichment.enrichmentId === emailEnrichment?.id)?.result).toEqual([
                'jane.smith@example-consulting.com',
            ])
            expect(item.enrichments.find((enrichment) => enrichment.enrichmentId === employerEnrichment?.id)?.result).toEqual([
                'Example Consulting',
            ])
            expect(item.enrichments.find((enrichment) => enrichment.enrichmentId === personFitEnrichment?.id)?.result).toEqual([
                'Jane Smith is Head of Partnerships at Example Consulting, so they are a natural owner for a partnership conversation. Source: https://www.linkedin.com/in/jane-smith',
            ])
        })

        it('should keep the person if a public work email cannot be verified', async () => {
            const mockSearch = jest.fn()
            mockSearch.mockImplementation(async (query: string) => {
                if (query.startsWith('Public work email')) {
                    return {
                        results: [
                            {
                                title: 'Contact page',
                                url: 'https://example-consulting.com/contact',
                                content: 'Call the office. info@example-consulting.com',
                            },
                        ],
                    }
                }

                if (query.startsWith('Best current employee')) {
                    return {
                        results: [
                            {
                                title: 'Jane Smith - Head of Partnerships - Example Consulting | LinkedIn',
                                url: 'https://www.linkedin.com/in/jane-smith',
                                content: 'Jane Smith is Head of Partnerships at Example Consulting in London.',
                            },
                        ],
                    }
                }

                return {
                    results: [
                        {
                            title: 'Example Consulting',
                            url: 'https://example-consulting.com',
                            content: 'UK consultancy implementing payroll for international hiring.',
                        },
                    ],
                }
            })
            mockTavily.mockReturnValue({ search: mockSearch })
            const client = getTavily()

            const created = await client.websets.create({
                search: {
                    query: 'Find partnership leaders',
                    count: 1,
                    maxPeoplePerCompany: 1,
                },
                enrichments: [{ description: '[email] email', format: 'email', metadata: { key: 'email' } }],
            })
            const webset = await client.websets.get(created.id)
            const items = await client.websets.items.list(created.id)
            const emailEnrichment = (webset.enrichments || []).find((enrichment) => enrichment.metadata?.key === 'email')
            const item = items.data[0]

            expect(item.properties.person.name).toEqual('Jane Smith')
            expect(item.enrichments.find((enrichment) => enrichment.enrichmentId === emailEnrichment?.id)?.result).toEqual(
                [],
            )
            expect(mockInfo).toHaveBeenCalledWith('work email not found', {
                name: 'Jane Smith',
                companyName: 'Example Consulting',
            })
        })
    })
})
