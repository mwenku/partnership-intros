import { logger } from '../logger'
import { EmailImprovementType, EmailJudgementCheckType, EmailJudgementType, SourceType, VendorBriefType } from '../zod-schemas'
import { firstNameFrom } from './peopleFromSearch'

type RecipientContext = {
    name: string
    companyName: string
    position: string
}

type OpportunityContext = {
    companyFit: string
    personFit: string
    selectedSignal: string
}

const ignoredTokens = new Set([
    'about',
    'after',
    'again',
    'also',
    'because',
    'before',
    'between',
    'could',
    'first',
    'from',
    'into',
    'more',
    'other',
    'same',
    'should',
    'their',
    'there',
    'these',
    'this',
    'those',
    'through',
    'using',
    'with',
    'would',
    'your',
])

function normalized(text: string): string {
    return text.toLowerCase()
}

function tokens(text: string): string[] {
    return text
        .toLowerCase()
        .split(/[^a-z0-9]+/)
        .map((token) => token.trim())
        .filter((token) => token.length >= 5 && !ignoredTokens.has(token))
}

function uniqueTokens(text: string): string[] {
    return Array.from(new Set(tokens(text)))
}

function firstMatchedToken(emailText: string, expectedTokens: string[]): string {
    const loweredEmail = normalized(emailText)
    const matched = expectedTokens.find((token) => loweredEmail.includes(token))
    return matched || ''
}

function sourceMatches(emailText: string, sources: SourceType[]): string {
    const loweredEmail = normalized(emailText)

    for (const source of sources) {
        if (source.url && loweredEmail.includes(source.url.toLowerCase())) {
            return source.url
        }
    }

    for (const source of sources) {
        if (!source.url) {
            continue
        }

        try {
            const domain = new URL(source.url).hostname.replace(/^www\./, '').toLowerCase()
            if (domain && loweredEmail.includes(domain)) {
                return domain
            }
        } catch {
            continue
        }
    }

    return ''
}

function companyOnlyMatch(emailText: string, recipient: RecipientContext): string {
    const companyName = recipient.companyName.trim()
    if (!companyName) {
        return ''
    }

    if (normalized(emailText).includes(companyName.toLowerCase())) {
        return companyName
    }

    return ''
}

function personOnlyMatch(emailText: string, recipient: RecipientContext): string {
    const loweredEmail = normalized(emailText)
    const candidateValues = [recipient.name, recipient.position, firstNameFrom(recipient.name)]
        .map((value) => value.trim())
        .filter((value) => value.length >= 2 && value.toLowerCase() !== 'there')

    const matched = candidateValues.find((value) => loweredEmail.includes(value.toLowerCase()))
    return matched || ''
}

function recipientMatch(emailText: string, recipient: RecipientContext): string {
    const companyEvidence = companyOnlyMatch(emailText, recipient)
    const personEvidence = personOnlyMatch(emailText, recipient)
    return companyEvidence || personEvidence
}

function companyAndPersonMatch(emailText: string, recipient: RecipientContext): string {
    const companyEvidence = companyOnlyMatch(emailText, recipient)
    const personEvidence = personOnlyMatch(emailText, recipient)
    if (!companyEvidence) {
        return ''
    }

    if (!personEvidence) {
        return ''
    }

    return `${companyEvidence} + ${personEvidence}`
}

function partnerAskMatch(emailText: string): string {
    const loweredEmail = normalized(emailText)
    const verbs = ['call', 'chat', 'conversation', 'meeting', 'explore', 'discuss', 'review']
    const matchedVerb = verbs.find((verb) => loweredEmail.includes(verb))

    if (matchedVerb && emailText.includes('?')) {
        return `${matchedVerb} + question`
    }

    return ''
}

function genericFollowUpMatch(emailText: string): string {
    const loweredEmail = normalized(emailText)
    const phrases = ['just checking in', 'bumping this', 'circling back', 'touching base']
    const matched = phrases.find((phrase) => loweredEmail.includes(phrase))
    return matched || ''
}

