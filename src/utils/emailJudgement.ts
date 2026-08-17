import { logger } from '../logger'
import { EmailJudgementCheckType, EmailJudgementType, SourceType, VendorBriefType } from '../zod-schemas'
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

function partnerGainMatch(emailText: string, brief: VendorBriefType): string {
    const gainTokens = uniqueTokens(brief.partnerGains)
    if (gainTokens.length === 0) {
        logger.info('partner gain fields empty')
        return ''
    }

    const gainToken = firstMatchedToken(emailText, gainTokens)
    if (!gainToken) {
        logger.info('partner gain token missing from email')
        return ''
    }

    const loweredEmail = normalized(emailText)
    const youGainCues = [
        'you gain',
        'you would gain',
        'for you',
        'your clients',
        'your accounts',
        'your existing',
        'the return',
        'you get',
        'partners gain',
    ]
    const cue = youGainCues.find((phrase) => loweredEmail.includes(phrase))
    if (cue) {
        return gainToken
    }

    if (loweredEmail.includes('gain') || loweredEmail.includes('return')) {
        return gainToken
    }

    logger.info('partner gain token present without gain language', { gainToken })
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
    const partnerGainEvidence = partnerGainMatch(emailText, brief)
    const newInformationEvidence = followUpNewInformation(emailText, previousEmails, brief, recipient)
    const easyDeclineEvidence = easyDeclineMatch(emailText)
    const unrelatedPersonal = unrelatedPersonalMatch(emailText, brief, recipient, opportunity, sources)
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
        check(
            'partner-value',
            'States what the partner gains from this partnership',
            Boolean(partnerGainEvidence),
            partnerGainEvidence,
        ),
        check(
            'new-information',
            'Adds useful new information versus previous emails',
            mustIncludeNewInformation ? Boolean(newInformationEvidence) : true,
            mustIncludeNewInformation ? newInformationEvidence : 'Not required for this email step',
        ),
        check('clear-next-step', 'Contains a concrete partner next step', Boolean(nextStepEvidence), nextStepEvidence),
        check(
            'no-generic-follow-up',
            'Avoids generic follow-ups such as just checking in or bumping this',
            !genericFollowUp,
            genericFollowUp ? genericFollowUp : 'No generic follow-up phrasing',
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

        if (failedIds.has('partner-value')) {
            const gain = brief.partnerGains.split(',')[0]?.trim() || brief.partnerGains
            if (gain) {
                logger.info('patching missing partner gain', { emailNumber: index + 1 })
                next = insertLineBeforeSignOff(next, `The gain for you is ${gain}.`)
            } else {
                logger.info('partner gain missing and brief has no gain to patch', { emailNumber: index + 1 })
            }
        }

        if (failedIds.has('low-friction-close')) {
            next = insertLineBeforeSignOff(next, 'If this is not a priority, a no is completely fine.')
        }

        return next
    })
}

export { applyEmailJudgementPatches, judgeEmailsAgainstContext }
