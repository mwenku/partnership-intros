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

const mockGetTavily = jest.fn()
const mockCreate = jest.fn()
const mockGetWebsetWithItems = jest.fn()
const mockEnrichmentCreate = jest.fn()
jest.mock('../../../../src/clients/tavily', () => ({
    getTavily: (): unknown => mockGetTavily(),
    getWebsetWithItems: (...args: unknown[]): unknown => mockGetWebsetWithItems(...args),
}))

import { getOutreachStatus } from '../../../../src/handlers/getOutreachStatus'
import { startOutreach } from '../../../../src/handlers/startOutreach'
import {
    briefFromMetadata,
    buildSearchQuery,
    emailEnrichmentDescription,
    researchEnrichments,
    websetMetadata,
} from '../../../../src/utils/webset'
import { OutreachRequestType, VendorBriefType } from '../../../../src/zod-schemas'

function givenVendorBrief(overrides: Partial<VendorBriefType> = {}): VendorBriefType {
    return {
        vendorName: 'Harborline',
        website: 'https://harborline.ai',
        offer: 'Private AI runtime',
        objective: 'Recruit UK implementation partners',
        idealPartner: 'UK consultancies',
        targetCustomers: 'Regulated UK companies',
        partnerContributes: 'Introductions and delivery',
        partnerGains: 'Implementation revenue',
        constraints: 'United Kingdom',
        ...overrides,
    }
}

function givenOutreachRequest(): OutreachRequestType {
    return {
        search: 'Find partnership leaders at UK consultancies',
        brief: givenVendorBrief(),
    }
}

function givenTavilyClient(): void {
    mockGetTavily.mockReturnValue({
        websets: {
            create: mockCreate,
            enrichments: {
                create: mockEnrichmentCreate,
            },
        },
    })
}

function givenCreatedWebset(overrides: Record<string, unknown> = {}): void {
    mockCreate.mockResolvedValueOnce({
        id: 'webset_123',
        dashboardUrl: '',
        ...overrides,
    })
}

function givenRunningWebset(): void {
    mockGetWebsetWithItems.mockResolvedValueOnce({
        id: 'webset_123',
        status: 'running',
        dashboardUrl: '',
        metadata: { vendorName: 'Wrong Vendor' },
        searches: [{ progress: { found: 0, completion: 10 } }],
        enrichments: [],
        items: { data: [] },
    })
}

function givenIdleWebsetWithoutEmailEnrichments(): void {
    mockGetWebsetWithItems.mockResolvedValueOnce({
        id: 'webset_123',
        status: 'idle',
        dashboardUrl: '',
        metadata: { vendorName: 'Wrong Vendor' },
        searches: [{ progress: { found: 1, completion: 100 } }],
        enrichments: [{ id: 'enr_employer', metadata: { key: 'employer' }, description: '[employer] name' }],
        items: { data: [] },
    })
}

function givenIdleWebsetWithEmailV1(): void {
    mockGetWebsetWithItems.mockResolvedValueOnce({
        id: 'webset_123',
        status: 'idle',
        dashboardUrl: '',
        metadata: websetMetadata('Find partnership leaders at UK consultancies', givenVendorBrief()),
        searches: [{ progress: { found: 1, completion: 100 } }],
        enrichments: [
            { id: 'enr_employer', metadata: { key: 'employer' }, description: '[employer] name' },
            { id: 'enr_v1', metadata: { key: 'emailsV1' }, description: '[emailsV1] draft', status: 'completed' },
        ],
        items: { data: [] },
    })
}

