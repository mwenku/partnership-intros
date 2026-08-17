import { tavily, TavilyClient } from '@tavily/core'
import { logger } from '../logger'
import { applyEmailJudgementPatches, judgeEmailsAgainstContext } from '../utils/emailJudgement'
import { parseFourEmails } from '../utils/parseFourEmails'
import {
    companyNameFromResult,
    DiscoveredPerson,
    emailQueryForPerson,
    emailsFromText,
    firstNameFrom,
    globalPeopleQuery,
    hostFromUrl,
    isUsableCompanyResult,
    looksLikeCompanyWebsite,
    looksLikePersonName,
    peopleFromHitList,
    peopleQueryForCompany,
    pickBestPersonFromResults,
    selectWorkEmail,
    uniqueByCompany,
} from '../utils/peopleFromSearch'
import { briefFromMetadata, collectSources, enrichmentKey, uniqueSources, websetMetadata, WebsetSnapshot } from '../utils/webset'
import { EmailJudgementType, ProspectType, SourceType, VendorBriefType } from '../zod-schemas'
import { readExampleRun } from '../utils/exampleRun'

type WebsetCriterion = {
    description: string
}

type WebsetSearchInput = {
    query: string
    count?: number
    criteria?: WebsetCriterion[]
    entity?: { type: string }
    maxPeoplePerCompany?: number
}

type WebsetEnrichmentInput = {
    description: string
    format?: 'text' | 'url' | 'email'
    metadata?: { key?: string }
}

type WebsetCreateInput = {
    search: WebsetSearchInput
    enrichments?: WebsetEnrichmentInput[]
    metadata?: Record<string, string>
}

type ItemReference = {
    title?: string
    snippet?: string
    url?: string
}

type ItemEnrichment = {
    enrichmentId: string
    result: string[]
    reasoning: string
    references: ItemReference[]
}

type WebsetItem = {
    id: string
    properties: {
        url: string
        person: {
            name: string
            location: string
            position: string
            pictureUrl: string
            company?: { name: string }
        }
    }
    evaluations: Array<{
        criterion: string
        reasoning: string
        satisfied: string
        references: ItemReference[]
    }>
    enrichments: ItemEnrichment[]
    tavilyResult: TavilySearchResult
    discoveredPerson: DiscoveredPerson
}

type TavilySearchResult = {
    title: string
    url: string
    content: string
}

type OpenAiChatResponse = {
    choices?: Array<{
        message?: {
            content?: string
        }
    }>
}

type SearchProvider = 'tavily' | 'exa'

type StoredWebset = {
    id: string
    status?: string
    dashboardUrl?: string
    metadata?: Record<string, string>
    searches?: Array<{ progress?: { found?: number; completion?: number } }>
    enrichments?: Array<{
        id?: string
        metadata?: Record<string, string>
        description?: string
        status?: string
    }>
    items: { data: WebsetItem[] }
}

type WebsetReaderClient = {
    websets: {
        get: (websetId: string) => Promise<Omit<StoredWebset, 'items'>>
        items: {
            list: (websetId: string, options?: { limit?: number }) => Promise<{ data: WebsetItem[]; hasMore: boolean }>
        }
    }
}

type WebsetClient = {
    websets: {
        create: (input: WebsetCreateInput) => Promise<{ id: string; dashboardUrl: string }>
        createFromSavedRun: (input: {
            search: string
            brief: VendorBriefType
            emailModel?: string
        }) => Promise<{ id: string; dashboardUrl: string }>
        createFromProspects: (input: {
            search: string
            brief: VendorBriefType
            prospects: ProspectType[]
            dashboardUrl?: string
            emailModel?: string
        }) => Promise<{ id: string; dashboardUrl: string }>
        get: (websetId: string) => Promise<Omit<StoredWebset, 'items'>>
        items: {
            list: (websetId: string, options?: { limit?: number }) => Promise<{ data: WebsetItem[]; hasMore: boolean }>
        }
        enrichments: {
            create: (
                websetId: string,
                enrichment: WebsetEnrichmentInput,
            ) => Promise<{ id: string; description: string; metadata: Record<string, string>; status: string }>
        }
    }
}

const websetsById = new Map<string, StoredWebset>()
let websetSequence = 0
let enrichmentSequence = 0

function selectedSearchProvider(): SearchProvider {
    const raw = (process.env.WEBSET_PROVIDER || process.env.SEARCH_PROVIDER || 'tavily').toLowerCase()
    if (raw === 'exa') {
        return 'exa'
    }

    if (raw === 'tavily') {
        return 'tavily'
    }

    logger.warn('unknown search provider, defaulting to tavily', { value: raw })
    return 'tavily'
}

function searchProviderApiKey(): string {
    const apiKey = process.env.TAVILY_API_KEY

    if (!apiKey) {
        logger.error('TAVILY_API_KEY is missing')
        throw new Error('TAVILY_API_KEY is missing')
    }

    return apiKey
}

function nextWebsetId(): string {
    websetSequence += 1
    return `webset_${websetSequence}`
}

function nextEnrichmentId(): string {
    enrichmentSequence += 1
    return `enr_${enrichmentSequence}`
}

function openAiApiKey(): string {
    return process.env.OPENAI_API_KEY || ''
}

function openAiEmailModel(): string {
    return process.env.OPENAI_EMAIL_MODEL || 'gpt-4.1'
}

function firstLine(text: string): string {
    return text.split('\n')[0]?.trim() || ''
}

function referenceFromResult(result: TavilySearchResult): ItemReference {
    return {
        title: result.title,
        snippet: result.content,
        url: result.url,
    }
}

function resultForKey(key: string, result: TavilySearchResult, person?: DiscoveredPerson): string {
    const domain = hostFromUrl(person?.companyWebsite || result.url)
    const headline = firstLine(result.content)

    if (key === 'employer') {
        if (person?.companyName) {
            return person.companyName
        }

        return domain || result.title
    }

    if (key === 'website') {
        return person?.companyWebsite || result.url
    }

    if (key === 'email') {
        return person?.email || ''
    }

    if (key === 'personFit') {
        return person?.personFit || ''
    }

    if (key === 'companyFit') {
        const companyName = person?.companyName || domain || result.title
        return `${companyName}: ${headline || result.title} Source: ${result.url}`
    }

    if (key === 'signals') {
        return [`1. ${headline || result.title}`, `2. Source: ${result.url}`].join('\n')
    }

    if (key === 'selectedSignal') {
        return [headline || result.title, `Chosen from ${result.url}`].join('\n')
    }

    return headline || result.content || result.title
}

function singleLine(text: string): string {
    return text.replace(/\s+/g, ' ').trim()
}

function firstUsefulLine(text: string): string {
    const cleaned = singleLine(text)
    if (!cleaned) {
        return ''
    }

    const parts = cleaned.split(/(?<=[.!?])\s+/)
    return parts[0] || cleaned
}

function itemEnrichmentByKey(item: WebsetItem, webset: StoredWebset, key: string): string {
    const enrichment = (webset.enrichments || []).find((entry) => enrichmentKey(entry) === key)
    if (!enrichment?.id) {
        return ''
    }

    const match = item.enrichments.find((itemEnrichment) => itemEnrichment.enrichmentId === enrichment.id)
    if (!match?.result?.length) {
        return ''
    }

    return singleLine(match.result.join(' '))
}