function soukMentionMatch(emailText: string): string {
    if (normalized(emailText).includes('souk')) {
        return 'souk'
    }

    return ''
}

function introMatch(emailText: string): string {
    const loweredEmail = normalized(emailText)
    const cues = [
        "i'm reaching out",
        'i am reaching out',
        'reaching out',
        'i noticed',
        'i saw',
        'came across',
        'i wanted to introduce',
        "i'm writing",
    ]
    const matched = cues.find((phrase) => loweredEmail.includes(phrase))
    if (matched) {
        return matched
    }

    logger.info('intro missing from email')
    return ''
}

function valuePropositionMatch(emailText: string, brief: VendorBriefType): string {
    const loweredEmail = normalized(emailText)
    const cues = ['equips partners', 'enables partners', 'gives partners']
    const cue = cues.find((phrase) => loweredEmail.includes(phrase))
    if (!cue) {
        logger.info('value proposition cue missing from email')
        return ''
    }

    const valueTokens = uniqueTokens([brief.offer, brief.partnerGains].join(' '))
    const matched = firstMatchedToken(emailText, valueTokens)
    if (!matched) {
        logger.info('value proposition offer missing from email')
        return ''
    }

    return `${cue} + ${matched}`
}

function emailBodyLines(emailText: string): string[] {
    const lines = emailText
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean)
    const bodyLines: string[] = []

    for (const line of lines) {
        const lowered = line.toLowerCase()
        if (lowered.startsWith('subject:')) {
            continue
        }

        if (/^hi\b/.test(lowered) && line.length < 48) {
            continue
        }

        bodyLines.push(line)
    }

    if (bodyLines.length === 0) {
        return bodyLines
    }

    const last = bodyLines[bodyLines.length - 1]
    if (!last.includes('?') && last.split(/\s+/).length <= 4) {
        bodyLines.pop()
    }

    return bodyLines
}

function emailSentences(emailText: string): string[] {
    return emailBodyLines(emailText)
        .join(' ')
        .split(/[.!?]+/)
        .map((sentence) => sentence.trim())
        .filter((sentence) => sentence.length > 0)
}

function conciseMatch(emailText: string): string {
    const count = emailSentences(emailText).length
    if (count >= 3 && count <= 4) {
        return `${count} sentences`
    }

    logger.info('email is not 3 or 4 sentences', { count })
    return ''
}

function followUpNewInformation(
    emailText: string,
    previousEmails: string[],
    brief: VendorBriefType,
    recipient: RecipientContext,
): string {
    if (previousEmails.length === 0) {
        return 'Not required for this email step'
    }

    const identityTokens = uniqueTokens(
        [brief.vendorName, recipient.name, recipient.companyName, recipient.position].join(' '),
    )
    const currentBody = emailText.split('\n').slice(1).join(' ')
    const previousBody = previousEmails.map((email) => email.split('\n').slice(1).join(' ')).join(' ')
    const previousTokens = uniqueTokens(previousBody).filter((token) => !identityTokens.includes(token))
    const currentTokens = uniqueTokens(currentBody).filter((token) => !identityTokens.includes(token))
    const novel = currentTokens.filter((token) => !previousTokens.includes(token))
    return novel[0] || ''
}

function easyDeclineMatch(emailText: string): string {
    const loweredEmail = normalized(emailText)
    const phrases = [
        'if this is not',
        "if this isn't",
        'a no is',
        'no is completely fine',
        'not a priority',
        'not relevant',
        'close this out',
        'stop here',
        'easy to decline',
        'feel free to decline',
    ]
    const matched = phrases.find((phrase) => loweredEmail.includes(phrase))
    return matched || ''
}