function givenIdleWebsetWithBothEmailEnrichments(): void {
    mockGetWebsetWithItems.mockResolvedValueOnce({
        id: 'webset_123',
        status: 'idle',
        dashboardUrl: '',
        metadata: { vendorName: 'Harborline' },
        searches: [{ progress: { found: 1, completion: 100 } }],
        enrichments: [
            { id: 'enr_v1', metadata: { key: 'emailsV1' }, description: '[emailsV1] draft', status: 'completed' },
            { id: 'enr_v2', metadata: { key: 'emailsV2' }, description: '[emailsV2] rewrite', status: 'completed' },
        ],
        items: {
            data: [
                {
                    id: 'item_1',
                    properties: {
                        url: 'https://example.com/jane',
                        person: {
                            name: 'Jane Partner',
                            position: 'Head of Partnerships',
                            location: 'London, UK',
                            pictureUrl: 'https://example.com/jane.png',
                        },
                    },
                    evaluations: [],
                    enrichments: [],
                },
            ],
        },
    })
}

function givenCreatePayload(request: OutreachRequestType): Record<string, unknown> {
    return {
        search: {
            query: buildSearchQuery(request.search, request.brief),
            count: 5,
            entity: { type: 'person' },
            maxPeoplePerCompany: 1,
            criteria: [
                {
                    description: `Currently works at a consultancy or professional services firm matching: ${request.brief.idealPartner}. Geography or other constraints: ${request.brief.constraints}.`,
                },
                {
                    description:
                        "Person's current role includes partnerships, alliances, business development, or equivalent partner-leadership responsibility.",
                },
                {
                    description: `Their firm implements or advises on work relevant to this partnership context: ${request.brief.offer}. Partnership objective: ${request.brief.objective}.`,
                },
            ],
        },
        enrichments: researchEnrichments(request.brief),
        metadata: websetMetadata(request.search, request.brief),
    }
}