function itemEnrichmentMultiline(item: WebsetItem, webset: StoredWebset, key: string): string {
    const enrichment = (webset.enrichments || []).find((entry) => enrichmentKey(entry) === key)
    if (!enrichment?.id) {
        return ''
    }

    const match = item.enrichments.find((itemEnrichment) => itemEnrichment.enrichmentId === enrichment.id)
    if (!match?.result?.length) {
        return ''
    }

    return match.result.join('\n').trim()
}

function urlsFromText(text: string): SourceType[] {
    const matches = text.match(/https?:\/\/[^\s)\]>'"]+/g) || []
    return matches.map((match) => {
        const url = match.replace(/[.,;]+$/, '')
        return {
            title: url,
            snippet: '',
            url,
        }
    })
}

function sourcesFromItem(item: WebsetItem): SourceType[] {
    const sources = [
        ...item.evaluations.flatMap((evaluation) => collectSources(evaluation.references)),
        ...item.enrichments.flatMap((enrichment) => [
            ...collectSources(enrichment.references),
            ...urlsFromText((enrichment.result || []).join(' ')),
        ]),
    ]

    if (item.discoveredPerson?.companyWebsite) {
        sources.push({
            title: item.discoveredPerson.companyName || item.discoveredPerson.companyWebsite,
            snippet: '',
            url: item.discoveredPerson.companyWebsite,
        })
    }

    if (item.tavilyResult.url) {
        sources.push({
            title: item.tavilyResult.title || item.tavilyResult.url,
            snippet: firstLine(item.tavilyResult.content || ''),
            url: item.tavilyResult.url,
        })
    }

    return uniqueSources(sources)
}

function emailDrafts(pass: 1 | 2, item: WebsetItem, webset: StoredWebset): string {
    const vendorName = webset.metadata?.vendorName || 'the vendor'
    const personName = item.properties.person.name || 'there'
    const firstName = firstNameFrom(personName)
    const personRole = item.properties.person.position || 'partnership lead'
    const companyName =
        itemEnrichmentByKey(item, webset, 'employer') ||
        item.discoveredPerson.companyName ||
        item.properties.person.company?.name ||
        hostFromUrl(item.properties.url) ||
        'your team'
    const sourceUrl = itemEnrichmentByKey(item, webset, 'website') || item.properties.url || ''
    const companyFit = firstUsefulLine(itemEnrichmentByKey(item, webset, 'companyFit'))
    const personFit = firstUsefulLine(itemEnrichmentByKey(item, webset, 'personFit'))
    const signals = firstUsefulLine(itemEnrichmentByKey(item, webset, 'signals'))
    const selectedSignal = firstUsefulLine(itemEnrichmentByKey(item, webset, 'selectedSignal'))
    const fitHook = selectedSignal || personFit || companyFit || `your current work at ${companyName}`
    const offer = webset.metadata?.offer || 'this partnership'
    const valueProposition = `${vendorName} equips partners to offer ${offer}.`
    const cited = sourcesFromItem(item)
    const followUpUrl = (index: number): string => cited[index]?.url || sourceUrl
    const signOff = vendorName

    if (pass === 1) {
        return [
            'EMAIL 1',
            `Subject: ${companyName} and ${vendorName}`,
            `Hi ${firstName},`,
            `I'm reaching out as you lead ${personRole} at ${companyName}. ${valueProposition} Are you free for a chat?`,
            signOff,
            '',
            'EMAIL 2',
            `Subject: ${companyName} public note`,
            `Hi ${firstName},`,
            `I noticed this public write-up: ${companyFit || fitHook} ${followUpUrl(0)}. ${valueProposition} Are you free for a chat?`,
            signOff,
            '',
            'EMAIL 3',
            `Subject: ${companyName} and ${vendorName}`,
            `Hi ${firstName},`,
            `I noticed another public note: ${signals || personFit || fitHook} ${followUpUrl(1)}. ${vendorName} enables partners to offer ${offer}. Are you available for a chat?`,
            signOff,
            '',
            'EMAIL 4',
            `Subject: ${companyName} chat`,
            `Hi ${firstName},`,
            `I noticed one last sourced point: ${selectedSignal || companyFit || fitHook} ${followUpUrl(2)}. ${valueProposition} If this is not a priority, a no is completely fine. Are you free for a chat?`,
            signOff,
        ].join('\n\n')
    }

    return [
        'EMAIL 1',
        `Subject: ${companyName} and ${vendorName}`,
        `Hi ${firstName},`,
        `I'm reaching out as you lead ${personRole} at ${companyName}. ${valueProposition} Are you free for a chat?`,
        signOff,
        '',
        'EMAIL 2',
        `Subject: ${companyName} public note`,
        `Hi ${firstName},`,
        `I noticed this public write-up: ${companyFit || fitHook} ${followUpUrl(0)}. ${valueProposition} Are you free for a chat?`,
        signOff,
        '',
        'EMAIL 3',
        `Subject: ${companyName} and ${vendorName}`,
        `Hi ${firstName},`,
        `I noticed another public note: ${signals || personFit || fitHook} ${followUpUrl(1)}. ${vendorName} enables partners to offer ${offer}. Are you available for a chat?`,
        signOff,
        '',
        'EMAIL 4',
        `Subject: ${companyName} chat`,
        `Hi ${firstName},`,
        `I noticed one last sourced point: ${selectedSignal || companyFit || fitHook} ${followUpUrl(2)}. ${valueProposition} If this is not relevant, please say so and I will close it out. Are you free for a chat?`,
        signOff,
    ].join('\n\n')
}