function unrelatedPersonalMatch(
    emailText: string,
    brief: VendorBriefType,
    recipient: RecipientContext,
    opportunity: OpportunityContext,
    sources: SourceType[],
): string {
    const allowed = normalized(
        [
            opportunity.companyFit,
            opportunity.personFit,
            opportunity.selectedSignal,
            brief.offer,
            brief.objective,
            brief.partnerContributes,
            brief.partnerGains,
            recipient.name,
            recipient.companyName,
            recipient.position,
            ...sources.map((source) => `${source.title} ${source.snippet}`),
        ].join(' '),
    )
    const loweredEmail = normalized(emailText)
    const triviaPhrases = [
        'university',
        'graduated',
        'alma mater',
        'birthday',
        'married',
        'children',
        'hobby',
        'hobbies',
        'football team',
        'linkedin endorsement',
        'congrats on the new baby',
    ]
    const matched = triviaPhrases.find((phrase) => loweredEmail.includes(phrase) && !allowed.includes(phrase))
    return matched || ''
}

function cannedOpenerMatch(emailText: string): string {
    const lines = emailText
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean)
    const bodyLines: string[] = []

    for (const line of lines) {
        const lowered = line.toLowerCase()
        if (lowered.startsWith('subject:')) {
            continue
        }

        if (/^hi\b/.test(lowered) && line.length < 48) {
            continue
        }

        bodyLines.push(line)
    }

    const sentences = bodyLines
        .join(' ')
        .split(/[.!?\n]+/)
        .map((sentence) => sentence.trim().toLowerCase())
        .filter((sentence) => sentence.length > 0)

    for (const sentence of sentences) {
        if (/^you can\b/.test(sentence) || /, you can\b/.test(sentence)) {
            logger.info('canned you-can opener found in email')
            return 'you can'
        }

        if (/^you could\b/.test(sentence) || /, you could\b/.test(sentence)) {
            logger.info('canned you-could opener found in email')
            return 'you could'
        }
    }

    return ''
}

function check(id: string, label: string, passed: boolean, evidence: string): EmailJudgementCheckType {
    return {
        id,
        label,
        passed,
        evidence: evidence || 'No supporting evidence found in this email',
    }
}