describe('tavily outreach integration tests', () => {
    beforeEach(() => {
        jest.resetAllMocks()
        process.env.TAVILY_API_KEY = 'test-key'
        givenTavilyClient()
    })

    describe('startOutreach error handling', () => {
        it('should return 500 if Tavily client cannot be created', async () => {
            mockGetTavily.mockImplementationOnce(() => {
                throw new Error('TAVILY_API_KEY is missing')
            })

            const actual = await startOutreach(givenOutreachRequest())

            expect(JSON.parse(actual.body).message).toEqual('Internal error')
            expect(actual.statusCode).toBe(500)
            expect(mockCreate).not.toHaveBeenCalled()
        })

        it('should return 500 if Webset create fails', async () => {
            mockCreate.mockRejectedValueOnce(new Error('Tavily unavailable'))

            const actual = await startOutreach(givenOutreachRequest())

            expect(JSON.parse(actual.body).message).toEqual('Internal error')
            expect(actual.statusCode).toBe(500)
            expect(mockGetTavily).toHaveBeenCalledTimes(1)
            expect(mockCreate).toHaveBeenCalledTimes(1)
        })

        it('should return 500 if Tavily throws a non-Error value', async () => {
            mockCreate.mockRejectedValueOnce('Tavily unavailable')

            const actual = await startOutreach(givenOutreachRequest())

            expect(JSON.parse(actual.body).message).toEqual('Internal error')
            expect(actual.statusCode).toBe(500)
        })
    })

    describe('startOutreach success', () => {
        it('should create a person Webset with research enrichments and return the webset id', async () => {
            const request = givenOutreachRequest()
            givenCreatedWebset()

            const actual = await startOutreach(request)
            const body = JSON.parse(actual.body)

            expect(actual.statusCode).toBe(200)
            expect(body.message).toEqual('Ok')
            expect(body.data).toEqual({
                websetId: 'webset_123',
                dashboardUrl: '',
            })
            expect(mockGetTavily).toHaveBeenCalledTimes(1)
            expect(mockCreate).toHaveBeenCalledTimes(1)
            expect(mockCreate.mock.calls[0][0]).toEqual(givenCreatePayload(request))
        })

        it('should return an empty dashboard url when dashboardUrl is missing', async () => {
            givenCreatedWebset({
                dashboardUrl: undefined,
            })

            const actual = await startOutreach(givenOutreachRequest())
            const body = JSON.parse(actual.body)

            expect(actual.statusCode).toBe(200)
            expect(body.data).toEqual({
                websetId: 'webset_123',
                dashboardUrl: '',
            })
        })
    })

    describe('getOutreachStatus error handling', () => {
        it('should return 500 if reading the Webset fails', async () => {
            mockGetWebsetWithItems.mockRejectedValueOnce(new Error('Webset not found'))

            const actual = await getOutreachStatus('webset_123')

            expect(JSON.parse(actual.body).message).toEqual('Internal error')
            expect(actual.statusCode).toBe(500)
            expect(mockGetWebsetWithItems).toHaveBeenCalledTimes(1)
            expect(mockEnrichmentCreate).not.toHaveBeenCalled()
        })

        it('should return 500 if adding an email enrichment fails', async () => {
            givenIdleWebsetWithoutEmailEnrichments()
            mockEnrichmentCreate.mockRejectedValueOnce(new Error('Enrichment unavailable'))

            const actual = await getOutreachStatus('webset_123')

            expect(JSON.parse(actual.body).message).toEqual('Internal error')
            expect(actual.statusCode).toBe(500)
            expect(mockEnrichmentCreate).toHaveBeenCalledTimes(1)
        })
    })

    describe('getOutreachStatus success', () => {
        it('should return discovering while the Webset is still searching', async () => {
            givenRunningWebset()

            const actual = await getOutreachStatus('webset_123')
            const body = JSON.parse(actual.body)

            expect(actual.statusCode).toBe(200)
            expect(body.message).toEqual('Ok')
            expect(body.data).toEqual({
                websetId: 'webset_123',
                dashboardUrl: '',
                status: 'running',
                phase: 'discovering',
                itemCount: 0,
                error: '',
                prospects: [],
            })
            expect(mockGetWebsetWithItems).toHaveBeenCalledTimes(1)
            expect(mockEnrichmentCreate).not.toHaveBeenCalled()
        })

        it('should return running without adding enrichments if the Webset is not idle', async () => {
            mockGetWebsetWithItems.mockResolvedValueOnce({
                id: 'webset_123',
                status: 'paused',
                dashboardUrl: '',
                metadata: {},
                searches: [{ progress: { found: 1, completion: 100 } }],
                enrichments: [],
                items: { data: [] },
            })

            const actual = await getOutreachStatus('webset_123')
            const body = JSON.parse(actual.body)

            expect(actual.statusCode).toBe(200)
            expect(body.data.status).toEqual('running')
            expect(body.data.phase).toEqual('researching')
            expect(mockEnrichmentCreate).not.toHaveBeenCalled()
        })

        it('should add emailsV2 after emailsV1 is present', async () => {
            givenIdleWebsetWithEmailV1()
            mockEnrichmentCreate.mockResolvedValueOnce({ id: 'enr_v2' })

            const actual = await getOutreachStatus('webset_v2')
            const body = JSON.parse(actual.body)

            expect(actual.statusCode).toBe(200)
            expect(body.data.status).toEqual('running')
            expect(body.data.phase).toEqual('writing-v2')
            expect(mockEnrichmentCreate).toHaveBeenCalledTimes(1)
            expect(mockEnrichmentCreate.mock.calls[0][0]).toEqual('webset_v2')
            expect(mockEnrichmentCreate.mock.calls[0][1]).toEqual({
                description: emailEnrichmentDescription(givenVendorBrief(), 2),
                format: 'text',
                metadata: { key: 'emailsV2' },
            })
        })

        it('should return done with mapped prospects when both email enrichments exist', async () => {
            givenIdleWebsetWithBothEmailEnrichments()

            const actual = await getOutreachStatus('webset_123')
            const body = JSON.parse(actual.body)

            expect(actual.statusCode).toBe(200)
            expect(body.data.websetId).toEqual('webset_123')
            expect(body.data.dashboardUrl).toEqual('')
            expect(body.data.status).toEqual('done')
            expect(body.data.phase).toEqual('done')
            expect(body.data.itemCount).toBe(1)
            expect(body.data.error).toEqual('')
            expect(body.data.prospects).toEqual([
                {
                    id: 'item_1',
                    name: 'Jane Partner',
                    position: 'Head of Partnerships',
                    location: 'London, UK',
                    profileUrl: 'https://example.com/jane',
                    pictureUrl: 'https://example.com/jane.png',
                    companyName: '',
                    companyWebsite: '',
                    email: '',
                    companyFit: '',
                    personFit: '',
                    evaluations: [],
                    signals: [],
                    selectedSignal: '',
                    selectedSignalWhy: '',
                    sources: [],
                    emailsV1: ['', '', '', ''],
                    emailsV2: ['', '', '', ''],
                    emailJudgement: expect.objectContaining({
                        overallVerdict: 'revise',
                    }),
                },
            ])
            expect(mockEnrichmentCreate).not.toHaveBeenCalled()
        })
    })

    describe('start then poll', () => {
        it('should add emailsV1 using the stored vendor brief from startOutreach', async () => {
            const request = givenOutreachRequest()
            givenCreatedWebset()
            await startOutreach(request)

            givenIdleWebsetWithoutEmailEnrichments()
            mockEnrichmentCreate.mockResolvedValueOnce({ id: 'enr_v1' })

            const actual = await getOutreachStatus('webset_123')
            const body = JSON.parse(actual.body)

            expect(actual.statusCode).toBe(200)
            expect(body.data.status).toEqual('running')
            expect(body.data.phase).toEqual('writing-v1')
            expect(mockInfo).toHaveBeenCalledWith('using stored vendor brief', { websetId: 'webset_123' })
            expect(mockEnrichmentCreate).toHaveBeenCalledTimes(1)
            expect(mockEnrichmentCreate.mock.calls[0][0]).toEqual('webset_123')
            expect(mockEnrichmentCreate.mock.calls[0][1]).toEqual({
                description: emailEnrichmentDescription(request.brief, 1),
                format: 'text',
                metadata: { key: 'emailsV1' },
            })
        })

        it('should add emailsV1 using webset metadata if no brief is stored', async () => {
            givenIdleWebsetWithoutEmailEnrichments()
            mockEnrichmentCreate.mockResolvedValueOnce({ id: 'enr_v1' })

            const actual = await getOutreachStatus('webset_metadata')
            const body = JSON.parse(actual.body)

            expect(actual.statusCode).toBe(200)
            expect(body.data.phase).toEqual('writing-v1')
            expect(mockInfo).toHaveBeenCalledWith('using webset metadata for vendor brief', {
                websetId: 'webset_metadata',
            })
            expect(mockEnrichmentCreate).toHaveBeenCalledTimes(1)
            expect(mockEnrichmentCreate.mock.calls[0][1]).toEqual({
                description: emailEnrichmentDescription(briefFromMetadata({ vendorName: 'Wrong Vendor' }), 1),
                format: 'text',
                metadata: { key: 'emailsV1' },
            })
        })

        it('should not add emailsV1 twice when two polls overlap', async () => {
            givenIdleWebsetWithoutEmailEnrichments()
            givenIdleWebsetWithoutEmailEnrichments()

            let finishCreate: (value: { id: string }) => void = (): void => undefined
            let createStarted: () => void = (): void => undefined
            const createStartedPromise = new Promise<void>((resolve) => {
                createStarted = resolve
            })
            mockEnrichmentCreate.mockImplementationOnce(() => {
                createStarted()
                return new Promise((resolve) => {
                    finishCreate = resolve
                })
            })

            const first = getOutreachStatus('webset_lock')
            await createStartedPromise
            const second = await getOutreachStatus('webset_lock')
            finishCreate({ id: 'enr_v1' })
            const firstResult = await first

            expect(mockEnrichmentCreate).toHaveBeenCalledTimes(1)
            expect(JSON.parse(second.body).data.phase).toEqual('writing-v1')
            expect(JSON.parse(firstResult.body).data.phase).toEqual('writing-v1')
            expect(JSON.parse(second.body).data.status).toEqual('running')
            expect(JSON.parse(firstResult.body).data.status).toEqual('running')
        })
    })
})
