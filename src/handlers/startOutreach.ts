import { setStoredBrief } from '../clients/briefStore'
import { getTavily } from '../clients/tavily'
import { logger } from '../logger'
import { apiResponse, APIResponse, internalError, successResponse, validationError } from '../utils/endpointResponses'
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

        const emailModel = parsed.data.emailModel?.trim() || ''
        logger.info('OutreachRequest validated', {
            search: parsed.data.search,
            vendorName: parsed.data.brief.vendorName,
            reuseResearch: Boolean(parsed.data.reuseResearch),
            prospectCount: parsed.data.prospects?.length || 0,
            emailModel,
        })

        const { search, brief, reuseResearch, prospects } = parsed.data
        const tavily = getTavily()
        const reuseInput = emailModel ? { search, brief, emailModel } : { search, brief }

        if (reuseResearch) {
            logger.info('rewriting emails from existing research, skipping live Webset search')
            try {
                const webset =
                    prospects && prospects.length > 0
                        ? await tavily.websets.createFromProspects({
                              ...reuseInput,
                              prospects,
                              dashboardUrl: '',
                          })
                        : await tavily.websets.createFromSavedRun(reuseInput)
                setStoredBrief(webset.id, brief)
                return successResponse({
                    websetId: webset.id,
                    dashboardUrl: webset.dashboardUrl || '',
                    reusedResearch: true,
                })
            } catch (error) {
                if (error instanceof Error && error.message === 'Example run is not saved yet') {
                    logger.warn('example run missing, cannot skip research')
                    return apiResponse(400, 'Example run is not saved yet')
                }

                throw error
            }
        }

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
            metadata: websetMetadata(search, brief, emailModel),
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
