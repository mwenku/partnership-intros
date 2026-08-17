import { logger } from '../logger'
import { SourceType, VendorBriefType } from '../zod-schemas'

const METADATA_LIMIT = 1000

function clip(value: string, limit = METADATA_LIMIT): string {
    return value.slice(0, limit)
}

function tagged(key: string, description: string): string {
    return clip(`[${key}] ${description}`, 5000)
}

function formatBrief(brief: VendorBriefType): string {
    return [
        `Vendor: ${brief.vendorName}`,
        `Website: ${brief.website}`,
        `What the vendor offers: ${brief.offer}`,
        `Partnership objective: ${brief.objective}`,
        `Ideal partner: ${brief.idealPartner}`,
        `Customers the vendor wants to reach: ${brief.targetCustomers}`,
        `What the partner contributes: ${brief.partnerContributes}`,
        `What the partner gains: ${brief.partnerGains}`,
        `Geography or other constraints: ${brief.constraints}`,
    ].join('\n')
}

function briefFromMetadata(metadata: Record<string, string> | undefined): VendorBriefType {
    return {
        vendorName: metadata?.vendorName || '',
        website: metadata?.website || '',
        offer: metadata?.offer || '',
        objective: metadata?.objective || '',
        idealPartner: metadata?.idealPartner || '',
        targetCustomers: metadata?.targetCustomers || '',
        partnerContributes: metadata?.partnerContributes || '',
        partnerGains: metadata?.partnerGains || '',
        constraints: metadata?.constraints || '',
    }
}

function buildSearchQuery(search: string, brief: VendorBriefType): string {
    return [
        search,
        formatBrief(brief),
        'Find people who could be recruited as external partners for this vendor.',
        'This is partner recruitment, not a sales pitch for Souk.',
    ].join('\n')
}

function researchEnrichments(brief: VendorBriefType): Array<{
    description: string
    format: 'text' | 'url' | 'email'
    metadata: { key: string }
}> {
    const vendorContext = formatBrief(brief)

    return [
        {
            description: tagged('employer', 'Current employer or consultancy name for this person.'),
            format: 'text',
            metadata: { key: 'employer' },
        },
        {
            description: tagged('website', "Official website URL for this person's current employer."),
            format: 'url',
            metadata: { key: 'website' },
        },
        {
            description: tagged(
                'email',
                'Verified public work email for this person if available. Return null if it cannot be verified from a public source.',
            ),
            format: 'email',
            metadata: { key: 'email' },
        },
        {
            description: tagged(
                'companyFit',
                `Why this person's company could be a suitable implementation or referral partner for the vendor below. Use public facts only and include source URLs in the answer.\n\n${vendorContext}`,
            ),
            format: 'text',
            metadata: { key: 'companyFit' },
        },
        {
            description: tagged(
                'personFit',
                `Why this person is an appropriate contact for a partnership conversation with the vendor below. Use public facts about their role and responsibilities only and include source URLs.\n\n${vendorContext}`,
            ),
            format: 'text',
            metadata: { key: 'personFit' },
        },
        {
            description: tagged(
                'signals',
                `Find two or three partnership-relevant signals for this person or their firm that could support email personalisation. Signals may include customers, services, implementations, integrations, partnerships, responsibilities, product announcements, articles or talks. Each signal must include a source URL. Do not include unrelated personal facts.\n\n${vendorContext}`,
            ),
            format: 'text',
            metadata: { key: 'signals' },
        },
        {
            description: tagged(
                'selectedSignal',
                `Select the single best signal for personalising a partner-recruitment email to this person on behalf of the vendor below. Explain in one or two sentences why that signal shows the partnership fits. Do not choose trivia.\n\n${vendorContext}`,
            ),
            format: 'text',
            metadata: { key: 'selectedSignal' },
        },
    ]
}

function emailEnrichmentDescription(brief: VendorBriefType, pass: 1 | 2): string {
    const vendorContext = formatBrief(brief)
    const shared = `
Souk would send this sequence on behalf of ${brief.vendorName} to a cold external partner prospect.
These are drafts for review only. Do not send them. The prototype stops at reviewed sequences ready for potential use.
Do not sell Souk. Recruit the recipient as a partner for ${brief.vendorName}.

${vendorContext}

Return exactly four concise plain-text emails, labelled:

EMAIL 1
EMAIL 2
EMAIL 3
EMAIL 4

Each email should be short. No HTML. No generic lines such as "just checking in" or "bumping this".
Personalisation must explain why the partnership fits, using sourced facts about this person and their firm.
Unsupported claims must not appear.

EMAIL 1: Introduce the partnership opportunity, why this company and person appear relevant, the partner's potential value, one evidence-backed hook, and a low-friction ask.
EMAIL 2: Add a new sourced proof point. Do not repeat email 1.
EMAIL 3: Make the partner's gain concrete: delivery motion, existing accounts, or what they would actually do.
EMAIL 4: Add one last useful sourced fact and a respectful, easy yes/no close.
`.trim()

    if (pass === 1) {
        return tagged(
            'emailsV1',
            `Write a first-draft four-email partner recruitment sequence for this person.\n\n${shared}`,
        )
    }

    return tagged(
        'emailsV2',
        `Rewrite a stronger four-email partner recruitment sequence for this person.
Use only facts that have public sources. If a fact is unverified, omit it.
Each follow-up must add a new sourced fact rather than bumping the previous note.
The selected personalisation signal must explain fit with ${brief.vendorName}.
Do not include unrelated personal details.
Do not pitch Souk.

${shared}`,
    )
}