function modelContext(item: WebsetItem, webset: StoredWebset, pass: 1 | 2): string {
    const personName = item.properties.person.name || 'Unknown'
    const personRole = item.properties.person.position || 'Unknown'
    const personLocation = item.properties.person.location || 'Unknown'
    const profileUrl = item.properties.url || ''
    const employer = itemEnrichmentByKey(item, webset, 'employer')
    const website = itemEnrichmentByKey(item, webset, 'website')
    const email = itemEnrichmentByKey(item, webset, 'email')
    const companyFit = itemEnrichmentByKey(item, webset, 'companyFit')
    const personFit = itemEnrichmentByKey(item, webset, 'personFit')
    const signals = itemEnrichmentByKey(item, webset, 'signals')
    const selectedSignal = itemEnrichmentByKey(item, webset, 'selectedSignal')
    const evaluations = item.evaluations
        .map((evaluation, index) => `${index + 1}. ${evaluation.criterion}: ${evaluation.reasoning}`)
        .join('\n')
    const sourceUrl = item.tavilyResult.url || ''
    const sourceTitle = item.tavilyResult.title || ''
    const sourceSnippet = firstLine(item.tavilyResult.content || '')
    const citedSources = sourcesFromItem(item)
        .map((source, index) => `${index + 1}. ${source.title} — ${source.url}`)
        .join('\n')
    const previousDraft = pass === 2 ? itemEnrichmentMultiline(item, webset, 'emailsV1') : ''

    return [
        `Vendor name: ${webset.metadata?.vendorName || ''}`,
        `Vendor website: ${webset.metadata?.website || ''}`,
        `Vendor offer: ${webset.metadata?.offer || ''}`,
        `Vendor objective: ${webset.metadata?.objective || ''}`,
        `Ideal partner: ${webset.metadata?.idealPartner || ''}`,
        `Target customers: ${webset.metadata?.targetCustomers || ''}`,
        `Partner contributes: ${webset.metadata?.partnerContributes || ''}`,
        `Partner gains: ${webset.metadata?.partnerGains || ''}`,
        `Constraints: ${webset.metadata?.constraints || ''}`,
        '',
        `Prospect name: ${personName}`,
        `Prospect given name for the greeting: ${firstNameFrom(personName)}`,
        'Greeting rule: open with Hi <given name>, never a title, credential, or initials.',
        'Voice rule: write to the recipient as you. Do not paste the research fields below verbatim.',
        `Prospect role: ${personRole}`,
        `Prospect location: ${personLocation}`,
        `Prospect profile URL: ${profileUrl}`,
        `Prospect company: ${employer}`,
        `Prospect company website: ${website}`,
        `Prospect public work email: ${email}`,
        '',
        `Company fit research: ${companyFit}`,
        `Person fit research: ${personFit}`,
        `Signals research: ${signals}`,
        `Selected signal: ${selectedSignal}`,
        `Criteria evaluations:\n${evaluations}`,
        '',
        `Primary source title: ${sourceTitle}`,
        `Primary source URL: ${sourceUrl}`,
        `Primary source snippet: ${sourceSnippet}`,
        `Citeable sources:\n${citedSources || 'None'}`,
        `Current year: ${new Date().getUTCFullYear()}`,
        'Personalisation rule: open with I am reaching out as you lead, or I noticed you are leading. Do not mention unrelated personal details.',
        'Emails 2, 3 and 4 must paste a full URL from Citeable sources.',
        'Email 4 must include: If this is not a priority, a no is completely fine.',
        'Shape rule: one paragraph of 3 sentences. Intro. Vendor equips or enables partners to offer the vendor offer. Are you free for a chat? Never start a sentence with You can or You could. Sign off once as the vendor.',
        previousDraft ? `\nPrevious draft to improve:\n${previousDraft}` : '',
    ].join('\n')
}

function emailWriterSystemPrompt(): string {
    return [
        'You write four-email partner recruitment sequences.',
        'The emails introduce a partnership with the vendor. Do not mention Souk.',
        'Recruit them as partners, never as customers.',
        'You follow the EMAIL 1 / EMAIL 2 / EMAIL 3 / EMAIL 4 label format exactly.',
        'Each email closes with the vendor name.',
        'Each email is one short paragraph of 3 sentences, like a strong email 1: intro as you lead or I noticed you are leading; the vendor equips or enables partners to offer the vendor offer; ask if they are free for a chat.',
        'Do not split those sentences onto separate lines. Sign off once as the vendor name.',
        'You never use generic follow-ups such as "just checking in" or "bumping this".',
        'Never start a sentence with You can or You could. Do not write By partnering with X, you can.',
        'Each email uses a different proof point and a different URL. Subjects name the prospect company or a specific proof.',
        'Emails 2, 3 and 4 must each paste a full http URL from the citeable sources.',
        'Email 4 must include the sentence: If this is not a priority, a no is completely fine.',
        'You never invent facts. If a fact is missing from the research context, omit it.',
    ].join(' ')
}

async function completeOpenAiPrompt(
    systemContent: string,
    userContent: string,
    options: { temperature: number; maxTokens: number; model?: string },
): Promise<string> {
    const apiKey = openAiApiKey()
    if (!apiKey) {
        return ''
    }

    const model = options.model?.trim() || openAiEmailModel()
    logger.info('calling OpenAI chat completions', { model })
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
            model,
            temperature: options.temperature,
            max_tokens: options.maxTokens,
            messages: [
                {
                    role: 'system',
                    content: systemContent,
                },
                {
                    role: 'user',
                    content: userContent,
                },
            ],
        }),
        signal: AbortSignal.timeout(60000),
    })

    if (!response.ok) {
        const errorBody = await response.text()
        logger.warn('OpenAI request failed', {
            status: response.status,
            body: errorBody,
        })
        return ''
    }

    const payload = (await response.json()) as OpenAiChatResponse
    return payload.choices?.[0]?.message?.content?.trim() || ''
}

async function completeEmailPrompt(userContent: string, model: string): Promise<string> {
    return completeOpenAiPrompt(emailWriterSystemPrompt(), userContent, {
        temperature: 0.4,
        maxTokens: 1800,
        model,
    })
}

function labelledSequence(emails: string[]): string {
    return [0, 1, 2, 3].map((index) => `EMAIL ${index + 1}\n${(emails[index] || '').trim()}`).join('\n\n')
}

function judgeGeneratedEmails(item: WebsetItem, webset: StoredWebset, content: string): EmailJudgementType {
    const brief: VendorBriefType = briefFromMetadata(webset.metadata)
    return judgeEmailsAgainstContext(
        parseFourEmails(content),
        brief,
        {
            name: item.properties.person.name || 'Unknown',
            companyName: itemEnrichmentByKey(item, webset, 'employer') || item.discoveredPerson?.companyName || '',
            position: item.properties.person.position || '',
        },
        {
            companyFit: itemEnrichmentByKey(item, webset, 'companyFit'),
            personFit: itemEnrichmentByKey(item, webset, 'personFit'),
            selectedSignal: itemEnrichmentByKey(item, webset, 'selectedSignal'),
        },
        sourcesFromItem(item),
    )
}

function finaliseGeneratedEmails(item: WebsetItem, webset: StoredWebset, content: string): string {
    const brief: VendorBriefType = briefFromMetadata(webset.metadata)
    const recipient = {
        name: item.properties.person.name || 'Unknown',
        companyName: itemEnrichmentByKey(item, webset, 'employer') || item.discoveredPerson?.companyName || '',
        position: item.properties.person.position || '',
    }
    const opportunity = {
        companyFit: itemEnrichmentByKey(item, webset, 'companyFit'),
        personFit: itemEnrichmentByKey(item, webset, 'personFit'),
        selectedSignal: itemEnrichmentByKey(item, webset, 'selectedSignal'),
    }
    const sources = sourcesFromItem(item)
    const emails = parseFourEmails(content)
    const before = judgeEmailsAgainstContext(emails, brief, recipient, opportunity, sources)
    if (before.overallVerdict === 'ready') {
        return labelledSequence(emails)
    }

    logger.info('patching email sequence after judgement', { gaps: before.gaps })
    return labelledSequence(applyEmailJudgementPatches(emails, brief, recipient, opportunity, sources))
}