function emailChecks(
    emailText: string,
    emailNumber: number,
    brief: VendorBriefType,
    recipient: RecipientContext,
    opportunity: OpportunityContext,
    sources: SourceType[],
    previousEmails: string[],
): EmailJudgementCheckType[] {
    const vendorTokens = [
        brief.vendorName.toLowerCase(),
        ...uniqueTokens([brief.vendorName, brief.offer, brief.objective, brief.partnerGains].join(' ')),
    ].filter((token) => token.length >= 2)
    const opportunityTokens = uniqueTokens(
        [opportunity.selectedSignal, opportunity.companyFit, opportunity.personFit, brief.targetCustomers].join(' '),
    )
    const vendorEvidence = firstMatchedToken(emailText, vendorTokens)
    const opportunityEvidence = firstMatchedToken(emailText, opportunityTokens)
    const companyAndPersonEvidence = companyAndPersonMatch(emailText, recipient)
    const recipientEvidence = recipientMatch(emailText, recipient)
    const researchEvidence = sourceMatches(emailText, sources)
    const nextStepEvidence = partnerAskMatch(emailText)
    const genericFollowUp = genericFollowUpMatch(emailText)
    const soukMention = soukMentionMatch(emailText)
    const intro = introMatch(emailText)
    const valueProposition = valuePropositionMatch(emailText, brief)
    const concise = conciseMatch(emailText)
    const newInformationEvidence = followUpNewInformation(emailText, previousEmails, brief, recipient)
    const easyDeclineEvidence = easyDeclineMatch(emailText)
    const unrelatedPersonal = unrelatedPersonalMatch(emailText, brief, recipient, opportunity, sources)
    const cannedOpener = cannedOpenerMatch(emailText)
    const mustIncludeResearch = emailNumber >= 2
    const mustIncludeCompanyAndPerson = emailNumber === 1
    const mustIncludeNewInformation = emailNumber >= 2
    const mustIncludeEasyDecline = emailNumber === 4

    return [
        check('vendor-context', 'Uses the actual vendor opportunity context', Boolean(vendorEvidence), vendorEvidence),
        check(
            'recipient-context',
            mustIncludeCompanyAndPerson
                ? 'Explains why the company and person appear relevant'
                : 'Targets the real recipient or company',
            mustIncludeCompanyAndPerson ? Boolean(companyAndPersonEvidence) : Boolean(recipientEvidence),
            mustIncludeCompanyAndPerson ? companyAndPersonEvidence : recipientEvidence,
        ),
        check(
            'opportunity-context',
            'References the researched partnership opportunity',
            Boolean(opportunityEvidence),
            opportunityEvidence,
        ),
        check(
            'research-grounding',
            mustIncludeResearch
                ? 'Grounded in cited research evidence for this prospect'
                : 'Grounded in cited research evidence when relevant',
            mustIncludeResearch ? Boolean(researchEvidence) : true,
            mustIncludeResearch ? researchEvidence : 'Not required for this email step',
        ),
        check('intro', 'Opens with a short intro', Boolean(intro), intro),
        check(
            'value-proposition',
            'States a partner value proposition',
            Boolean(valueProposition),
            valueProposition,
        ),
        check('concise', 'Stays to 3 or 4 sentences', Boolean(concise), concise),
        check(
            'new-information',
            'Adds useful new information versus previous emails',
            mustIncludeNewInformation ? Boolean(newInformationEvidence) : true,
            mustIncludeNewInformation ? newInformationEvidence : 'Not required for this email step',
        ),
        check(
            'clear-next-step',
            'Asks if they are free for a chat',
            Boolean(nextStepEvidence),
            nextStepEvidence,
        ),
        check(
            'no-generic-follow-up',
            'Avoids generic follow-ups such as just checking in or bumping this',
            !genericFollowUp,
            genericFollowUp ? genericFollowUp : 'No generic follow-up phrasing',
        ),
        check(
            'no-canned-opener',
            'Avoids repeating You can as the email opener',
            !cannedOpener,
            cannedOpener ? cannedOpener : 'No canned You can opener',
        ),
        check(
            'no-souk-mention',
            'Does not mention Souk',
            !soukMention,
            soukMention ? soukMention : 'No Souk mention',
        ),
        check(
            'low-friction-close',
            'Ends with a respectful low-friction close',
            mustIncludeEasyDecline ? Boolean(easyDeclineEvidence) : true,
            mustIncludeEasyDecline ? easyDeclineEvidence : 'Not required for this email step',
        ),
        check(
            'fit-personalisation',
            'Personalisation explains fit rather than unrelated personal facts',
            !unrelatedPersonal,
            unrelatedPersonal ? unrelatedPersonal : 'No unrelated personal facts',
        ),
    ]
}

function summaryForChecks(checks: EmailJudgementCheckType[]): string {
    const failures = checks.filter((item) => !item.passed)
    if (failures.length === 0) {
        return 'Aligned to vendor, recipient, opportunity, and research context.'
    }

    return `Needs revision on ${failures.map((item) => item.id).join(', ')}.`
}

function judgeEmailsAgainstContext(
    emails: string[],
    brief: VendorBriefType,
    recipient: RecipientContext,
    opportunity: OpportunityContext,
    sources: SourceType[],
): EmailJudgementType {
    const paddedEmails = [...emails]
    while (paddedEmails.length < 4) {
        paddedEmails.push('')
    }

    const byEmail = paddedEmails.slice(0, 4).map((emailText, index) => {
        const checks = emailChecks(
            emailText,
            index + 1,
            brief,
            recipient,
            opportunity,
            sources,
            paddedEmails.slice(0, index),
        )
        const verdict: 'ready' | 'revise' = checks.every((item) => item.passed) ? 'ready' : 'revise'

        return {
            emailNumber: index + 1,
            verdict,
            summary: summaryForChecks(checks),
            checks,
        }
    })

    const gaps = byEmail.flatMap((emailResult) => {
        return emailResult.checks
            .filter((item) => !item.passed)
            .map((item) => `Email ${emailResult.emailNumber}: ${item.label}`)
    })

    const overallVerdict = gaps.length === 0 ? 'ready' : 'revise'
    const overallSummary =
        overallVerdict === 'ready'
            ? 'All emails are grounded in the actual vendor, recipient, opportunity, and sourced research.'
            : 'Some emails are not fully grounded in the actual vendor, recipient, opportunity, and sourced research.'

    return {
        overallVerdict,
        overallSummary,
        gaps,
        byEmail,
    }
}

