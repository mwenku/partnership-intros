import Exa from 'exa-js'
import { logger } from '../logger'
import { WebsetSnapshot } from '../utils/webset'

function getExa(): Exa {
    const apiKey = process.env.EXA_API_KEY

    if (!apiKey) {
        logger.error('EXA_API_KEY is missing')
        throw new Error('EXA_API_KEY is missing')
    }

    return new Exa(apiKey)
}

async function getWebsetWithItems(exa: Exa, websetId: string): Promise<WebsetSnapshot> {
    const webset = await exa.websets.get(websetId)
    const listed = await exa.websets.items.list(websetId, { limit: 10 })
    const snakeDashboardUrl = (webset as { dashboard_url?: string }).dashboard_url || ''
    const dashboardUrl = webset.dashboardUrl || snakeDashboardUrl

    if (!webset.dashboardUrl && snakeDashboardUrl) {
        logger.info('using snake_case dashboard_url', { websetId })
    }

    return {
        ...webset,
        dashboardUrl,
        items: listed,
    }
}

export { getExa, getWebsetWithItems }
