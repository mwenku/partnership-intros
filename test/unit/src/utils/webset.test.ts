const mockError = jest.fn()
const mockWarn = jest.fn()
const mockInfo = jest.fn()
jest.mock('../../../../src/logger', () => ({
    logger: {
        error: mockError,
        warn: mockWarn,
        info: mockInfo,
    },
}))

import {
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
} from '../../../../src/utils/webset'
import { VendorBriefType } from '../../../../src/zod-schemas'

function givenVendorBrief(overrides: Partial<VendorBriefType> = {}): VendorBriefType {
    return {
        vendorName: 'Harborline',
        website: 'https://harborline.ai',
        offer: 'Private AI runtime',
        objective: 'Recruit UK implementation partners',
        idealPartner: 'UK consultancies',
        targetCustomers: 'Regulated UK companies',
        partnerContributes: 'Introductions and delivery',
        partnerGains: 'Implementation revenue',
        constraints: 'United Kingdom',
        ...overrides,
    }
}

function givenFormattedBrief(): string {
    return [
        'Vendor: Harborline',
        'Website: https://harborline.ai',
        'What the vendor offers: Private AI runtime',
        'Partnership objective: Recruit UK implementation partners',
        'Ideal partner: UK consultancies',
        'Customers the vendor wants to reach: Regulated UK companies',
        'What the partner contributes: Introductions and delivery',
        'What the partner gains: Implementation revenue',
        'Geography or other constraints: United Kingdom',
    ].join('\n')
}

function givenSharedEmailInstructions(): string {
    return emailSequenceInstructions(givenVendorBrief())
}