function failedCheckIds(judgement: EmailJudgementType): string[] {
    return judgement.byEmail.flatMap((emailResult) => {
        return emailResult.checks.filter((item) => !item.passed).map((item) => item.id)
    })
}

function problemSourceFromContext(
    first: EmailJudgementType,
    recipient: RecipientContext,
    opportunity: OpportunityContext,
    sources: SourceType[],
): EmailImprovementType['problemSource'] {
    const failedIds = new Set(failedCheckIds(first))
    const hasRecipient = Boolean(
        (recipient.name.trim() && recipient.name !== 'Unknown') || recipient.companyName.trim(),
    )
    const hasFitResearch = Boolean(opportunity.companyFit.trim() || opportunity.personFit.trim())
    const hasSelectedSignal = Boolean(opportunity.selectedSignal.trim())

    if (failedIds.has('recipient-context') && !hasRecipient) {
        return 'discovery'
    }

    if (failedIds.has('research-grounding') && sources.length === 0) {
        return 'enrichment'
    }

    if (failedIds.has('opportunity-context') && !hasFitResearch && !hasSelectedSignal) {
        return 'enrichment'
    }

    if ((failedIds.has('opportunity-context') || failedIds.has('fit-personalisation')) && !hasSelectedSignal) {
        return 'signal-selection'
    }

    return 'writing'
}

function problemSourceWhy(
    problemSource: EmailImprovementType['problemSource'],
    recipient: RecipientContext,
    opportunity: OpportunityContext,
    sources: SourceType[],
): string {
    if (problemSource === 'discovery') {
        return `Discovery did not return a usable recipient. Name: ${recipient.name || 'missing'}. Company: ${recipient.companyName || 'missing'}.`
    }

    if (problemSource === 'enrichment') {
        return `Enrichment did not return enough research to ground the emails. Company fit: ${opportunity.companyFit ? 'present' : 'missing'}. Person fit: ${opportunity.personFit ? 'present' : 'missing'}. Sources: ${sources.length}.`
    }

    if (problemSource === 'signal-selection') {
        return `Signal selection did not produce a usable partnership signal. Selected signal: ${opportunity.selectedSignal || 'missing'}.`
    }

    return `Discovery had ${recipient.name || 'the recipient'} at ${recipient.companyName || 'the company'}. Enrichment returned ${sources.length} source${sources.length === 1 ? '' : 's'}. Signal selection ${opportunity.selectedSignal ? 'had a selected signal' : 'had no selected signal'}. The remaining gaps were in the email writing, not in finding or researching the prospect.`
}

function explainEmailImprovement(
    first: EmailJudgementType,
    final: EmailJudgementType,
    recipient: RecipientContext,
    opportunity: OpportunityContext,
    sources: SourceType[],
): EmailImprovementType {
    const problemSource = problemSourceFromContext(first, recipient, opportunity, sources)
    const finalGapSet = new Set(final.gaps)
    const fixedGaps = first.gaps.filter((gap) => !finalGapSet.has(gap))
    const remainingGaps = final.gaps
    const weakInFirst =
        first.gaps.length === 0
            ? 'The first snapshot already used the actual vendor, recipient, opportunity, and sourced research.'
            : 'The first snapshot did not use enough of the actual vendor, recipient, opportunity, or sourced research.'
    let whatChanged = 'The rewrite used more of the vendor, recipient, opportunity, and sourced research.'
    if (fixedGaps.length === 0 && first.gaps.length === 0 && remainingGaps.length === 0) {
        whatChanged = 'The rewrite kept the same grounded checks.'
    } else if (fixedGaps.length === 0) {
        whatChanged = 'The rewrite did not fix the first-snapshot gaps.'
    }

    let howImproved = 'The final snapshot is still missing some vendor, recipient, opportunity, or sourced research.'
    if (final.overallVerdict === 'ready') {
        howImproved = 'The final snapshot is grounded in the actual vendor, recipient, opportunity, and sourced research.'
    }

    return {
        problemSource,
        problemSourceWhy: problemSourceWhy(problemSource, recipient, opportunity, sources),
        weakInFirst,
        whatChanged,
        howImproved,
        fixedGaps,
        remainingGaps,
    }
}

