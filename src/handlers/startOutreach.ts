import { setStoredBrief } from '../clients/briefStore'
import { getTavily } from '../clients/tavily'
import { logger } from '../logger'
import { APIResponse, internalError, successResponse, validationError } from '../utils/endpointResponses'
import { apiKeyFingerprint, errorFields } from '../utils/errorLogs'
import { buildSearchQuery, researchEnrichments, websetMetadata } from '../utils/webset'
import { OutreachRequest } from '../zod-schemas'

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
        const tavily = getTavily()

        const webset = await tavily.websets.create({
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
            dashboardUrl: webset.dashboardUrl || '',
        })
    } catch (error) {
        logger.error('startOutreach error', error as Error, {
            apiKey: apiKeyFingerprint(process.env.TAVILY_API_KEY),
            ...errorFields(error),
        })

        logger.info('returning internal error from startOutreach')
        return internalError()
    }
}

export { startOutreach }