describe('webset unit tests', () => {
    beforeEach(() => {
        jest.resetAllMocks()
    })

    describe('formatBrief error handling', () => {
        it('should keep empty vendor fields in the formatted brief', () => {
            expect(
                formatBrief(
                    givenVendorBrief({
                        vendorName: '',
                        website: '',
                        offer: '',
                        objective: '',
                        idealPartner: '',
                        targetCustomers: '',
                        partnerContributes: '',
                        partnerGains: '',
                        constraints: '',
                    }),
                ),
            ).toEqual(
                [
                    'Vendor: ',
                    'Website: ',
                    'What the vendor offers: ',
                    'Partnership objective: ',
                    'Ideal partner: ',
                    'Customers the vendor wants to reach: ',
                    'What the partner contributes: ',
                    'What the partner gains: ',
                    'Geography or other constraints: ',
                ].join('\n'),
            )
        })
    })

    describe('formatBrief success', () => {
        it('should format every vendor brief field', () => {
            expect(formatBrief(givenVendorBrief())).toEqual(givenFormattedBrief())
        })
    })

    describe('buildSearchQuery error handling', () => {
        it('should still append partner-recruitment instructions if search is empty', () => {
            expect(buildSearchQuery('', givenVendorBrief())).toEqual(
                [
                    '',
                    givenFormattedBrief(),
                    'Find people who could be recruited as external partners for this vendor.',
                    'This is partner recruitment, not a product sales pitch.',
                ].join('\n'),
            )
        })
    })

    describe('buildSearchQuery success', () => {
        it('should join the search, vendor brief, and partner-recruitment instructions', () => {
            expect(buildSearchQuery('Find partnership leaders at UK consultancies', givenVendorBrief())).toEqual(
                [
                    'Find partnership leaders at UK consultancies',
                    givenFormattedBrief(),
                    'Find people who could be recruited as external partners for this vendor.',
                    'This is partner recruitment, not a product sales pitch.',
                ].join('\n'),
            )
        })
    })

    describe('researchEnrichments error handling', () => {
        it('should still return seven enrichments if the brief fields are empty', () => {
            const emptyBrief = givenVendorBrief({
                vendorName: '',
                website: '',
                offer: '',
                objective: '',
                idealPartner: '',
                targetCustomers: '',
                partnerContributes: '',
                partnerGains: '',
                constraints: '',
            })
            const vendorContext = formatBrief(emptyBrief)

            expect(researchEnrichments(emptyBrief)).toEqual([
                {
                    description: '[employer] Current employer or consultancy name for this person.',
                    format: 'text',
                    metadata: { key: 'employer' },
                },
                {
                    description: "[website] Official website URL for this person's current employer.",
                    format: 'url',
                    metadata: { key: 'website' },
                },
                {
                    description:
                        '[email] Public work email for this person at their current employer, preferably on the employer domain. Return only an address verified from a public source.',
                    format: 'email',
                    metadata: { key: 'email' },
                },
                {
                    description: `[companyFit] Why this person's company could be a suitable implementation or referral partner for the vendor below. Use public facts only and include source URLs in the answer.\n\n${vendorContext}`,
                    format: 'text',
                    metadata: { key: 'companyFit' },
                },
                {
                    description: `[personFit] Why this person is an appropriate contact for a partnership conversation with the vendor below. Use public facts about their role and responsibilities only and include source URLs.\n\n${vendorContext}`,
                    format: 'text',
                    metadata: { key: 'personFit' },
                },
                {
                    description: `[signals] Find two or three partnership-relevant signals for this person or their firm. Phrase each as a concrete fact that could be used in a partner email: customers, services, implementations, integrations, partnerships, product announcements, articles or talks. Each signal must include a source URL. Do not include unrelated personal facts.\n\n${vendorContext}`,
                    format: 'text',
                    metadata: { key: 'signals' },
                },
                {
                    description: `[selectedSignal] Select the single best signal for personalising a partner-recruitment email to this person on behalf of the vendor below. Write it as one email-ready sentence, then one sentence on why it shows the partnership fits. Include the source URL. Do not choose trivia.\n\n${vendorContext}`,
                    format: 'text',
                    metadata: { key: 'selectedSignal' },
                },
            ])
        })
    })

    describe('researchEnrichments success', () => {
        it('should return the seven research enrichments with tagged descriptions', () => {
            const vendorContext = givenFormattedBrief()

            expect(researchEnrichments(givenVendorBrief())).toEqual([
                {
                    description: '[employer] Current employer or consultancy name for this person.',
                    format: 'text',
                    metadata: { key: 'employer' },
                },
                {
                    description: "[website] Official website URL for this person's current employer.",
                    format: 'url',
                    metadata: { key: 'website' },
                },
                {
                    description:
                        '[email] Public work email for this person at their current employer, preferably on the employer domain. Return only an address verified from a public source.',
                    format: 'email',
                    metadata: { key: 'email' },
                },
                {
                    description: `[companyFit] Why this person's company could be a suitable implementation or referral partner for the vendor below. Use public facts only and include source URLs in the answer.\n\n${vendorContext}`,
                    format: 'text',
                    metadata: { key: 'companyFit' },
                },
                {
                    description: `[personFit] Why this person is an appropriate contact for a partnership conversation with the vendor below. Use public facts about their role and responsibilities only and include source URLs.\n\n${vendorContext}`,
                    format: 'text',
                    metadata: { key: 'personFit' },
                },
                {
                    description: `[signals] Find two or three partnership-relevant signals for this person or their firm. Phrase each as a concrete fact that could be used in a partner email: customers, services, implementations, integrations, partnerships, product announcements, articles or talks. Each signal must include a source URL. Do not include unrelated personal facts.\n\n${vendorContext}`,
                    format: 'text',
                    metadata: { key: 'signals' },
                },
                {
                    description: `[selectedSignal] Select the single best signal for personalising a partner-recruitment email to this person on behalf of the vendor below. Write it as one email-ready sentence, then one sentence on why it shows the partnership fits. Include the source URL. Do not choose trivia.\n\n${vendorContext}`,
                    format: 'text',
                    metadata: { key: 'selectedSignal' },
                },
            ])
        })
    })

    describe('emailSequenceInstructions error handling', () => {
        it('should keep an empty vendor name in the sender line', () => {
            expect(emailSequenceInstructions(givenVendorBrief({ vendorName: '' }))).toEqual(
                givenSharedEmailInstructions().replaceAll('Harborline', ''),
            )
        })
    })

    describe('emailSequenceInstructions success', () => {
        it('should return the four-email craft brief for the vendor', () => {
            expect(emailSequenceInstructions(givenVendorBrief())).toEqual(
                `Write this sequence as an introduction to a partnership with Harborline for a cold external partner prospect.
These are drafts for review only. Do not send them. The prototype stops at reviewed sequences ready for potential use.
Do not mention Souk. Recruit the recipient as a partner for Harborline.

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
- Close as Harborline
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

EMAIL 1: Open with the commercial gain for them if they partner with Harborline. Then why this company and this person are the right fit. One evidence-backed hook. Do not mention Souk. End with a low-friction question.

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

${givenFormattedBrief()}

Primary objective: secure interest in a first partner conversation for Harborline.`,
            )
        })
    })

    describe('emailEnrichmentDescription error handling', () => {
        it('should clip a first-draft description to 5000 characters', () => {
            const actual = emailEnrichmentDescription(givenVendorBrief({ offer: 'o'.repeat(10000) }), 1)

            expect(actual.slice(0, 11)).toEqual('[emailsV1] ')
            expect(actual.length).toEqual(5000)
        })
    })

    describe('emailEnrichmentDescription success', () => {
        it('should return the tagged first-draft four-email prompt', () => {
            expect(emailEnrichmentDescription(givenVendorBrief(), 1)).toEqual(
                `[emailsV1] Write a first-draft four-email partner recruitment sequence for this person.\n\n${givenSharedEmailInstructions()}`,
            )
        })

        it('should return the tagged rewrite four-email prompt', () => {
            expect(emailEnrichmentDescription(givenVendorBrief(), 2)).toEqual(
                `[emailsV2] Rewrite a stronger four-email partner recruitment sequence for this person.
Improve the previous draft on the partner's gain, fit, and sourced specificity.
Use only facts that have public sources. If a fact is unverified, omit it.
Each follow-up must add a new sourced fact rather than bumping the previous note.
The selected personalisation signal must explain fit with Harborline.
If the previous draft pasted brief lists or wrote about the person in the third person, rewrite those sentences as you-facing commercial copy.
Do not reuse a URL or proof point from an earlier email in the sequence.
Do not include unrelated personal details.
Do not mention Souk.
Do not repeat any sentence from the previous draft.

${givenSharedEmailInstructions()}`,
            )
        })
    })

    describe('websetMetadata error handling', () => {
        it('should clip search and vendor fields to 1000 characters', () => {
            const actual = websetMetadata(
                's'.repeat(1001),
                givenVendorBrief({
                    vendorName: 'n'.repeat(1001),
                }),
            )

            expect(actual.search).toEqual('s'.repeat(1000))
            expect(actual.vendorName).toEqual('n'.repeat(1000))
        })
    })

    describe('websetMetadata success', () => {
        it('should copy search and every vendor brief field', () => {
            expect(websetMetadata('Find partnership leaders at UK consultancies', givenVendorBrief())).toEqual({
                search: 'Find partnership leaders at UK consultancies',
                vendorName: 'Harborline',
                website: 'https://harborline.ai',
                offer: 'Private AI runtime',
                objective: 'Recruit UK implementation partners',
                idealPartner: 'UK consultancies',
                targetCustomers: 'Regulated UK companies',
                partnerContributes: 'Introductions and delivery',
                partnerGains: 'Implementation revenue',
                constraints: 'United Kingdom',
            })
        })
    })

    describe('briefFromMetadata error handling', () => {
        it('should return empty vendor fields if metadata is missing', () => {
            expect(briefFromMetadata(undefined)).toEqual({
                vendorName: '',
                website: '',
                offer: '',
                objective: '',
                idealPartner: '',
                targetCustomers: '',
                partnerContributes: '',
                partnerGains: '',
                constraints: '',
            })
        })
    })

    describe('briefFromMetadata success', () => {
        it('should rebuild the vendor brief from Webset metadata', () => {
            expect(
                briefFromMetadata({
                    search: 'Find partnership leaders at UK consultancies',
                    vendorName: 'Harborline',
                    website: 'https://harborline.ai',
                    offer: 'Private AI runtime',
                    objective: 'Recruit UK implementation partners',
                    idealPartner: 'UK consultancies',
                    targetCustomers: 'Regulated UK companies',
                    partnerContributes: 'Introductions and delivery',
                    partnerGains: 'Implementation revenue',
                    constraints: 'United Kingdom',
                }),
            ).toEqual(givenVendorBrief())
        })
    })

    describe('collectSources error handling', () => {
        it('should return an empty list if references are missing', () => {
            expect(collectSources(undefined)).toEqual([])
        })

        it('should skip references without a url', () => {
            expect(
                collectSources([
                    { title: 'About', snippet: 'London consultancy' },
                    { title: 'Company', snippet: 'Firm site', url: 'https://example.com' },
                ]),
            ).toEqual([
                {
                    title: 'Company',
                    snippet: 'Firm site',
                    url: 'https://example.com',
                },
            ])
        })
    })

    describe('collectSources success', () => {
        it('should map references and fall back to url and empty snippet', () => {
            expect(
                collectSources([
                    { title: 'About', snippet: 'London consultancy', url: 'https://example.com/about' },
                    { url: 'https://example.com' },
                ]),
            ).toEqual([
                {
                    title: 'About',
                    snippet: 'London consultancy',
                    url: 'https://example.com/about',
                },
                {
                    title: 'https://example.com',
                    snippet: '',
                    url: 'https://example.com',
                },
            ])
        })
    })

    describe('uniqueSources error handling', () => {
        it('should return an empty list if there are no sources', () => {
            expect(uniqueSources([])).toEqual([])
        })

        it('should keep the first source when urls are duplicated', () => {
            expect(
                uniqueSources([
                    { title: 'About', snippet: 'first', url: 'https://example.com/about' },
                    { title: 'About again', snippet: 'second', url: 'https://example.com/about' },
                    { title: 'Company', snippet: '', url: 'https://example.com' },
                ]),
            ).toEqual([
                { title: 'About', snippet: 'first', url: 'https://example.com/about' },
                { title: 'Company', snippet: '', url: 'https://example.com' },
            ])
        })
    })

    describe('uniqueSources success', () => {
        it('should keep sources with distinct urls', () => {
            expect(
                uniqueSources([
                    { title: 'About', snippet: 'London consultancy', url: 'https://example.com/about' },
                    { title: 'Company', snippet: '', url: 'https://example.com' },
                ]),
            ).toEqual([
                { title: 'About', snippet: 'London consultancy', url: 'https://example.com/about' },
                { title: 'Company', snippet: '', url: 'https://example.com' },
            ])
        })
    })

    describe('enrichmentKey error handling', () => {
        it('should return an empty string if metadata and description have no key', () => {
            expect(enrichmentKey({ description: 'untagged enrichment' })).toEqual('')
        })
    })

    describe('enrichmentKey success', () => {
        it('should return metadata key when present', () => {
            expect(enrichmentKey({ metadata: { key: 'emailsV1' }, description: '[other] ignored' })).toEqual(
                'emailsV1',
            )
        })

        it('should return the tagged description key when metadata key is missing', () => {
            expect(enrichmentKey({ description: '[emailsV2] rewrite' })).toEqual('emailsV2')
        })
    })

    describe('hasEnrichmentKey error handling', () => {
        it('should return false if enrichments are missing', () => {
            expect(hasEnrichmentKey(undefined, 'emailsV1')).toEqual(false)
        })

        it('should return false if the key is not present', () => {
            expect(hasEnrichmentKey([{ metadata: { key: 'employer' } }], 'emailsV1')).toEqual(false)
        })
    })

    describe('hasEnrichmentKey success', () => {
        it('should return true if the key is present', () => {
            expect(hasEnrichmentKey([{ metadata: { key: 'emailsV1' } }], 'emailsV1')).toEqual(true)
        })
    })

    describe('inferPhase error handling', () => {
        it('should return discovering if no people have been found', () => {
            expect(
                inferPhase({
                    status: 'running',
                    searches: [{ progress: { found: 0, completion: 10 } }],
                    enrichments: [],
                }),
            ).toEqual('discovering')
            expect(mockInfo).toHaveBeenCalledWith('inferPhase no people found yet')
        })

        it('should return writing-v1 if emailsV1 exists but is not completed', () => {
            expect(
                inferPhase({
                    status: 'running',
                    searches: [{ progress: { found: 1, completion: 100 } }],
                    enrichments: [{ metadata: { key: 'emailsV1' }, status: 'pending' }],
                }),
            ).toEqual('writing-v1')
            expect(mockInfo).toHaveBeenCalledWith('inferPhase emailsV1 not completed', { status: 'pending' })
        })

        it('should return writing-v2 if emailsV2 exists but is not completed', () => {
            expect(
                inferPhase({
                    status: 'running',
                    searches: [{ progress: { found: 1, completion: 100 } }],
                    enrichments: [{ metadata: { key: 'emailsV2' }, status: 'pending' }],
                }),
            ).toEqual('writing-v2')
            expect(mockInfo).toHaveBeenCalledWith('inferPhase emailsV2 not completed', { status: 'pending' })
        })

        it('should return writing-v2 if emailsV2 is complete but the Webset is not idle', () => {
            expect(
                inferPhase({
                    status: 'running',
                    searches: [{ progress: { found: 1, completion: 100 } }],
                    enrichments: [{ metadata: { key: 'emailsV2' }, status: 'completed' }],
                }),
            ).toEqual('writing-v2')
            expect(mockInfo).toHaveBeenCalledWith('inferPhase emailsV2 present but webset not idle', {
                status: 'running',
            })
        })
    })

    describe('inferPhase success', () => {
        it('should return researching if people have been found and email enrichments are missing', () => {
            expect(
                inferPhase({
                    status: 'running',
                    searches: [{ progress: { found: 2, completion: 40 } }],
                    enrichments: [{ metadata: { key: 'employer' } }],
                }),
            ).toEqual('researching')
            expect(mockInfo).toHaveBeenCalledWith('inferPhase people found, researching', { found: 2 })
        })

        it('should return writing-v2 if emailsV1 is complete and emailsV2 is missing', () => {
            expect(
                inferPhase({
                    status: 'idle',
                    searches: [{ progress: { found: 1, completion: 100 } }],
                    enrichments: [{ metadata: { key: 'emailsV1' }, status: 'completed' }],
                }),
            ).toEqual('writing-v2')
            expect(mockInfo).toHaveBeenCalledWith('inferPhase emailsV1 present, waiting for emailsV2')
        })

        it('should return done if emailsV2 is complete and the Webset is idle', () => {
            expect(
                inferPhase({
                    status: 'idle',
                    searches: [{ progress: { found: 1, completion: 100 } }],
                    enrichments: [{ metadata: { key: 'emailsV2' }, status: 'completed' }],
                }),
            ).toEqual('done')
            expect(mockInfo).toHaveBeenCalledWith('inferPhase emailsV2 complete and webset idle')
        })
    })
})
