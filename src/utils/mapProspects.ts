import { CriterionEvaluationType, ProspectType, SourceType } from '../zod-schemas'
import { explainEmailImprovement, judgeEmailsAgainstContext } from './emailJudgement'
import { parseFourEmails } from './parseFourEmails'
import { briefFromMetadata, collectSources, enrichmentKey, uniqueSources, WebsetSnapshot } from './webset'

type EnrichmentResult = {
    enrichmentId?: string
    enrichment_id?: string
    result?: string[] | null
    reasoning?: string
    references?: Array<{ title?: string; snippet?: string; url?: string }>
}

type WebsetItem = {
    id: string
    properties?: {
        url?: string
        person?: {
            name?: string
            location?: string
            position?: string
            pictureUrl?: string
            company?: { name?: string }
        }
    }
    evaluations?: Array<{
        criterion?: string
        reasoning?: string
        satisfied?: string
        references?: Array<{ title?: string; snippet?: string; url?: string }>
    }>
    enrichments?: EnrichmentResult[]
}

type MappableWebset = WebsetSnapshot

function firstResult(result: string[] | null | undefined): string {
    if (!result || result.length === 0) {
        return ''
    }

    return result.join('\n').trim()
}

function enrichmentMap(webset: MappableWebset): Map<string, string> {
    const map = new Map<string, string>()

    for (const enrichment of webset.enrichments || []) {
        const key = enrichmentKey(enrichment)
        if (!key || !enrichment.id) {
            continue
        }

        map.set(enrichment.id, key)
    }

    return map
}

function resultForKey(
    item: WebsetItem,
    idToKey: Map<string, string>,
    key: string,
): { text: string; sources: SourceType[]; reasoning: string } {
    const match = (item.enrichments || []).find((enrichment) => {
        const enrichmentId = enrichment.enrichmentId || enrichment.enrichment_id || ''
        return idToKey.get(enrichmentId) === key
    })

    if (!match) {
        return { text: '', sources: [], reasoning: '' }
    }

    return {
        text: firstResult(match.result),
        sources: collectSources(match.references),
        reasoning: match.reasoning || '',
    }
}

function splitSignals(text: string, sources: SourceType[]): Array<{ text: string; sources: SourceType[] }> {
    if (!text) {
        return []
    }

    const chunks = text
        .split(/\n+|(?:^|\n)\s*(?:\d+[.)]|[-*])\s+/m)
        .map((chunk) => chunk.trim())
        .filter(Boolean)

    if (chunks.length === 0) {
        return [{ text, sources }]
    }

    return chunks.slice(0, 3).map((chunk) => ({
        text: chunk,
        sources,
    }))
}

function splitSelectedSignal(text: string): { selectedSignal: string; selectedSignalWhy: string } {
    if (!text) {
        return { selectedSignal: '', selectedSignalWhy: '' }
    }

    const parts = text.split(/\n+/)
    if (parts.length === 1) {
        return { selectedSignal: text, selectedSignalWhy: text }
    }

    return {
        selectedSignal: parts[0].trim(),
        selectedSignalWhy: parts.slice(1).join(' ').trim() || parts[0].trim(),
    }
}

function mapProspects(webset: MappableWebset): ProspectType[] {
    const idToKey = enrichmentMap(webset)
    const items = webset.items?.data || []
    const brief = briefFromMetadata(webset.metadata as Record<string, string> | undefined)

    return items.map((raw) => {
        const item = raw as WebsetItem
        const employer = resultForKey(item, idToKey, 'employer')
        const website = resultForKey(item, idToKey, 'website')
        const email = resultForKey(item, idToKey, 'email')
        const companyFit = resultForKey(item, idToKey, 'companyFit')
        const personFit = resultForKey(item, idToKey, 'personFit')
        const signalsResult = resultForKey(item, idToKey, 'signals')
        const selected = resultForKey(item, idToKey, 'selectedSignal')
        const emailsV1 = resultForKey(item, idToKey, 'emailsV1')
        const emailsV2 = resultForKey(item, idToKey, 'emailsV2')
        const parsedEmailsV1 = parseFourEmails(emailsV1.text)
        const parsedEmailsV2 = parseFourEmails(emailsV2.text)
        const finalEmails = parsedEmailsV2.some((emailText) => emailText.trim().length > 0) ? parsedEmailsV2 : parsedEmailsV1
        const selectedParts = splitSelectedSignal(selected.text || selected.reasoning)

        const evaluations: CriterionEvaluationType[] = (item.evaluations || []).map((evaluation) => ({
            criterion: evaluation.criterion || '',
            satisfied: evaluation.satisfied || 'unclear',
            reasoning: evaluation.reasoning || '',
            sources: collectSources(evaluation.references),
        }))

        const sources = uniqueSources([
            ...evaluations.flatMap((evaluation) => evaluation.sources),
            ...employer.sources,
            ...website.sources,
            ...email.sources,
            ...companyFit.sources,
            ...personFit.sources,
            ...signalsResult.sources,
            ...selected.sources,
            ...emailsV1.sources,
            ...emailsV2.sources,
        ])

        const companyName = employer.text || item.properties?.person?.company?.name || ''
        const recipient = {
            name: item.properties?.person?.name || 'Unknown',
            companyName,
            position: item.properties?.person?.position || '',
        }
        const opportunity = {
            companyFit: companyFit.text || companyFit.reasoning,
            personFit: personFit.text || personFit.reasoning,
            selectedSignal: selectedParts.selectedSignal,
        }
        const emailJudgementV1 = judgeEmailsAgainstContext(parsedEmailsV1, brief, recipient, opportunity, sources)
        const emailJudgement = judgeEmailsAgainstContext(finalEmails, brief, recipient, opportunity, sources)
        const emailImprovement = explainEmailImprovement(
            emailJudgementV1,
            emailJudgement,
            recipient,
            opportunity,
            sources,
        )

        return {
            id: item.id,
            name: item.properties?.person?.name || 'Unknown',
            position: item.properties?.person?.position || '',
            location: item.properties?.person?.location || '',
            profileUrl: item.properties?.url || '',
            pictureUrl: item.properties?.person?.pictureUrl || '',
            companyName,
            companyWebsite: website.text,
            email: email.text,
            companyFit: companyFit.text || companyFit.reasoning,
            personFit: personFit.text || personFit.reasoning,
            evaluations,
            signals: splitSignals(signalsResult.text || signalsResult.reasoning, signalsResult.sources),
            selectedSignal: selectedParts.selectedSignal,
            selectedSignalWhy: selectedParts.selectedSignalWhy,
            sources,
            emailsV1: parsedEmailsV1,
            emailsV2: parsedEmailsV2,
            emailJudgementV1,
            emailJudgement,
            emailImprovement,
        }
    })
}

export { mapProspects }
