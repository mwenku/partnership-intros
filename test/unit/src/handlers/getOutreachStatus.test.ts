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

const mockGetExa = jest.fn()
const mockGetWebsetWithItems = jest.fn()
const mockEnrichmentCreate = jest.fn()
jest.mock('../../../../src/clients/exa', () => ({
    getExa: (): unknown => mockGetExa(),
    getWebsetWithItems: (...args: unknown[]): unknown => mockGetWebsetWithItems(...args),
}))

import { getOutreachStatus } from '../../../../src/handlers/getOutreachStatus'

function givenExaClient(): void {
    mockGetExa.mockReturnValue({
        websets: {
            enrichments: {
                create: mockEnrichmentCreate,
            },
        },
    })
}

function givenRunningWebset(): void {
    mockGetWebsetWithItems.mockResolvedValueOnce({
        status: 'running',
        dashboardUrl: 'https://dashboard.exa.ai/websets/webset_123',
        metadata: { vendorName: 'Harborline' },
        searches: [{ progress: { found: 0, completion: 10 } }],
        enrichments: [],
        items: { data: [] },
    })
}

function givenIdleWebsetWithoutEmailEnrichments(): void {
    mockGetWebsetWithItems.mockResolvedValueOnce({
        status: 'idle',
        dashboardUrl: 'https://dashboard.exa.ai/websets/webset_123',
        metadata: { vendorName: 'Harborline' },
        searches: [{ progress: { found: 1, completion: 100 } }],
        enrichments: [{ id: 'enr_employer', metadata: { key: 'employer' }, description: '[employer] name' }],
        items: { data: [] },
    })
}

function givenIdleWebsetWithEmailV1(): void {
    mockGetWebsetWithItems.mockResolvedValueOnce({
        status: 'idle',
        dashboardUrl: 'https://dashboard.exa.ai/websets/webset_123',
        metadata: { vendorName: 'Harborline' },
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
        status: 'idle',
        dashboardUrl: 'https://dashboard.exa.ai/websets/webset_123',
        metadata: { vendorName: 'Harborline' },
        searches: [{ progress: { found: 1, completion: 100 } }],
        enrichments: [
            { id: 'enr_v1', metadata: { key: 'emailsV1' }, description: '[emailsV1] draft', status: 'completed' },
            { id: 'enr_v2', metadata: { key: 'emailsV2' }, description: '[emailsV2] rewrite', status: 'completed' },
        ],
        items: { data: [] },
    })
}

describe('getOutreachStatus handler unit tests', () => {
    beforeEach(() => {
        jest.resetAllMocks()
        process.env.EXA_API_KEY = 'test-key'
        givenExaClient()
    })

    describe('error handling', () => {
        it('should return 400 if websetId is missing', async () => {
            const actual = await getOutreachStatus(null)

            expect(JSON.parse(actual.body).message).toEqual('websetId is required')
            expect(actual.statusCode).toBe(400)
            expect(mockWarn).toHaveBeenCalledWith('websetId is missing')
        })

        it('should return 400 if websetId is empty', async () => {
            const actual = await getOutreachStatus('')

            expect(JSON.parse(actual.body).message).toEqual('websetId is required')
            expect(actual.statusCode).toBe(400)
        })

        it('should return 500 if reading the Webset fails', async () => {
            mockGetWebsetWithItems.mockRejectedValueOnce(new Error('Exa unavailable'))

            const actual = await getOutreachStatus('webset_123')

            expect(JSON.parse(actual.body).message).toEqual('Internal error')
            expect(actual.statusCode).toBe(500)
            expect(mockError).toHaveBeenCalledWith('getOutreachStatus error', expect.any(Error), expect.any(Object))
        })
    })

    describe('success', () => {
        it('should return running while the Webset is still searching', async () => {
            givenRunningWebset()

            const actual = await getOutreachStatus('webset_123')
            const body = JSON.parse(actual.body)

            expect(actual.statusCode).toBe(200)
            expect(body.message).toEqual('Ok')
            expect(body.data.status).toEqual('running')
            expect(body.data.phase).toEqual('discovering')
            expect(mockEnrichmentCreate).not.toHaveBeenCalled()
        })

        it('should add the first email enrichment when research is idle', async () => {
            givenIdleWebsetWithoutEmailEnrichments()
            mockEnrichmentCreate.mockResolvedValueOnce({ id: 'enr_v1' })

            const actual = await getOutreachStatus('webset_123')
            const body = JSON.parse(actual.body)

            expect(actual.statusCode).toBe(200)
            expect(body.data.status).toEqual('running')
            expect(body.data.phase).toEqual('writing-v1')
            expect(mockEnrichmentCreate).toHaveBeenCalledTimes(1)
            expect(mockEnrichmentCreate.mock.calls[0][0]).toEqual('webset_123')
            expect(mockEnrichmentCreate.mock.calls[0][1].metadata).toEqual({ key: 'emailsV1' })
        })

        it('should add the second email enrichment after the first is present', async () => {
            givenIdleWebsetWithEmailV1()
            mockEnrichmentCreate.mockResolvedValueOnce({ id: 'enr_v2' })

            const actual = await getOutreachStatus('webset_123')
            const body = JSON.parse(actual.body)

            expect(actual.statusCode).toBe(200)
            expect(body.data.status).toEqual('running')
            expect(body.data.phase).toEqual('writing-v2')
            expect(mockEnrichmentCreate).toHaveBeenCalledTimes(1)
            expect(mockEnrichmentCreate.mock.calls[0][1].metadata).toEqual({ key: 'emailsV2' })
        })

        it('should return done when both email enrichments exist', async () => {
            givenIdleWebsetWithBothEmailEnrichments()

            const actual = await getOutreachStatus('webset_123')
            const body = JSON.parse(actual.body)

            expect(actual.statusCode).toBe(200)
            expect(body.data).toEqual({
                websetId: 'webset_123',
                dashboardUrl: 'https://dashboard.exa.ai/websets/webset_123',
                status: 'done',
                phase: 'done',
                itemCount: 0,
                error: '',
                prospects: [],
            })
            expect(mockEnrichmentCreate).not.toHaveBeenCalled()
        })
    })
})