async function generateEmailDrafts(
    pass: 1 | 2,
    item: WebsetItem,
    webset: StoredWebset,
    description: string,
): Promise<string> {
    const model = webset.metadata?.emailModel?.trim() || openAiEmailModel()
    logger.info('writing emails', { pass, model })
    const apiKey = openAiApiKey()
    if (!apiKey) {
        logger.warn('OPENAI_API_KEY is missing, using fallback email drafts')
        return finaliseGeneratedEmails(item, webset, emailDrafts(pass, item, webset))
    }

    try {
        const promptInstructions = description.replace(/^\[[a-zA-Z0-9]+\]\s*/, '')
        const prompt = [
            promptInstructions,
            '',
            'Use this actual context while writing:',
            modelContext(item, webset, pass),
            '',
            'Return only the four emails in the requested format and nothing else.',
        ].join('\n')
        const content = await completeEmailPrompt(prompt, model)
        if (!content) {
            logger.warn('OpenAI returned empty email content, using fallback drafts')
            return finaliseGeneratedEmails(item, webset, emailDrafts(pass, item, webset))
        }

        const judgement = judgeGeneratedEmails(item, webset, content)
        if (judgement.overallVerdict === 'ready') {
            logger.info('email draft ready', { pass })
            return finaliseGeneratedEmails(item, webset, content)
        }

        logger.info('email draft failed judgement, repairing', { pass, gaps: judgement.gaps })
        const repaired = await completeEmailPrompt(
            [
                promptInstructions,
                '',
                'Use this actual context while writing:',
                modelContext(item, webset, pass),
                '',
                'The previous sequence failed these checks:',
                judgement.gaps.join('\n'),
                '',
                'Previous sequence:',
                content,
                '',
                'Rewrite all four emails so every check passes.',
                'Keep the original draft specificity. Do not replace it with vendor brief lists or third-person biography.',
                'Address the recipient as you. Greet with their given name only.',
                'The emails introduce a partnership with the vendor. Do not mention Souk.',
                'Emails 2, 3 and 4 must each paste a full http URL from Citeable sources.',
                'Email 4 must include the sentence: If this is not a priority, a no is completely fine.',
                'Each email should be one paragraph of 3 sentences: intro, vendor equips or enables partners to offer the offer, and ask if they are free for a chat.',
                'Do not open any email with You can, You could, or By partnering with X, you can.',
                'Do not include unrelated personal facts. Do not write generic follow-ups such as just checking in or bumping this.',
                'Keep EMAIL 1, EMAIL 2, EMAIL 3, and EMAIL 4 labels.',
                'Return only the four emails and nothing else.',
            ].join('\n'),
            model,
        )
        if (!repaired) {
            logger.warn('email repair returned empty, keeping original draft', { pass })
            return finaliseGeneratedEmails(item, webset, content)
        }

        const repairedJudgement = judgeGeneratedEmails(item, webset, repaired)
        if (repairedJudgement.overallVerdict === 'ready') {
            logger.info('email repair completed', { pass })
            return finaliseGeneratedEmails(item, webset, repaired)
        }

        if (repairedJudgement.gaps.length <= judgement.gaps.length) {
            logger.warn('email repair still failed judgement, keeping repaired draft', {
                pass,
                gaps: repairedJudgement.gaps,
            })
            return finaliseGeneratedEmails(item, webset, repaired)
        }

        logger.warn('email repair still failed judgement, keeping original draft', {
            pass,
            gaps: repairedJudgement.gaps,
        })
        return finaliseGeneratedEmails(item, webset, content)
    } catch (error) {
        logger.warn('OpenAI request threw an error, using fallback drafts', {
            error: error instanceof Error ? error.message : 'unknown error',
        })
        return finaliseGeneratedEmails(item, webset, emailDrafts(pass, item, webset))
    }
}

type PersonModelResponse = {
    name?: string
    position?: string
    location?: string
    profileUrl?: string
    email?: string
    personFit?: string
}

function parsePersonModelResponse(text: string): PersonModelResponse | null {
    const fenced = text
        .replace(/^```(?:json)?\s*/i, '')
        .replace(/\s*```$/, '')
        .trim()

    try {
        return JSON.parse(fenced) as PersonModelResponse
    } catch {
        const match = fenced.match(/\{[\s\S]*\}/)
        if (!match) {
            return null
        }

        try {
            return JSON.parse(match[0]) as PersonModelResponse
        } catch {
            return null
        }
    }
}

function companyWebsiteFrom(result: TavilySearchResult): string {
    if (looksLikeCompanyWebsite(result.url)) {
        return result.url
    }

    return ''
}

function applyEmailToPerson(person: DiscoveredPerson, results: TavilySearchResult[]): DiscoveredPerson {
    if (person.email) {
        logger.info('work email already found', { name: person.name, companyName: person.companyName })
        return person
    }

    const email = selectWorkEmail(
        emailsFromText(results.map((result) => `${result.title}\n${result.content}`).join('\n')),
        hostFromUrl(person.companyWebsite),
        person.name,
    )
    if (!email) {
        logger.info('work email not found', { name: person.name, companyName: person.companyName })
        return person
    }

    logger.info('work email found', { name: person.name, companyName: person.companyName })
    return {
        ...person,
        email,
    }
}

async function searchResults(client: TavilyClient, query: string, maxResults: number): Promise<TavilySearchResult[]> {
    try {
        const response = await client.search(query, {
            searchDepth: 'advanced',
            maxResults,
            includeRawContent: 'text',
        })
        return (response.results || []).map((result) => ({
            title: result.title,
            url: result.url,
            content: result.content || result.rawContent || '',
        }))
    } catch (error) {
        logger.warn('people discovery search failed', {
            query,
            error: error instanceof Error ? error.message : 'unknown error',
        })
        return []
    }
}