function rewriteCannedOpeners(email: string): string {
    return email
        .split('\n')
        .map((line) => {
            let next = line.replace(/^(You can |You could )/i, '')
            next = next.replace(/^By partnering with [^,]+, you can /i, '')
            if (next === line || next.length === 0) {
                return line
            }

            logger.info('rewriting canned you-can opener')
            return next.charAt(0).toUpperCase() + next.slice(1)
        })
        .join('\n')
}

function insertLineBeforeSignOff(email: string, line: string): string {
    if (!line || normalized(email).includes(normalized(line))) {
        return email
    }

    const trimmed = email.trimEnd()
    const lastNewline = trimmed.lastIndexOf('\n')
    if (lastNewline === -1) {
        return `${trimmed}\n${line}`
    }

    return `${trimmed.slice(0, lastNewline).trimEnd()}\n${line}${trimmed.slice(lastNewline)}`
}

function applyEmailJudgementPatches(
    emails: string[],
    brief: VendorBriefType,
    recipient: RecipientContext,
    opportunity: OpportunityContext,
    sources: SourceType[],
): string[] {
    const paddedEmails = [...emails]
    while (paddedEmails.length < 4) {
        paddedEmails.push('')
    }

    const judgement = judgeEmailsAgainstContext(paddedEmails, brief, recipient, opportunity, sources)
    if (judgement.overallVerdict === 'ready') {
        return paddedEmails.slice(0, 4)
    }

    return paddedEmails.slice(0, 4).map((email, index) => {
        const failedIds = new Set(
            (judgement.byEmail[index]?.checks || []).filter((item) => !item.passed).map((item) => item.id),
        )
        let next = email

        if (failedIds.has('research-grounding')) {
            const unusedUrl = sources.find(
                (source) => source.url && !normalized(next).includes(source.url.toLowerCase()),
            )?.url
            const anyUrl = sources.find((source) => Boolean(source.url))?.url || ''
            const url = unusedUrl || anyUrl
            if (url) {
                next = insertLineBeforeSignOff(next, url)
            }
        }

        if (failedIds.has('intro')) {
            const introLine =
                recipient.position && recipient.companyName
                    ? `I'm reaching out as you lead ${recipient.position} at ${recipient.companyName}.`
                    : opportunity.selectedSignal || opportunity.companyFit || recipient.companyName
                      ? `I'm reaching out as you lead work at ${opportunity.selectedSignal || opportunity.companyFit || recipient.companyName}.`
                      : ''
            if (introLine) {
                logger.info('patching missing intro', { emailNumber: index + 1 })
                next = insertLineBeforeSignOff(next, introLine)
            } else {
                logger.info('intro missing and no fact to patch', { emailNumber: index + 1 })
            }
        }

        if (failedIds.has('value-proposition')) {
            logger.info('patching missing value proposition', { emailNumber: index + 1 })
            next = insertLineBeforeSignOff(
                next,
                `${brief.vendorName} equips partners to offer ${brief.offer}.`,
            )
        }

        if (failedIds.has('low-friction-close')) {
            next = insertLineBeforeSignOff(next, 'If this is not a priority, a no is completely fine.')
        }

        if (failedIds.has('no-canned-opener')) {
            logger.info('patching canned you-can opener', { emailNumber: index + 1 })
            next = rewriteCannedOpeners(next)
        }

        return next
    })
}

export { applyEmailJudgementPatches, explainEmailImprovement, judgeEmailsAgainstContext }
