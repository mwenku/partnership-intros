import { getStoredBrief } from '../clients/briefStore'
import { getExa, getWebsetWithItems } from '../clients/exa'
import { logger } from '../logger'
import { apiResponse, APIResponse, internalError, successResponse } from '../utils/endpointResponses'
import { apiKeyFingerprint, exaErrorFields } from '../utils/exaLogs'
import { mapProspects } from '../utils/mapProspects'
import {
    briefFromMetadata,
    emailEnrichmentDescription,
    hasEnrichmentKey,
    inferPhase,
    WebsetSnapshot,
} from '../utils/webset'
import { OutreachStatusType, VendorBriefType } from '../zod-schemas'

const addingEnrichment = new Set<string>()

function runningStatus(
    websetId: string,
    dashboardUrl: string,
    webset: WebsetSnapshot,
    prospects: OutreachStatusType['prospects'],
    phaseOverride?: OutreachStatusType['phase'],
): OutreachStatusType {
    return {
        websetId,
        dashboardUrl,
        status: 'running',
        phase: phaseOverride || inferPhase(webset),
        itemCount: prospects.length,
        error: '',
        prospects,
    }
}

async function getOutreachStatus(websetId: string | null): Promise<APIResponse> {
    if (!websetId) {
        logger.warn('websetId is missing')
        return apiResponse(400, 'websetId is required')
    }

    try {
        const exa = getExa()
        const webset = await getWebsetWithItems(exa, websetId)
        const storedBrief = getStoredBrief(websetId)
        if (storedBrief) {
            logger.info('using stored vendor brief', { websetId })
        } else {
            logger.info('using webset metadata for vendor brief', { websetId })
        }

        const brief: VendorBriefType =
            storedBrief || briefFromMetadata(webset.metadata as Record<string, string> | undefined)
        const prospects = mapProspects(webset)
        const dashboardUrl = webset.dashboardUrl || ''
        const enrichments = webset.enrichments

        logger.info('webset snapshot loaded', {
            websetId,
            status: webset.status,
            itemCount: prospects.length,
            enrichmentCount: enrichments?.length || 0,
        })

        if (webset.status === 'running') {
            logger.info('webset is still running', { websetId, status: webset.status })
            return successResponse(runningStatus(websetId, dashboardUrl, webset, prospects))
        }

        if (webset.status !== 'idle') {
            logger.warn('webset not idle', { websetId, status: webset.status })
            return successResponse(runningStatus(websetId, dashboardUrl, webset, prospects))
        }

        logger.info('webset is idle', { websetId })

        if (!hasEnrichmentKey(enrichments, 'emailsV1')) {
            logger.info('emailsV1 enrichment missing', { websetId })
            const lockKey = `${websetId}:emailsV1`
            if (addingEnrichment.has(lockKey)) {
                logger.info('emailsV1 enrichment already in progress', { websetId, lockKey })
                return successResponse(runningStatus(websetId, dashboardUrl, webset, prospects, 'writing-v1'))
            }

            logger.info('adding emailsV1 enrichment', { websetId })
            addingEnrichment.add(lockKey)
            try {
                await exa.websets.enrichments.create(websetId, {
                    description: emailEnrichmentDescription(brief, 1),
                    format: 'text',
                    metadata: { key: 'emailsV1' },
                })
            } finally {
                addingEnrichment.delete(lockKey)
            }

            return successResponse(runningStatus(websetId, dashboardUrl, webset, prospects, 'writing-v1'))
        }

        logger.info('emailsV1 enrichment present', { websetId })

        if (!hasEnrichmentKey(enrichments, 'emailsV2')) {
            logger.info('emailsV2 enrichment missing', { websetId })
            const lockKey = `${websetId}:emailsV2`
            if (addingEnrichment.has(lockKey)) {
                logger.info('emailsV2 enrichment already in progress', { websetId, lockKey })
                return successResponse(runningStatus(websetId, dashboardUrl, webset, prospects, 'writing-v2'))
            }

            logger.info('adding emailsV2 enrichment', { websetId })
            addingEnrichment.add(lockKey)
            try {
                await exa.websets.enrichments.create(websetId, {
                    description: emailEnrichmentDescription(brief, 2),
                    format: 'text',
                    metadata: { key: 'emailsV2' },
                })
            } finally {
                addingEnrichment.delete(lockKey)
            }

            return successResponse(runningStatus(websetId, dashboardUrl, webset, prospects, 'writing-v2'))
        }

        logger.info('outreach complete', { websetId, itemCount: prospects.length })
        return successResponse({
            websetId,
            dashboardUrl,
            status: 'done',
            phase: 'done',
            itemCount: prospects.length,
            error: '',
            prospects,
        })
    } catch (error) {
        logger.error('getOutreachStatus error', error as Error, {
            apiKey: apiKeyFingerprint(process.env.EXA_API_KEY),
            ...exaErrorFields(error),
        })
        return internalError()
    }
}

export { getOutreachStatus }
