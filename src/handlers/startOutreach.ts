import { setStoredBrief } from '../clients/briefStore'
import { getExa } from '../clients/exa'
import { logger } from '../logger'
import { apiResponse, APIResponse, internalError, successResponse, validationError } from '../utils/endpointResponses'
import { apiKeyFingerprint, exaErrorFields } from '../utils/exaLogs'
import { buildSearchQuery, researchEnrichments, websetMetadata } from '../utils/webset'
import { OutreachRequest } from '../zod-schemas'

function isUnauthorizedExaError(error: unknown): boolean {
    if (!(error instanceof Error)) {
        logger.info('startOutreach error is not an Error instance')
        return false
    }

    if (error.message.includes('Unauthorized') || error.message.includes('does not have access to the API')) {
        logger.warn('Exa unauthorized error', { message: error.message })
        return true
    }

    return false
}

async function startOutreach(body: unknown): Promise<APIResponse> {
    try {
        const parsed = OutreachRequest.safeParse(body)
        if (!parsed.success) {
            logger.warn('OutreachRequest validation failed', { issues: parsed.error.issues })
            return validationError(parsed.error)
        }

        logger.info('OutreachRequest validated', {
            search: parsed.data.search,
            vendorName: parsed.data.brief.vendorName,
        })

        const { search, brief } = parsed.data
        const exa = getExa()

        const webset = await exa.websets.create({
            search: {
                query: buildSearchQuery(search, brief),
                count: 5,
                entity: { type: 'person' },
                maxPeoplePerCompany: 1,
                criteria: [
                    {
                        description: `Currently works at a consultancy or professional services firm matching: ${brief.idealPartner}. Geography or other constraints: ${brief.constraints}.`,
                    },
                    {
                        description:
                            "Person's current role includes partnerships, alliances, business development, or equivalent partner-leadership responsibility.",
                    },
                    {
                        description: `Their firm implements or advises on work relevant to this partnership context: ${brief.offer}. Partnership objective: ${brief.objective}.`,
                    },
                ],
            },
            enrichments: researchEnrichments(brief),
            metadata: websetMetadata(search, brief),
        })

        setStoredBrief(webset.id, brief)

        return successResponse({
            websetId: webset.id,
            dashboardUrl: webset.dashboardUrl || (webset as { dashboard_url?: string }).dashboard_url || '',
        })
    } catch (error) {
        logger.error('startOutreach error', error as Error, {
            apiKey: apiKeyFingerprint(process.env.EXA_API_KEY),
            ...exaErrorFields(error),
        })

        if (isUnauthorizedExaError(error)) {
            logger.warn('returning 401 for unauthorized Exa error')
            return apiResponse(401, (error as Error).message)
        }

        logger.info('returning internal error from startOutreach')
        return internalError()
    }
}

export { startOutreach }
