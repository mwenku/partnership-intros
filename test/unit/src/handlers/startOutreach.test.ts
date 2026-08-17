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
const mockGetExa = jest.fn()
jest.mock('../../../../src/clients/exa', () => ({
    getExa: (): unknown => mockGetExa(),
}))

import { startOutreach } from '../../../../src/handlers/startOutreach'
import { OutreachRequestType, VendorBriefType } from '../../../../src/zod-schemas'

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

function givenValidOutreachRequest(): OutreachRequestType {
    return {
        search: 'Find partnership leaders at UK consultancies',
        brief: givenValidVendorBrief(),
    }
}

function givenExaClient(): void {
    mockGetExa.mockReturnValue({
        websets: {
            create: mockCreate,
        },
    })
}

function givenWebsetCreated(): void {
    mockCreate.mockResolvedValueOnce({
        id: 'webset_123',
        dashboardUrl: 'https://dashboard.exa.ai/websets/webset_123',
    })
}

describe('startOutreach handler unit tests', () => {
    beforeEach(() => {
        jest.resetAllMocks()
        process.env.EXA_API_KEY = 'test-key'
        givenExaClient()
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

        it('should return 500 if Exa client cannot be created', async () => {
            mockGetExa.mockImplementationOnce(() => {
                throw new Error('EXA_API_KEY is missing')
            })

            const actual = await startOutreach(givenValidOutreachRequest())

            expect(JSON.parse(actual.body).message).toEqual('Internal error')
            expect(actual.statusCode).toBe(500)
            expect(mockError).toHaveBeenCalledWith('startOutreach error', expect.any(Error), expect.any(Object))
        })

        it('should return 500 if Webset create fails', async () => {
            mockCreate.mockRejectedValueOnce(new Error('Exa unavailable'))

            const actual = await startOutreach(givenValidOutreachRequest())

            expect(JSON.parse(actual.body).message).toEqual('Internal error')
            expect(actual.statusCode).toBe(500)
            expect(mockCreate).toHaveBeenCalledTimes(1)
        })

        it('should return 401 if Exa rejects the team plan', async () => {
            mockCreate.mockRejectedValueOnce(
                new Error(
                    "Unauthorized. Your team (Lucas Nkuta's Personal) does not have access to the API. Upgrade to a Pro plan to get access.",
                ),
            )

            const actual = await startOutreach(givenValidOutreachRequest())

            expect(JSON.parse(actual.body).message).toEqual(
                "Unauthorized. Your team (Lucas Nkuta's Personal) does not have access to the API. Upgrade to a Pro plan to get access.",
            )
            expect(actual.statusCode).toBe(401)
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
                dashboardUrl: 'https://dashboard.exa.ai/websets/webset_123',
            })
            expect(mockCreate).toHaveBeenCalledTimes(1)
            expect(mockCreate.mock.calls[0][0].search.entity).toEqual({ type: 'person' })
            expect(mockCreate.mock.calls[0][0].search.count).toEqual(5)
            expect(mockCreate.mock.calls[0][0].search.maxPeoplePerCompany).toEqual(1)
            expect(mockCreate.mock.calls[0][0].search.criteria).toHaveLength(3)
        })
    })
})