async function extractPersonWithModel(
    companyName: string,
    companyWebsite: string,
    results: TavilySearchResult[],
): Promise<DiscoveredPerson | null> {
    if (results.length === 0) {
        logger.info('no people search results for model extraction', { companyName })
        return null
    }

    const snippets = results
        .map((result, index) => `${index + 1}. ${result.title}\n${result.url}\n${result.content}`)
        .join('\n\n')
    const content = await completeOpenAiPrompt(
        'You extract the best current employee to contact about partnerships at a real employer firm. Return JSON only. Never invent a name or email that is not in the snippets. The person must be a named human, not a job title or a company. Ignore listicles, job ads, and the vendor itself. If no real person is present, return {"name":""}.',
        `Company: ${companyName}\nCompany website: ${companyWebsite}\n\nSnippets:\n${snippets}\n\nReturn JSON with keys name, position, location, profileUrl, email, personFit.`,
        { temperature: 0, maxTokens: 400 },
    )
    if (!content) {
        logger.warn('model person extraction returned empty', { companyName })
        return null
    }

    const parsed = parsePersonModelResponse(content)
    const name = parsed?.name?.trim() || ''
    if (!looksLikePersonName(name)) {
        logger.info('model person extraction did not return a person', { companyName })
        return null
    }

    const sourceText = results.map((result) => `${result.title}\n${result.content}\n${result.url}`).join('\n')
    const sourceEmails = emailsFromText(sourceText)
    const email = parsed?.email && sourceEmails.includes(parsed.email.toLowerCase()) ? parsed.email.toLowerCase() : ''
    const profileFromModel = parsed?.profileUrl || ''
    const profileInSources = results.some((result) => result.url === profileFromModel)
    const linkedInResult = results.find((result) => /linkedin\.com\/in\//i.test(result.url))
    const profileUrl = profileInSources ? profileFromModel : linkedInResult?.url || results[0]?.url || companyWebsite
    const position = parsed?.position?.trim() || ''

    return {
        name,
        position,
        location: parsed?.location?.trim() || '',
        profileUrl,
        pictureUrl: '',
        companyName,
        companyWebsite,
        email,
        personFit:
            parsed?.personFit?.trim() ||
            `${name} is ${position || 'a relevant contact'} at ${companyName}, so they are a natural owner for a partnership conversation. Source: ${profileUrl}`,
    }
}

async function discoverPersonForCompany(
    client: TavilyClient,
    companyResult: TavilySearchResult,
): Promise<{ person: DiscoveredPerson; result: TavilySearchResult } | null> {
    const companyName = companyNameFromResult(companyResult)
    const companyWebsite = companyWebsiteFrom(companyResult)
    logger.info('discovering partnership contact', { companyName })

    const peopleResults = await searchResults(client, peopleQueryForCompany(companyName), 5)
    let person = pickBestPersonFromResults(peopleResults, companyName, companyWebsite)
    if (!person) {
        logger.info('heuristic people parse found nobody, trying model extraction', { companyName })
        person = await extractPersonWithModel(companyName, companyWebsite, peopleResults)
    }

    if (!person) {
        logger.info('no partnership contact found for company', { companyName })
        return null
    }

    const personWithCompany: DiscoveredPerson = {
        ...person,
        companyName: person.companyName || companyName,
        companyWebsite: person.companyWebsite || companyWebsite,
    }
    if (personWithCompany.email) {
        logger.info('work email found in people search', {
            name: personWithCompany.name,
            companyName: personWithCompany.companyName,
        })
        return {
            person: personWithCompany,
            result: companyResult,
        }
    }

    const emailResults = await searchResults(
        client,
        emailQueryForPerson(personWithCompany.name, personWithCompany.companyName),
        3,
    )
    return {
        person: applyEmailToPerson(personWithCompany, emailResults),
        result: companyResult,
    }
}

function resultFromPerson(person: DiscoveredPerson): TavilySearchResult {
    return {
        title: person.companyName,
        url: person.companyWebsite || person.profileUrl,
        content: person.personFit,
    }
}

async function discoverPeople(
    client: TavilyClient,
    companyResults: TavilySearchResult[],
    searchQuery: string,
    maxPeoplePerCompany: number,
): Promise<Array<{ person: DiscoveredPerson; result: TavilySearchResult }>> {
    const discovered = (
        await Promise.all(companyResults.map((result) => discoverPersonForCompany(client, result)))
    ).filter((entry): entry is { person: DiscoveredPerson; result: TavilySearchResult } => Boolean(entry))

    if (discovered.length > 0) {
        logger.info('people discovery completed', { found: discovered.length })
        return uniqueByCompany(
            discovered.map((entry) => entry.person),
            maxPeoplePerCompany,
        ).map((person) => {
            const match = discovered.find(
                (entry) => entry.person.name === person.name && entry.person.companyName === person.companyName,
            )
            return {
                person,
                result: match?.result || resultFromPerson(person),
            }
        })
    }

    logger.info('per-company people search found nobody, trying a global people search')
    const globalResults = await searchResults(client, globalPeopleQuery(searchQuery), companyResults.length || 5)
    const globalPeople = uniqueByCompany(peopleFromHitList(globalResults), maxPeoplePerCompany)
    if (globalPeople.length === 0) {
        logger.warn('people discovery found no partnership contacts')
        return []
    }

    const withEmails = await Promise.all(
        globalPeople.map(async (person) => {
            if (person.email) {
                return {
                    person,
                    result: resultFromPerson(person),
                }
            }

            const emailResults = await searchResults(client, emailQueryForPerson(person.name, person.companyName), 3)
            return {
                person: applyEmailToPerson(person, emailResults),
                result: resultFromPerson(person),
            }
        }),
    )
    logger.info('global people discovery completed', { found: withEmails.length })
    return withEmails
}

function buildItem(
    result: TavilySearchResult,
    index: number,
    criteria: WebsetCriterion[],
    enrichments: Array<{ id: string; key: string }>,
    person: DiscoveredPerson,
): WebsetItem {
    const references = [referenceFromResult(result)]
    if (person.profileUrl && person.profileUrl !== result.url) {
        references.push({
            title: `${person.name} profile`,
            snippet: person.personFit,
            url: person.profileUrl,
        })
    }

    const itemEnrichments = enrichments.map((enrichment) => {
        const value = resultForKey(enrichment.key, result, person)

        return {
            enrichmentId: enrichment.id,
            result: value ? [value] : [],
            reasoning: value,
            references,
        }
    })

    return {
        id: `item_${index + 1}`,
        properties: {
            url: person.profileUrl || result.url,
            person: {
                name: person.name,
                location: person.location,
                position: person.position,
                pictureUrl: person.pictureUrl,
            },
        },
        evaluations: criteria.map((criterion) => ({
            criterion: criterion.description,
            reasoning: person.personFit || firstLine(result.content),
            satisfied: 'unclear',
            references,
        })),
        enrichments: itemEnrichments,
        tavilyResult: result,
        discoveredPerson: person,
    }
}

function getStoredWebset(websetId: string): StoredWebset {
    const webset = websetsById.get(websetId)

    if (!webset) {
        throw new Error(`Webset ${websetId} not found`)
    }

    return webset
}

function referencesFromProspect(prospect: ProspectType): ItemReference[] {
    return prospect.sources.map((source) => ({
        title: source.title,
        snippet: source.snippet,
        url: source.url,
    }))
}

function itemFromSavedProspect(
    prospect: ProspectType,
    enrichments: Array<{ id: string; key: string }>,
): WebsetItem {
    const references = referencesFromProspect(prospect)
    const discoveredPerson: DiscoveredPerson = {
        name: prospect.name,
        position: prospect.position,
        location: prospect.location,
        profileUrl: prospect.profileUrl,
        pictureUrl: prospect.pictureUrl,
        companyName: prospect.companyName,
        companyWebsite: prospect.companyWebsite,
        email: prospect.email,
        personFit: prospect.personFit,
    }
    const valuesByKey: Record<string, string> = {
        employer: prospect.companyName,
        website: prospect.companyWebsite,
        email: prospect.email,
        companyFit: prospect.companyFit,
        personFit: prospect.personFit,
        signals: prospect.signals.map((signal) => signal.text).join('\n'),
        selectedSignal: [prospect.selectedSignal, prospect.selectedSignalWhy].filter(Boolean).join('\n'),
    }

    return {
        id: prospect.id,
        properties: {
            url: prospect.profileUrl || prospect.companyWebsite,
            person: {
                name: prospect.name,
                location: prospect.location,
                position: prospect.position,
                pictureUrl: prospect.pictureUrl,
                company: { name: prospect.companyName },
            },
        },
        evaluations: prospect.evaluations.map((evaluation) => ({
            criterion: evaluation.criterion,
            reasoning: evaluation.reasoning,
            satisfied: evaluation.satisfied,
            references: evaluation.sources,
        })),
        enrichments: enrichments.map((enrichment) => ({
            enrichmentId: enrichment.id,
            result: valuesByKey[enrichment.key] ? [valuesByKey[enrichment.key]] : [],
            reasoning: valuesByKey[enrichment.key] || '',
            references,
        })),
        tavilyResult: {
            title: prospect.companyName,
            url: prospect.companyWebsite || prospect.profileUrl,
            content: prospect.companyFit,
        },
        discoveredPerson,
    }
}

function createWebsetFromProspects(
    search: string,
    brief: VendorBriefType,
    prospects: ProspectType[],
    dashboardUrl = '',
    emailModel = '',
): {
    id: string
    dashboardUrl: string
} {
    const researchKeys = ['employer', 'website', 'email', 'companyFit', 'personFit', 'signals', 'selectedSignal']
    const enrichments = researchKeys.map((key) => ({
        id: nextEnrichmentId(),
        key,
        description: key,
        metadata: { key },
        status: 'completed',
    }))
    const items = prospects.map((prospect) => itemFromSavedProspect(prospect, enrichments))
    const websetId = nextWebsetId()
    const webset: StoredWebset = {
        id: websetId,
        status: 'idle',
        dashboardUrl,
        metadata: websetMetadata(search, brief, emailModel),
        searches: [{ progress: { found: items.length, completion: 100 } }],
        enrichments: enrichments.map((enrichment) => ({
            id: enrichment.id,
            description: enrichment.description,
            metadata: enrichment.metadata,
            status: enrichment.status,
        })),
        items: { data: items },
    }

    websetsById.set(websetId, webset)
    logger.info('seeded webset from existing research', { websetId, itemCount: items.length, emailModel })
    return {
        id: websetId,
        dashboardUrl: webset.dashboardUrl || '',
    }
}

async function createWebsetFromSavedRun(
    search: string,
    brief: VendorBriefType,
    emailModel = '',
): Promise<{
    id: string
    dashboardUrl: string
}> {
    const saved = await readExampleRun()
    logger.info('seeded webset from saved example run', { itemCount: saved.prospects.length, emailModel })
    return createWebsetFromProspects(search, brief, saved.prospects, saved.dashboardUrl || '', emailModel)
}

async function addStoredWebsetEnrichment(
    websetId: string,
    enrichment: WebsetEnrichmentInput,
): Promise<{ id: string; description: string; metadata: Record<string, string>; status: string }> {
    const webset = getStoredWebset(websetId)
    const key = enrichment.metadata?.key || ''
    const enrichmentId = nextEnrichmentId()
    const metadata = { key }
    const description = enrichment.description || ''
    const nextEnrichment = {
        id: enrichmentId,
        description,
        metadata,
        status: 'completed',
    }

    webset.enrichments = [...(webset.enrichments || []), nextEnrichment]
    const itemData = await Promise.all(
        webset.items.data.map(async (item) => {
            const value =
                key === 'emailsV1'
                    ? await generateEmailDrafts(1, item, webset, description)
                    : key === 'emailsV2'
                      ? await generateEmailDrafts(2, item, webset, description)
                      : resultForKey(key, item.tavilyResult, item.discoveredPerson)
            const itemEnrichment = {
                enrichmentId,
                result: [value],
                reasoning: value,
                references: [referenceFromResult(item.tavilyResult)],
            }

            return {
                ...item,
                enrichments: [...item.enrichments, itemEnrichment],
            }
        }),
    )
    webset.items = {
        data: itemData,
    }
    websetsById.set(websetId, webset)
    return nextEnrichment
}

function exaApiKey(): string {
    return (process.env.EXA_API_KEY || '').trim()
}

type EmailOverlay = {
    enrichments: NonNullable<StoredWebset['enrichments']>
    byItemId: Map<string, ItemEnrichment[]>
}

const emailOverlays = new Map<string, EmailOverlay>()

async function exaWebsetsFetch(path: string, init?: RequestInit): Promise<Record<string, unknown>> {
    const response = await fetch(`https://api.exa.ai/websets/v0${path}`, {
        ...init,
        headers: {
            accept: 'application/json',
            'content-type': 'application/json',
            Authorization: `Bearer ${exaApiKey()}`,
            ...(init?.headers || {}),
        },
        signal: AbortSignal.timeout(60000),
    })
    if (response.ok) {
        return (await response.json()) as Record<string, unknown>
    }

    const body = await response.text()
    logger.error('exa websets request failed', undefined, {
        path,
        status: response.status,
        body,
    })
    throw new Error(`Exa Websets ${path} failed: ${response.status}`)
}

function asRecord(value: unknown): Record<string, unknown> {
    if (value && typeof value === 'object') {
        return value as Record<string, unknown>
    }

    return {}
}

function asString(value: unknown): string {
    return typeof value === 'string' ? value : ''
}

function companyNameFromExaPerson(person: Record<string, unknown>): string {
    const company = asRecord(person.company)
    const named = asString(company.name)
    if (named) {
        return named
    }

    const history = Array.isArray(person.workHistory)
        ? person.workHistory
        : Array.isArray(person.work_history)
          ? person.work_history
          : []
    const current = asRecord(history[0])
    const currentCompany = asRecord(current.company)
    const fromHistory = asString(currentCompany.name)
    if (fromHistory) {
        logger.info('using Exa work history company', { companyName: fromHistory })
        return fromHistory
    }

    return ''
}

function overlayFor(websetId: string): EmailOverlay {
    const existing = emailOverlays.get(websetId)
    if (existing) {
        return existing
    }

    const created: EmailOverlay = {
        enrichments: [],
        byItemId: new Map(),
    }
    emailOverlays.set(websetId, created)
    return created
}

function convertExaItem(raw: Record<string, unknown>, webset: Omit<StoredWebset, 'items'>): WebsetItem {
    const properties = asRecord(raw.properties)
    const person = asRecord(properties.person)
    const evaluations = Array.isArray(raw.evaluations) ? raw.evaluations : []
    const rawEnrichments = Array.isArray(raw.enrichments) ? raw.enrichments : []
    const itemEnrichments: ItemEnrichment[] = rawEnrichments.map((entry) => {
        const enrichment = asRecord(entry)
        return {
            enrichmentId: asString(enrichment.enrichmentId || enrichment.enrichment_id),
            result: Array.isArray(enrichment.result) ? enrichment.result.map((value) => String(value)) : [],
            reasoning: asString(enrichment.reasoning),
            references: Array.isArray(enrichment.references) ? (enrichment.references as ItemReference[]) : [],
        }
    })
    const companyFromPerson = companyNameFromExaPerson(person)
    const itemForLookup: WebsetItem = {
        id: asString(raw.id),
        properties: {
            url: asString(properties.url),
            person: {
                name: asString(person.name) || 'Unknown',
                location: asString(person.location),
                position: asString(person.position),
                pictureUrl: asString(person.pictureUrl || person.picture_url),
                company: companyFromPerson ? { name: companyFromPerson } : undefined,
            },
        },
        evaluations: evaluations.map((entry) => {
            const evaluation = asRecord(entry)
            return {
                criterion: asString(evaluation.criterion),
                reasoning: asString(evaluation.reasoning),
                satisfied: asString(evaluation.satisfied) || 'unclear',
                references: Array.isArray(evaluation.references) ? (evaluation.references as ItemReference[]) : [],
            }
        }),
        enrichments: itemEnrichments,
        tavilyResult: {
            title: asString(person.name) || asString(properties.url),
            url: asString(properties.url),
            content: asString(properties.description),
        },
        discoveredPerson: {
            name: asString(person.name) || 'Unknown',
            position: asString(person.position),
            location: asString(person.location),
            profileUrl: asString(properties.url),
            pictureUrl: asString(person.pictureUrl || person.picture_url),
            companyName: '',
            companyWebsite: '',
            email: '',
            personFit: '',
        },
    }
    const storedForLookup: StoredWebset = {
        ...webset,
        items: { data: [itemForLookup] },
    }
    const employerFromEnrichment = itemEnrichmentByKey(itemForLookup, storedForLookup, 'employer')
    const emailFromEnrichment = itemEnrichmentByKey(itemForLookup, storedForLookup, 'email')
    if (employerFromEnrichment) {
        logger.info('employer from enrichment', {
            name: itemForLookup.properties.person.name,
            companyName: employerFromEnrichment,
        })
    } else if (companyFromPerson) {
        logger.info('employer from person profile', {
            name: itemForLookup.properties.person.name,
            companyName: companyFromPerson,
        })
    } else {
        logger.info('employer missing', { name: itemForLookup.properties.person.name })
    }

    if (emailFromEnrichment) {
        logger.info('work email found', {
            name: itemForLookup.properties.person.name,
            companyName: employerFromEnrichment || companyFromPerson,
        })
    } else {
        logger.info('work email not found', {
            name: itemForLookup.properties.person.name,
            companyName: employerFromEnrichment || companyFromPerson,
        })
    }

    const discoveredPerson = {
        ...itemForLookup.discoveredPerson,
        companyName: employerFromEnrichment || companyFromPerson,
        companyWebsite: itemEnrichmentByKey(itemForLookup, storedForLookup, 'website'),
        email: emailFromEnrichment,
        personFit: itemEnrichmentByKey(itemForLookup, storedForLookup, 'personFit'),
    }

    return {
        ...itemForLookup,
        discoveredPerson,
    }
}

function mapExaWebset(raw: Record<string, unknown>): Omit<StoredWebset, 'items'> {
    const overlay = overlayFor(asString(raw.id))
    const enrichments = Array.isArray(raw.enrichments) ? raw.enrichments : []
    return {
        id: asString(raw.id),
        status: asString(raw.status) || 'running',
        dashboardUrl: asString(raw.dashboardUrl || raw.dashboard_url),
        metadata: (raw.metadata as Record<string, string>) || {},
        searches: Array.isArray(raw.searches) ? (raw.searches as StoredWebset['searches']) : [],
        enrichments: [
            ...enrichments.map((entry) => {
                const enrichment = asRecord(entry)
                return {
                    id: asString(enrichment.id),
                    metadata: (enrichment.metadata as Record<string, string>) || {},
                    description: asString(enrichment.description),
                    status: asString(enrichment.status),
                }
            }),
            ...overlay.enrichments,
        ],
    }
}

function getExaWebsetsClient(): WebsetClient {
    return {
        websets: {
            create: async (input: WebsetCreateInput): Promise<{ id: string; dashboardUrl: string }> => {
                logger.info('creating Exa Webset for people, companies, and work emails')
                const created = await exaWebsetsFetch('/websets/', {
                    method: 'POST',
                    body: JSON.stringify(input),
                })
                const websetId = asString(created.id)
                const dashboardUrl = asString(created.dashboardUrl || created.dashboard_url)
                logger.info('exa webset created', {
                    websetId,
                    status: asString(created.status),
                    dashboardUrl,
                })
                overlayFor(websetId)
                return {
                    id: websetId,
                    dashboardUrl,
                }
            },
            createFromSavedRun: async (input: {
                search: string
                brief: VendorBriefType
                emailModel?: string
            }): Promise<{ id: string; dashboardUrl: string }> => {
                logger.info('skipping live research, seeding from saved example run')
                return createWebsetFromSavedRun(input.search, input.brief, input.emailModel || '')
            },
            createFromProspects: async (input: {
                search: string
                brief: VendorBriefType
                prospects: ProspectType[]
                dashboardUrl?: string
                emailModel?: string
            }): Promise<{ id: string; dashboardUrl: string }> => {
                logger.info('skipping live research, seeding from existing prospects')
                return createWebsetFromProspects(
                    input.search,
                    input.brief,
                    input.prospects,
                    input.dashboardUrl || '',
                    input.emailModel || '',
                )
            },
            get: async (websetId: string): Promise<Omit<StoredWebset, 'items'>> => {
                if (websetsById.has(websetId)) {
                    logger.info('using locally stored fixture webset', { websetId })
                    const stored = getStoredWebset(websetId)
                    const rest = { ...stored }
                    delete (rest as Partial<StoredWebset>).items
                    return rest
                }

                const raw = await exaWebsetsFetch(`/websets/${websetId}`)
                const mapped = mapExaWebset(raw)
                logger.info('exa webset loaded', {
                    websetId,
                    status: mapped.status,
                    enrichmentCount: mapped.enrichments?.length || 0,
                })
                return mapped
            },
            items: {
                list: async (
                    websetId: string,
                    options?: { limit?: number },
                ): Promise<{ data: WebsetItem[]; hasMore: boolean }> => {
                    if (websetsById.has(websetId)) {
                        logger.info('listing locally stored fixture webset items', { websetId })
                        const stored = getStoredWebset(websetId)
                        const limit = options?.limit || stored.items.data.length
                        return {
                            data: stored.items.data.slice(0, limit),
                            hasMore: stored.items.data.length > limit,
                        }
                    }

                    const limit = options?.limit || 10
                    const listed = await exaWebsetsFetch(`/websets/${websetId}/items?limit=${limit}`)
                    const webset = mapExaWebset(await exaWebsetsFetch(`/websets/${websetId}`))
                    const rows = Array.isArray(listed.data) ? listed.data : []
                    const overlay = overlayFor(websetId)
                    const data = rows.map((row) => {
                        const item = convertExaItem(asRecord(row), webset)
                        const extra = overlay.byItemId.get(item.id) || []
                        return {
                            ...item,
                            enrichments: [...item.enrichments, ...extra],
                        }
                    })
                    logger.info('exa webset items listed', {
                        websetId,
                        found: data.length,
                        withCompany: data.filter((item) => item.discoveredPerson.companyName).length,
                        withEmail: data.filter((item) => item.discoveredPerson.email).length,
                    })
                    return {
                        data,
                        hasMore: Boolean(listed.hasMore),
                    }
                },
            },
            enrichments: {
                create: async (
                    websetId: string,
                    enrichment: WebsetEnrichmentInput,
                ): Promise<{ id: string; description: string; metadata: Record<string, string>; status: string }> => {
                    if (websetsById.has(websetId)) {
                        logger.info('adding enrichment to locally stored fixture webset', { websetId })
                        return addStoredWebsetEnrichment(websetId, enrichment)
                    }

                    const key = enrichment.metadata?.key || ''
                    const description = enrichment.description || ''
                    if (key !== 'emailsV1' && key !== 'emailsV2') {
                        logger.info('adding exa research enrichment', { websetId, key })
                        const created = await exaWebsetsFetch(`/websets/${websetId}/enrichments`, {
                            method: 'POST',
                            body: JSON.stringify(enrichment),
                        })
                        return {
                            id: asString(created.id),
                            description: asString(created.description) || description,
                            metadata: (created.metadata as Record<string, string>) || { key },
                            status: asString(created.status) || 'pending',
                        }
                    }

                    logger.info('writing local email sequence against Exa people', { websetId, key })
                    const webset = mapExaWebset(await exaWebsetsFetch(`/websets/${websetId}`))
                    const listed = await exaWebsetsFetch(`/websets/${websetId}/items?limit=10`)
                    const overlay = overlayFor(websetId)
                    const enrichmentId = nextEnrichmentId()
                    const nextEnrichment = {
                        id: enrichmentId,
                        description,
                        metadata: { key },
                        status: 'completed',
                    }
                    const rows = Array.isArray(listed.data) ? listed.data : []
                    const stored: StoredWebset = {
                        ...webset,
                        enrichments: [...(webset.enrichments || []), nextEnrichment],
                        items: { data: [] },
                    }
                    const itemData = await Promise.all(
                        rows.map(async (row) => {
                            const item = convertExaItem(asRecord(row), stored)
                            const extra = overlay.byItemId.get(item.id) || []
                            const itemWithOverlay = {
                                ...item,
                                enrichments: [...item.enrichments, ...extra],
                            }
                            const value =
                                key === 'emailsV1'
                                    ? await generateEmailDrafts(1, itemWithOverlay, stored, description)
                                    : await generateEmailDrafts(2, itemWithOverlay, stored, description)
                            const itemEnrichment: ItemEnrichment = {
                                enrichmentId,
                                result: value ? [value] : [],
                                reasoning: value,
                                references: [referenceFromResult(itemWithOverlay.tavilyResult)],
                            }
                            overlay.byItemId.set(item.id, [...extra, itemEnrichment])
                            return itemWithOverlay
                        }),
                    )
                    overlay.enrichments = [...overlay.enrichments, nextEnrichment]
                    stored.items = { data: itemData }
                    logger.info('local email sequence stored', { websetId, key, itemCount: itemData.length })
                    return nextEnrichment
                },
            },
        },
    }
}

function getTavily(): WebsetClient {
    if (exaApiKey()) {
        logger.info('using Exa Websets to find companies, people, and verified work emails')
        return getExaWebsetsClient()
    }

    const provider = selectedSearchProvider()
    const client: TavilyClient = tavily({ apiKey: searchProviderApiKey() })
    if (provider === 'exa') {
        logger.info('exa provider selected, but EXA_API_KEY is missing, using Tavily search adapter')
    }

    return {
        websets: {
            create: async (input: WebsetCreateInput): Promise<{ id: string; dashboardUrl: string }> => {
                const maxResults = input.search.count || 5
                const vendorWebsite = input.metadata?.website || ''
                const vendorHost = hostFromUrl(vendorWebsite)
                const searchResponse = await client.search(input.search.query, {
                    searchDepth: 'advanced',
                    maxResults: Math.max(maxResults * 2, 8),
                    excludeDomains: vendorHost ? [vendorHost] : [],
                })
                const mappedResults = (searchResponse.results || []).map((result) => ({
                    title: result.title,
                    url: result.url,
                    content: result.content || result.rawContent || '',
                }))
                let companyResults = mappedResults.filter((result) => isUsableCompanyResult(result, vendorWebsite))
                logger.info('company search completed', {
                    found: mappedResults.length,
                    usable: companyResults.length,
                })

                if (companyResults.length < maxResults) {
                    const partnerQuery = [
                        input.metadata?.idealPartner || '',
                        input.metadata?.constraints || '',
                        'consultancy OR accountancy OR "professional services" OR "implementation partner"',
                        '"head of partnerships" OR "director of alliances" OR "business development"',
                        '-alternatives -jobs',
                    ]
                        .filter(Boolean)
                        .join(' ')
                    logger.info('searching additional partner firms', { partnerQuery })
                    const extraResponse = await client.search(partnerQuery, {
                        searchDepth: 'advanced',
                        maxResults: Math.max(maxResults * 2, 8),
                        excludeDomains: vendorHost ? [vendorHost] : [],
                    })
                    const extraResults = (extraResponse.results || []).map((result) => ({
                        title: result.title,
                        url: result.url,
                        content: result.content || result.rawContent || '',
                    }))
                    const seenHosts = new Set(companyResults.map((result) => hostFromUrl(result.url)))
                    for (const result of extraResults) {
                        if (!isUsableCompanyResult(result, vendorWebsite)) {
                            continue
                        }

                        const host = hostFromUrl(result.url)
                        if (!host || seenHosts.has(host)) {
                            continue
                        }

                        seenHosts.add(host)
                        companyResults = [...companyResults, result]
                    }
                    logger.info('partner firm search completed', { usable: companyResults.length })
                }

                companyResults = companyResults.slice(0, maxResults)
                const discoveredPeople = await discoverPeople(
                    client,
                    companyResults,
                    input.search.query,
                    input.search.maxPeoplePerCompany || 1,
                )
                const enrichments =
                    input.enrichments?.map((enrichment) => ({
                        id: nextEnrichmentId(),
                        key: enrichment.metadata?.key || '',
                        description: enrichment.description,
                        metadata: { key: enrichment.metadata?.key || '' },
                        status: 'completed',
                    })) || []

                const items = discoveredPeople.map((entry, index) =>
                    buildItem(entry.result, index, input.search.criteria || [], enrichments, entry.person),
                )
                const websetId = nextWebsetId()
                const webset: StoredWebset = {
                    id: websetId,
                    status: 'idle',
                    dashboardUrl: '',
                    metadata: input.metadata || {},
                    searches: [{ progress: { found: items.length, completion: 100 } }],
                    enrichments: enrichments.map((enrichment) => ({
                        id: enrichment.id,
                        description: enrichment.description,
                        metadata: enrichment.metadata,
                        status: enrichment.status,
                    })),
                    items: { data: items },
                }

                websetsById.set(websetId, webset)

                return {
                    id: websetId,
                    dashboardUrl: '',
                }
            },
            createFromSavedRun: async (input: {
                search: string
                brief: VendorBriefType
                emailModel?: string
            }): Promise<{ id: string; dashboardUrl: string }> => {
                logger.info('skipping live research, seeding from saved example run')
                return createWebsetFromSavedRun(input.search, input.brief, input.emailModel || '')
            },
            createFromProspects: async (input: {
                search: string
                brief: VendorBriefType
                prospects: ProspectType[]
                dashboardUrl?: string
                emailModel?: string
            }): Promise<{ id: string; dashboardUrl: string }> => {
                logger.info('skipping live research, seeding from existing prospects')
                return createWebsetFromProspects(
                    input.search,
                    input.brief,
                    input.prospects,
                    input.dashboardUrl || '',
                    input.emailModel || '',
                )
            },
            get: async (websetId: string): Promise<Omit<StoredWebset, 'items'>> => {
                const webset = getStoredWebset(websetId)
                const rest = { ...webset }
                delete (rest as Partial<StoredWebset>).items
                return rest
            },
            items: {
                list: async (
                    websetId: string,
                    options?: { limit?: number },
                ): Promise<{ data: WebsetItem[]; hasMore: boolean }> => {
                    const webset = getStoredWebset(websetId)
                    const limit = options?.limit || webset.items.data.length
                    const data = webset.items.data.slice(0, limit)

                    return {
                        data,
                        hasMore: webset.items.data.length > limit,
                    }
                },
            },
            enrichments: {
                create: async (
                    websetId: string,
                    enrichment: WebsetEnrichmentInput,
                ): Promise<{ id: string; description: string; metadata: Record<string, string>; status: string }> => {
                    return addStoredWebsetEnrichment(websetId, enrichment)
                },
            },
        },
    }
}

async function getWebsetWithItems(client: WebsetReaderClient, websetId: string): Promise<WebsetSnapshot> {
    const webset = await client.websets.get(websetId)
    const listed = await client.websets.items.list(websetId, { limit: 10 })

    return {
        ...webset,
        dashboardUrl: webset.dashboardUrl || '',
        items: listed,
    }
}

export { getTavily, getWebsetWithItems }
