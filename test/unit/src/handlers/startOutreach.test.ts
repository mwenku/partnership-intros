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

const mockCreate = jest.fn()
const mockCreateFromSavedRun = jest.fn()
const mockCreateFromProspects = jest.fn()
const mockGetTavily = jest.fn()
jest.mock('../../../../src/clients/tavily', () => ({
    getTavily: (): unknown => mockGetTavily(),
}))

import { startOutreach } from '../../../../src/handlers/startOutreach'
import {
    EmailImprovementType,
    EmailJudgementType,
    OutreachRequestType,
    ProspectType,
    VendorBriefType,
} from '../../../../src/zod-schemas'
import { websetMetadata } from '../../../../src/utils/webset'

function givenValidVendorBrief(overrides: Partial<VendorBriefType> = {}): VendorBriefType {
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

function givenEmailJudgement(): EmailJudgementType {
    return {
        overallVerdict: 'revise',
        overallSummary: '',
        gaps: [],
        byEmail: [],
    }
}

function givenEmailImprovement(): EmailImprovementType {
    return {
        problemSource: 'writing',
        problemSourceWhy: '',
        weakInFirst: '',
        whatChanged: '',
        howImproved: '',
        fixedGaps: [],
        remainingGaps: [],
    }
}

function givenProspect(overrides: Partial<ProspectType> = {}): ProspectType {
    return {
        id: 'item_1',
        name: 'Jane Partner',
        position: 'Head of Partnerships',
        location: 'London, UK',
        profileUrl: 'https://example.com/jane',
        pictureUrl: '',
        companyName: 'Example Consulting',
        companyWebsite: 'https://example.com',
        email: 'jane@example.com',
        companyFit: 'Fits',
        personFit: 'Fits',
        evaluations: [],
        signals: [],
        selectedSignal: '',
        selectedSignalWhy: '',
        sources: [],
        emailsV1: ['', '', '', ''],
        emailsV2: ['', '', '', ''],
        emailJudgementV1: givenEmailJudgement(),
        emailJudgement: givenEmailJudgement(),
        emailImprovement: givenEmailImprovement(),
        ...overrides,
    }
}

function givenValidOutreachRequest(): OutreachRequestType {
    return {
        search: 'Find partnership leaders at UK consultancies',
        brief: givenValidVendorBrief(),
    }
}

function givenTavilyClient(): void {
    mockGetTavily.mockReturnValue({
        websets: {
            create: mockCreate,
            createFromSavedRun: mockCreateFromSavedRun,
            createFromProspects: mockCreateFromProspects,
        },
    })
}

function givenWebsetCreated(): void {
    mockCreate.mockResolvedValueOnce({
        id: 'webset_123',
        dashboardUrl: '',
    })
}

describe('startOutreach handler unit tests', () => {
    beforeEach(() => {
        jest.resetAllMocks()
        process.env.TAVILY_API_KEY = 'test-key'
        givenTavilyClient()
    })

    describe('error handling', () => {
        it('should return 400 if search is empty', async () => {
            const actual = await startOutreach({
                search: '',
                brief: givenValidVendorBrief(),
            })

            expect(JSON.parse(actual.body).message).toEqual('Validation error')
            expect(actual.statusCode).toBe(400)
        })

        it('should return 400 if vendor name is missing', async () => {
            const actual = await startOutreach({
                search: 'Find partnership leaders at UK consultancies',
                brief: givenValidVendorBrief({ vendorName: '' }),
            })

            expect(JSON.parse(actual.body).message).toEqual('Validation error')
            expect(actual.statusCode).toBe(400)
        })

        it('should return 400 if body is empty', async () => {
            const actual = await startOutreach({})

            expect(JSON.parse(actual.body).message).toEqual('Validation error')
            expect(actual.statusCode).toBe(400)
        })

        it('should return 500 if Tavily client cannot be created', async () => {
            mockGetTavily.mockImplementationOnce(() => {
                throw new Error('TAVILY_API_KEY is missing')
            })

            const actual = await startOutreach(givenValidOutreachRequest())

            expect(JSON.parse(actual.body).message).toEqual('Internal error')
            expect(actual.statusCode).toBe(500)
            expect(mockError).toHaveBeenCalledWith('startOutreach error', expect.any(Error), expect.any(Object))
        })

        it('should return 500 if Webset create fails', async () => {
            mockCreate.mockRejectedValueOnce(new Error('Tavily unavailable'))

            const actual = await startOutreach(givenValidOutreachRequest())

            expect(JSON.parse(actual.body).message).toEqual('Internal error')
            expect(actual.statusCode).toBe(500)
            expect(mockCreate).toHaveBeenCalledTimes(1)
        })

        it('should return 400 if reuseResearch is set and the example run is missing', async () => {
            mockCreateFromSavedRun.mockRejectedValueOnce(new Error('Example run is not saved yet'))

            const actual = await startOutreach({
                ...givenValidOutreachRequest(),
                reuseResearch: true,
            })

            expect(JSON.parse(actual.body).message).toEqual('Example run is not saved yet')
            expect(actual.statusCode).toBe(400)
            expect(mockCreate).toHaveBeenCalledTimes(0)
            expect(mockCreateFromProspects).toHaveBeenCalledTimes(0)
        })
    })

    describe('success', () => {
        it('should create a person Webset and return the webset id', async () => {
            givenWebsetCreated()

            const actual = await startOutreach(givenValidOutreachRequest())
            const body = JSON.parse(actual.body)

            expect(actual.statusCode).toBe(200)
            expect(body.message).toEqual('Ok')
            expect(body.data).toEqual({
                websetId: 'webset_123',
                dashboardUrl: '',
            })
            expect(mockCreate).toHaveBeenCalledTimes(1)
            expect(mockCreate.mock.calls[0][0].search.entity).toEqual({ type: 'person' })
            expect(mockCreate.mock.calls[0][0].search.count).toEqual(5)
            expect(mockCreate.mock.calls[0][0].search.maxPeoplePerCompany).toEqual(1)
            expect(mockCreate.mock.calls[0][0].search.criteria).toHaveLength(3)
            expect(mockCreate.mock.calls[0][0].metadata).toEqual(
                websetMetadata('Find partnership leaders at UK consultancies', givenValidVendorBrief()),
            )
        })

        it('should skip live research when reuseResearch is true', async () => {
            mockCreateFromSavedRun.mockResolvedValueOnce({
                id: 'webset_fixture',
                dashboardUrl: '',
            })

            const actual = await startOutreach({
                ...givenValidOutreachRequest(),
                reuseResearch: true,
            })
            const body = JSON.parse(actual.body)

            expect(actual.statusCode).toBe(200)
            expect(body.data).toEqual({
                websetId: 'webset_fixture',
                dashboardUrl: '',
                reusedResearch: true,
            })
            expect(mockCreate).toHaveBeenCalledTimes(0)
            expect(mockCreateFromSavedRun).toHaveBeenCalledTimes(1)
            expect(mockCreateFromSavedRun.mock.calls[0][0]).toEqual({
                search: 'Find partnership leaders at UK consultancies',
                brief: givenValidVendorBrief(),
            })
            expect(mockCreateFromProspects).toHaveBeenCalledTimes(0)
        })

        it('should seed from current prospects when reuseResearch is true', async () => {
            const prospects = [givenProspect()]
            mockCreateFromProspects.mockResolvedValueOnce({
                id: 'webset_existing',
                dashboardUrl: '',
            })

            const actual = await startOutreach({
                ...givenValidOutreachRequest(),
                reuseResearch: true,
                prospects,
            })
            const body = JSON.parse(actual.body)

            expect(actual.statusCode).toBe(200)
            expect(body.data).toEqual({
                websetId: 'webset_existing',
                dashboardUrl: '',
                reusedResearch: true,
            })
            expect(mockCreate).toHaveBeenCalledTimes(0)
            expect(mockCreateFromSavedRun).toHaveBeenCalledTimes(0)
            expect(mockCreateFromProspects).toHaveBeenCalledTimes(1)
            expect(mockCreateFromProspects.mock.calls[0][0]).toEqual({
                search: 'Find partnership leaders at UK consultancies',
                brief: givenValidVendorBrief(),
                prospects,
                dashboardUrl: '',
            })
        })

        it('should run live research if prospects are sent without reuseResearch', async () => {
            givenWebsetCreated()

            const actual = await startOutreach({
                ...givenValidOutreachRequest(),
                prospects: [givenProspect()],
            })
            const body = JSON.parse(actual.body)

            expect(actual.statusCode).toBe(200)
            expect(body.data).toEqual({
                websetId: 'webset_123',
                dashboardUrl: '',
            })
            expect(mockCreate).toHaveBeenCalledTimes(1)
            expect(mockCreateFromProspects).toHaveBeenCalledTimes(0)
            expect(mockCreateFromSavedRun).toHaveBeenCalledTimes(0)
        })

        it('should use the saved example if reuseResearch is true and prospects are empty', async () => {
            mockCreateFromSavedRun.mockResolvedValueOnce({
                id: 'webset_fixture',
                dashboardUrl: '',
            })

            const actual = await startOutreach({
                ...givenValidOutreachRequest(),
                reuseResearch: true,
                prospects: [],
            })

            expect(actual.statusCode).toBe(200)
            expect(mockCreateFromProspects).toHaveBeenCalledTimes(0)
            expect(mockCreateFromSavedRun).toHaveBeenCalledTimes(1)
            expect(mockCreateFromSavedRun.mock.calls[0][0]).toEqual({
                search: 'Find partnership leaders at UK consultancies',
                brief: givenValidVendorBrief(),
            })
        })

        it('should pass a trimmed emailModel when rewriting from saved research', async () => {
            mockCreateFromSavedRun.mockResolvedValueOnce({
                id: 'webset_fixture',
                dashboardUrl: '',
            })

            const actual = await startOutreach({
                ...givenValidOutreachRequest(),
                reuseResearch: true,
                emailModel: '  gpt-4o-mini  ',
            })

            expect(actual.statusCode).toBe(200)
            expect(mockCreateFromSavedRun.mock.calls[0][0]).toEqual({
                search: 'Find partnership leaders at UK consultancies',
                brief: givenValidVendorBrief(),
                emailModel: 'gpt-4o-mini',
            })
        })

        it('should omit a blank emailModel when rewriting from saved research', async () => {
            mockCreateFromSavedRun.mockResolvedValueOnce({
                id: 'webset_fixture',
                dashboardUrl: '',
            })

            const actual = await startOutreach({
                ...givenValidOutreachRequest(),
                reuseResearch: true,
                emailModel: '   ',
            })

            expect(actual.statusCode).toBe(200)
            expect(mockCreateFromSavedRun.mock.calls[0][0]).toEqual({
                search: 'Find partnership leaders at UK consultancies',
                brief: givenValidVendorBrief(),
            })
        })

        it('should pass a trimmed emailModel when rewriting from current prospects', async () => {
            const prospects = [givenProspect()]
            mockCreateFromProspects.mockResolvedValueOnce({
                id: 'webset_existing',
                dashboardUrl: '',
            })

            const actual = await startOutreach({
                ...givenValidOutreachRequest(),
                reuseResearch: true,
                emailModel: 'gpt-4.1',
                prospects,
            })

            expect(actual.statusCode).toBe(200)
            expect(mockCreateFromProspects.mock.calls[0][0]).toEqual({
                search: 'Find partnership leaders at UK consultancies',
                brief: givenValidVendorBrief(),
                emailModel: 'gpt-4.1',
                prospects,
                dashboardUrl: '',
            })
        })

        it('should include emailModel in live Webset metadata when provided', async () => {
            givenWebsetCreated()

            const actual = await startOutreach({
                ...givenValidOutreachRequest(),
                emailModel: 'gpt-4o-mini',
            })

            expect(actual.statusCode).toBe(200)
            expect(mockCreate.mock.calls[0][0].metadata).toEqual(
                websetMetadata(
                    'Find partnership leaders at UK consultancies',
                    givenValidVendorBrief(),
                    'gpt-4o-mini',
                ),
            )
        })

        it('should omit emailModel from live Webset metadata when it is blank', async () => {
            givenWebsetCreated()

            const actual = await startOutreach({
                ...givenValidOutreachRequest(),
                emailModel: '   ',
            })

            expect(actual.statusCode).toBe(200)
            expect(mockCreate.mock.calls[0][0].metadata).toEqual(
                websetMetadata('Find partnership leaders at UK consultancies', givenValidVendorBrief()),
            )
        })
    })
})