function websetMetadata(search: string, brief: VendorBriefType): Record<string, string> {
    return {
        search: clip(search),
        vendorName: clip(brief.vendorName),
        website: clip(brief.website),
        offer: clip(brief.offer),
        objective: clip(brief.objective),
        idealPartner: clip(brief.idealPartner),
        targetCustomers: clip(brief.targetCustomers),
        partnerContributes: clip(brief.partnerContributes),
        partnerGains: clip(brief.partnerGains),
        constraints: clip(brief.constraints),
    }
}

function collectSources(
    references: Array<{ title?: string; snippet?: string; url?: string }> | undefined,
): SourceType[] {
    const sources: SourceType[] = []

    if (!references) {
        return sources
    }

    for (const reference of references) {
        if (!reference.url) {
            continue
        }

        sources.push({
            title: reference.title || reference.url,
            snippet: reference.snippet || '',
            url: reference.url,
        })
    }

    return sources
}

function uniqueSources(sources: SourceType[]): SourceType[] {
    const seen = new Set<string>()
    const unique: SourceType[] = []

    for (const source of sources) {
        if (seen.has(source.url)) {
            continue
        }

        seen.add(source.url)
        unique.push(source)
    }

    return unique
}

export type WebsetEnrichment = {
    id?: string
    metadata?: Record<string, string>
    description?: string
    status?: string
}

export type WebsetSnapshot = {
    status?: string
    dashboardUrl?: string
    metadata?: Record<string, string>
    searches?: Array<{ progress?: { found?: number; completion?: number } }>
    enrichments?: WebsetEnrichment[]
    items?: { data?: unknown[] }
}

function enrichmentKey(enrichment: WebsetEnrichment): string {
    if (enrichment.metadata?.key) {
        return enrichment.metadata.key
    }

    const taggedKey = enrichment.description?.match(/^\[([a-zA-Z0-9]+)\]/)
    if (taggedKey) {
        return taggedKey[1]
    }

    return ''
}

function hasEnrichmentKey(enrichments: WebsetEnrichment[] | undefined, key: string): boolean {
    return (enrichments || []).some((enrichment) => enrichmentKey(enrichment) === key)
}

function inferPhase(webset: {
    status?: string
    searches?: Array<{ progress?: { found?: number; completion?: number } }>
    enrichments?: WebsetEnrichment[]
}): 'discovering' | 'researching' | 'writing-v1' | 'writing-v2' | 'done' {
    if (hasEnrichmentKey(webset.enrichments, 'emailsV2')) {
        const emailsV2 = (webset.enrichments || []).find((enrichment) => enrichmentKey(enrichment) === 'emailsV2')
        if (emailsV2?.status && emailsV2.status !== 'completed') {
            logger.info('inferPhase emailsV2 not completed', { status: emailsV2.status })
            return 'writing-v2'
        }

        if (webset.status === 'idle') {
            logger.info('inferPhase emailsV2 complete and webset idle')
            return 'done'
        }

        logger.info('inferPhase emailsV2 present but webset not idle', { status: webset.status })
        return 'writing-v2'
    }

    if (hasEnrichmentKey(webset.enrichments, 'emailsV1')) {
        const emailsV1 = (webset.enrichments || []).find((enrichment) => enrichmentKey(enrichment) === 'emailsV1')
        if (emailsV1?.status && emailsV1.status !== 'completed') {
            logger.info('inferPhase emailsV1 not completed', { status: emailsV1.status })
            return 'writing-v1'
        }

        logger.info('inferPhase emailsV1 present, waiting for emailsV2')
        return 'writing-v2'
    }

    const found = webset.searches?.[0]?.progress?.found || 0
    if (found === 0) {
        logger.info('inferPhase no people found yet')
        return 'discovering'
    }

    logger.info('inferPhase people found, researching', { found })
    return 'researching'
}

export {
    briefFromMetadata,
    buildSearchQuery,
    collectSources,
    emailEnrichmentDescription,
    enrichmentKey,
    formatBrief,
    hasEnrichmentKey,
    inferPhase,
    researchEnrichments,
    uniqueSources,
    websetMetadata,
}
