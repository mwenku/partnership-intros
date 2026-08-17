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
        'This is partner recruitment, not a product sales pitch.',
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
                'Public work email for this person at their current employer, preferably on the employer domain. Return only an address verified from a public source.',
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
                `Find two or three partnership-relevant signals for this person or their firm. Phrase each as a concrete fact that could be used in a partner email: customers, services, implementations, integrations, partnerships, product announcements, articles or talks. Each signal must include a source URL. Do not include unrelated personal facts.\n\n${vendorContext}`,
            ),
            format: 'text',
            metadata: { key: 'signals' },
        },
        {
            description: tagged(
                'selectedSignal',
                `Select the single best signal for personalising a partner-recruitment email to this person on behalf of the vendor below. Write it as one email-ready sentence, then one sentence on why it shows the partnership fits. Include the source URL. Do not choose trivia.\n\n${vendorContext}`,
            ),
            format: 'text',
            metadata: { key: 'selectedSignal' },
        },
    ]
}

function emailSequenceInstructions(brief: VendorBriefType): string {
    return `Write this sequence as an introduction to a partnership with ${brief.vendorName} for a cold external partner prospect.
These are drafts for review only. Do not send them. The prototype stops at reviewed sequences ready for potential use.
Do not mention Souk. Recruit the recipient as a partner for ${brief.vendorName}.

Write like a senior Partner Development Manager: commercially specific, evidence-backed, concise, no hype.

Generate exactly four concise, plain-text emails for every prospect.

The emails introduce the vendor partnership directly to the external partner prospect.

Return exactly four emails, labelled:

EMAIL 1
EMAIL 2
EMAIL 3
EMAIL 4

Each email:
- Maximum 110 words
- No HTML, bullets, markdown, or placeholders
- First line: Subject: <specific subject>
- Open with Hi <first name>,
- Close as ${brief.vendorName}
- End with a direct question that uses one of: call, chat, conversation, meeting, explore, discuss, review

The sequence should:
- Introduce the partnership opportunity.
- Lead every email with what the recipient gains if they partner, and why they should say yes.
- Explain why the company and person appear relevant.
- Use relevant, evidence-backed personalisation.
- Add useful new information in each follow-up.
- End with a respectful, low-friction close.
- Avoid generic follow-ups such as "just checking in" or "bumping this."

People act in their own interest. Every email must answer: what do they gain, and why should they partner.

EMAIL 1: Open with the commercial gain for them if they partner with ${brief.vendorName}. Then why this company and this person are the right fit. One evidence-backed hook. Do not mention Souk. End with a low-friction question.

EMAIL 2: Add a new sourced fact with a URL. Tie that fact to a gain for them that was not the same sentence as email 1. Do not repeat email 1.

EMAIL 3: Make the gain concrete: what they get for their current clients or accounts, and why that is worth partnering. Paste a full source URL from the research. Do not repeat emails 1 or 2. Do not paste the brief's contribute/gain lists.

EMAIL 4: Restate the gain in one line. Add one last useful sourced fact with a URL that was not used earlier. Include the sentence: If this is not a priority, a no is completely fine. Then a direct question.

Personalisation should explain why the opportunity fits.
Do not include unrelated personal facts merely to make the email appear personalised.
Do not invent customers, metrics, or capabilities.
Use only facts present in the research context.

Craft rules:
- Address the recipient as you. Never describe them in the third person.
- Greet with their given name only. Never use a title, credential, or initials such as MCMI or MCIPD.
- Do not paste research notes, LinkedIn headlines, or vendor brief fields verbatim.
- Do not dump comma-separated lists of contributions, gains, or target customers.
- Each email must use a different proof point and a different URL. Prefer a company, case-study, or news URL over a LinkedIn profile URL.
- Subject lines must name the prospect company or a specific proof. Do not use subjects such as Final note, Sourced proof, or Partnership opportunity.
- One idea and one link per email.
- Put a blank line between the subject, greeting, body, question, and sign-off.

${formatBrief(brief)}

Primary objective: secure interest in a first partner conversation for ${brief.vendorName}.`
}

function emailEnrichmentDescription(brief: VendorBriefType, pass: 1 | 2): string {
    const shared = emailSequenceInstructions(brief)

    if (pass === 1) {
        return tagged(
            'emailsV1',
            `Write a first-draft four-email partner recruitment sequence for this person.\n\n${shared}`,
        )
    }

    return tagged(
        'emailsV2',
        `Rewrite a stronger four-email partner recruitment sequence for this person.
Improve the previous draft on the partner's gain, fit, and sourced specificity.
Use only facts that have public sources. If a fact is unverified, omit it.
Each follow-up must add a new sourced fact rather than bumping the previous note.
The selected personalisation signal must explain fit with ${brief.vendorName}.
If the previous draft pasted brief lists or wrote about the person in the third person, rewrite those sentences as you-facing commercial copy.
Do not reuse a URL or proof point from an earlier email in the sequence.
Do not include unrelated personal details.
Do not mention Souk.
Do not repeat any sentence from the previous draft.

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
    emailSequenceInstructions,
    enrichmentKey,
    formatBrief,
    hasEnrichmentKey,
    inferPhase,
    researchEnrichments,
    uniqueSources,
    websetMetadata,
}
