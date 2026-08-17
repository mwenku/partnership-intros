import {
    applyEmailJudgementPatches,
    explainEmailImprovement,
    judgeEmailsAgainstContext,
} from '../../../../src/utils/emailJudgement'
import { SourceType, VendorBriefType } from '../../../../src/zod-schemas'

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

function givenRecipient() {
    return {
        name: 'Jane Partner',
        companyName: 'Example Consulting',
        position: 'Head of Partnerships',
    }
}

function givenOpportunity() {
    return {
        companyFit: 'Example Consulting implements private AI for banks',
        personFit: 'Jane leads partner recruitment for regulated delivery',
        selectedSignal: 'Published a private-AI implementation guide for insurers',
    }
}

function givenSources(): SourceType[] {
    return [
        {
            title: 'Implementation guide',
            snippet: 'Private AI for insurers',
            url: 'https://example.com/guide',
        },
    ]
}

function givenReadyEmails(): string[] {
    return [
        `Subject: Example Consulting and private AI partnership
Hi Jane,
I'm reaching out as you lead partner recruitment at Example Consulting, where your team implements private AI for banks. Harborline equips partners to offer a private AI runtime. Are you free for a chat?
Harborline`,
        `Subject: Example Consulting public write-up
Hi Jane,
I noticed this public Example Consulting write-up: https://example.com/guide. Harborline equips partners to offer a private AI runtime around that implementation guide for insurers. Are you free for a chat?
Harborline`,
        `Subject: Example Consulting delivery
Hi Jane,
I noticed another private-AI note in https://example.com/guide around introductions. Harborline equips partners to offer a private AI runtime on that delivery work. Are you available for a chat?
Harborline`,
        `Subject: Example Consulting chat
Hi Jane,
I noticed one last note from https://example.com/guide: this still looks like a credible path for Example Consulting. Harborline equips partners to offer a private AI runtime. If this is not a priority, a no is fine. Are you free for a chat?
Harborline`,
    ]
}

describe('judgeEmailsAgainstContext unit tests', () => {
    describe('error handling', () => {
        it('should mark empty emails as revise', () => {
            const actual = judgeEmailsAgainstContext(
                ['', '', '', ''],
                givenVendorBrief(),
                givenRecipient(),
                givenOpportunity(),
                givenSources(),
            )

            expect(actual.overallVerdict).toEqual('revise')
            expect(actual.gaps).toEqual([
                'Email 1: Uses the actual vendor opportunity context',
                'Email 1: Explains why the company and person appear relevant',
                'Email 1: References the researched partnership opportunity',
                'Email 1: Opens with a short intro',
                'Email 1: States a partner value proposition',
                'Email 1: Stays to 3 or 4 sentences',
                'Email 1: Asks if they are free for a chat',
                'Email 2: Uses the actual vendor opportunity context',
                'Email 2: Targets the real recipient or company',
                'Email 2: References the researched partnership opportunity',
                'Email 2: Grounded in cited research evidence for this prospect',
                'Email 2: Opens with a short intro',
                'Email 2: States a partner value proposition',
                'Email 2: Stays to 3 or 4 sentences',
                'Email 2: Adds useful new information versus previous emails',
                'Email 2: Asks if they are free for a chat',
                'Email 3: Uses the actual vendor opportunity context',
                'Email 3: Targets the real recipient or company',
                'Email 3: References the researched partnership opportunity',
                'Email 3: Grounded in cited research evidence for this prospect',
                'Email 3: Opens with a short intro',
                'Email 3: States a partner value proposition',
                'Email 3: Stays to 3 or 4 sentences',
                'Email 3: Adds useful new information versus previous emails',
                'Email 3: Asks if they are free for a chat',
                'Email 4: Uses the actual vendor opportunity context',
                'Email 4: Targets the real recipient or company',
                'Email 4: References the researched partnership opportunity',
                'Email 4: Grounded in cited research evidence for this prospect',
                'Email 4: Opens with a short intro',
                'Email 4: States a partner value proposition',
                'Email 4: Stays to 3 or 4 sentences',
                'Email 4: Adds useful new information versus previous emails',
                'Email 4: Asks if they are free for a chat',
                'Email 4: Ends with a respectful low-friction close',
            ])
        })

        it('should fail emails that open with You can', () => {
            const emails = givenReadyEmails()
            emails[0] = `Subject: Harborline and Example Consulting
Hi Jane,
You can expand Example Consulting's offering.
I'm reaching out because Jane leads partner recruitment for regulated delivery.
Harborline's private AI runtime gives partners implementation revenue on that work.
Are you free for a chat?
Harborline`

            const actual = judgeEmailsAgainstContext(
                emails,
                givenVendorBrief(),
                givenRecipient(),
                givenOpportunity(),
                givenSources(),
            )

            expect(actual.overallVerdict).toEqual('revise')
            expect(actual.gaps).toEqual(['Email 1: Avoids repeating You can as the email opener'])
        })

        it('should fail a By partnering with you-can opener', () => {
            const emails = givenReadyEmails()
            emails[1] = `Subject: Example Consulting public write-up
Hi Jane,
By partnering with Harborline, you can offer Example Consulting a private AI runtime.
I'm reaching out about this public Example Consulting write-up: https://example.com/guide
Harborline's private AI runtime gives partners implementation revenue around that private-AI implementation guide for insurers.
Are you free for a short call?
Harborline`

            const actual = judgeEmailsAgainstContext(
                emails,
                givenVendorBrief(),
                givenRecipient(),
                givenOpportunity(),
                givenSources(),
            )

            expect(actual.overallVerdict).toEqual('revise')
            expect(actual.gaps).toEqual(['Email 2: Avoids repeating You can as the email opener'])
        })

        it('should fail a generic follow-up and a Souk mention', () => {
            const emails = givenReadyEmails()
            emails[0] = `Subject: Harborline and Example Consulting
Hi Jane,
I'm writing from Souk.
I'm reaching out because Example Consulting implements private AI for banks, and Jane leads partner recruitment for regulated delivery.
Harborline's private AI runtime gives partners implementation revenue on that work.
Are you free for a chat?
Harborline`
            emails[1] = `Subject: Checking in
Hi Jane,
Just checking in on Harborline for Example Consulting.
I'm reaching out about this public Example Consulting write-up: https://example.com/guide
Harborline's private AI runtime gives partners implementation revenue around that private-AI implementation guide for insurers.
Are you free for a short call?
Harborline`

            const actual = judgeEmailsAgainstContext(
                emails,
                givenVendorBrief(),
                givenRecipient(),
                givenOpportunity(),
                givenSources(),
            )

            expect(actual.overallVerdict).toEqual('revise')
            expect(actual.gaps).toEqual([
                'Email 1: Does not mention Souk',
                'Email 2: Avoids generic follow-ups such as just checking in or bumping this',
            ])
        })

        it('should fail email 1 if the company is mentioned without the person', () => {
            const emails = givenReadyEmails()
            emails[0] = `Subject: Harborline and Example Consulting
Hi there,
I'm reaching out because Example Consulting implements private AI for banks.
Harborline's private AI runtime gives partners implementation revenue on that work.
Are you free for a chat?
Harborline`

            const actual = judgeEmailsAgainstContext(
                emails,
                givenVendorBrief(),
                givenRecipient(),
                givenOpportunity(),
                givenSources(),
            )

            expect(actual.overallVerdict).toEqual('revise')
            expect(actual.gaps).toEqual(['Email 1: Explains why the company and person appear relevant'])
        })

        it('should fail a follow-up that repeats the previous email without new information', () => {
            const emails = givenReadyEmails()
            emails[1] = emails[0]

            const actual = judgeEmailsAgainstContext(
                emails,
                givenVendorBrief(),
                givenRecipient(),
                givenOpportunity(),
                givenSources(),
            )

            expect(actual.overallVerdict).toEqual('revise')
            expect(actual.gaps).toEqual([
                'Email 2: Grounded in cited research evidence for this prospect',
                'Email 2: Adds useful new information versus previous emails',
            ])
        })

        it('should fail email 4 if the close is not easy to decline', () => {
            const emails = givenReadyEmails()
            emails[3] = `Subject: Example Consulting chat
Hi Jane,
I'm reaching out with one last note from https://example.com/guide: this still looks like a credible path for Example Consulting and Harborline.
Harborline's private AI runtime gives partners implementation revenue if you want to take this further.
Are you free for a 15-minute call?
Harborline`

            const actual = judgeEmailsAgainstContext(
                emails,
                givenVendorBrief(),
                givenRecipient(),
                givenOpportunity(),
                givenSources(),
            )

            expect(actual.overallVerdict).toEqual('revise')
            expect(actual.gaps).toEqual(['Email 4: Ends with a respectful low-friction close'])
        })

        it("should accept if this isn't as an easy decline", () => {
            const emails = givenReadyEmails()
            emails[3] = `Subject: Example Consulting chat
Hi Jane,
I'm reaching out with one last note from https://example.com/guide: this still looks like a credible path for Example Consulting and Harborline.
Harborline's private AI runtime gives partners implementation revenue if you want to take this further.
If this isn't relevant, please say so.
Are you free for a 15-minute call, or should we close this out?
Harborline`

            const actual = judgeEmailsAgainstContext(
                emails,
                givenVendorBrief(),
                givenRecipient(),
                givenOpportunity(),
                givenSources(),
            )

            expect(actual.overallVerdict).toEqual('ready')
            expect(actual.gaps).toEqual([])
        })

        it('should fail unrelated personal facts that do not explain fit', () => {
            const emails = givenReadyEmails()
            emails[0] = emails[0].replace(
                'Are you free for a chat?\nHarborline',
                'Are you free for a chat?\nCongrats on the university hobby.\nHarborline',
            )

            const actual = judgeEmailsAgainstContext(
                emails,
                givenVendorBrief(),
                givenRecipient(),
                givenOpportunity(),
                givenSources(),
            )

            expect(actual.overallVerdict).toEqual('revise')
            expect(actual.gaps).toEqual(['Email 1: Personalisation explains fit rather than unrelated personal facts'])
        })

        it('should fail email 1 if the intro is missing', () => {
            const emails = givenReadyEmails()
            emails[0] = `Subject: Harborline and Example Consulting
Hi Jane,
Example Consulting implements private AI for banks, and Jane leads partner recruitment.
Harborline's private AI runtime gives partners implementation revenue on that work.
Are you free for a chat?
Harborline`

            const actual = judgeEmailsAgainstContext(
                emails,
                givenVendorBrief(),
                givenRecipient(),
                givenOpportunity(),
                givenSources(),
            )

            expect(actual.overallVerdict).toEqual('revise')
            expect(actual.gaps).toEqual(['Email 1: Opens with a short intro'])
        })

        it('should fail emails that omit the value proposition', () => {
            const emails = givenReadyEmails()
            emails[0] = `Subject: Harborline and Example Consulting
Hi Jane,
I'm reaching out because Example Consulting implements private AI for banks, and Jane leads partner recruitment for regulated delivery.
I'd like to talk about a Harborline partnership.
Are you free for a chat?
Harborline`

            const actual = judgeEmailsAgainstContext(
                emails,
                givenVendorBrief(),
                givenRecipient(),
                givenOpportunity(),
                givenSources(),
            )

            expect(actual.overallVerdict).toEqual('revise')
            expect(actual.gaps).toEqual(['Email 1: States a partner value proposition'])
        })

        it('should fail emails longer than 4 sentences', () => {
            const emails = givenReadyEmails()
            emails[0] = `Subject: Harborline and Example Consulting
Hi Jane,
I'm reaching out because Example Consulting implements private AI for banks, and Jane leads partner recruitment for regulated delivery.
Harborline's private AI runtime gives partners implementation revenue on that work.
This is another line about delivery.
This is a fifth line about banks.
Are you free for a chat?
Harborline`

            const actual = judgeEmailsAgainstContext(
                emails,
                givenVendorBrief(),
                givenRecipient(),
                givenOpportunity(),
                givenSources(),
            )

            expect(actual.overallVerdict).toEqual('revise')
            expect(actual.gaps).toEqual(['Email 1: Stays to 3 or 4 sentences'])
        })
    })

    describe('success', () => {
        it('should mark a sourced four-email partner sequence as ready', () => {
            const actual = judgeEmailsAgainstContext(
                givenReadyEmails(),
                givenVendorBrief(),
                givenRecipient(),
                givenOpportunity(),
                givenSources(),
            )

            expect(actual).toEqual({
                overallVerdict: 'ready',
                overallSummary:
                    'All emails are grounded in the actual vendor, recipient, opportunity, and sourced research.',
                gaps: [],
                byEmail: [
                    {
                        emailNumber: 1,
                        verdict: 'ready',
                        summary: 'Aligned to vendor, recipient, opportunity, and research context.',
                        checks: [
                            {
                                id: 'vendor-context',
                                label: 'Uses the actual vendor opportunity context',
                                passed: true,
                                evidence: 'harborline',
                            },
                            {
                                id: 'recipient-context',
                                label: 'Explains why the company and person appear relevant',
                                passed: true,
                                evidence: 'Example Consulting + Jane',
                            },
                            {
                                id: 'opportunity-context',
                                label: 'References the researched partnership opportunity',
                                passed: true,
                                evidence: 'private',
                            },
                            {
                                id: 'research-grounding',
                                label: 'Grounded in cited research evidence when relevant',
                                passed: true,
                                evidence: 'Not required for this email step',
                            },
                            {
                                id: 'intro',
                                label: 'Opens with a short intro',
                                passed: true,
                                evidence: "i'm reaching out",
                            },
                            {
                                id: 'value-proposition',
                                label: 'States a partner value proposition',
                                passed: true,
                                evidence: 'equips partners + private',
                            },
                            {
                                id: 'concise',
                                label: 'Stays to 3 or 4 sentences',
                                passed: true,
                                evidence: '3 sentences',
                            },
                            {
                                id: 'new-information',
                                label: 'Adds useful new information versus previous emails',
                                passed: true,
                                evidence: 'Not required for this email step',
                            },
                            {
                                id: 'clear-next-step',
                                label: 'Asks if they are free for a chat',
                                passed: true,
                                evidence: 'chat + question',
                            },
                            {
                                id: 'no-generic-follow-up',
                                label: 'Avoids generic follow-ups such as just checking in or bumping this',
                                passed: true,
                                evidence: 'No generic follow-up phrasing',
                            },
                            {
                                id: 'no-canned-opener',
                                label: 'Avoids repeating You can as the email opener',
                                passed: true,
                                evidence: 'No canned You can opener',
                            },
                            {
                                id: 'no-souk-mention',
                                label: 'Does not mention Souk',
                                passed: true,
                                evidence: 'No Souk mention',
                            },
                            {
                                id: 'low-friction-close',
                                label: 'Ends with a respectful low-friction close',
                                passed: true,
                                evidence: 'Not required for this email step',
                            },
                            {
                                id: 'fit-personalisation',
                                label: 'Personalisation explains fit rather than unrelated personal facts',
                                passed: true,
                                evidence: 'No unrelated personal facts',
                            },
                        ],
                    },
                    {
                        emailNumber: 2,
                        verdict: 'ready',
                        summary: 'Aligned to vendor, recipient, opportunity, and research context.',
                        checks: [
                            {
                                id: 'vendor-context',
                                label: 'Uses the actual vendor opportunity context',
                                passed: true,
                                evidence: 'harborline',
                            },
                            {
                                id: 'recipient-context',
                                label: 'Targets the real recipient or company',
                                passed: true,
                                evidence: 'Example Consulting',
                            },
                            {
                                id: 'opportunity-context',
                                label: 'References the researched partnership opportunity',
                                passed: true,
                                evidence: 'private',
                            },
                            {
                                id: 'research-grounding',
                                label: 'Grounded in cited research evidence for this prospect',
                                passed: true,
                                evidence: 'https://example.com/guide',
                            },
                            {
                                id: 'intro',
                                label: 'Opens with a short intro',
                                passed: true,
                                evidence: 'i noticed',
                            },
                            {
                                id: 'value-proposition',
                                label: 'States a partner value proposition',
                                passed: true,
                                evidence: 'equips partners + private',
                            },
                            {
                                id: 'concise',
                                label: 'Stays to 3 or 4 sentences',
                                passed: true,
                                evidence: '3 sentences',
                            },
                            {
                                id: 'new-information',
                                label: 'Adds useful new information versus previous emails',
                                passed: true,
                                evidence: 'noticed',
                            },
                            {
                                id: 'clear-next-step',
                                label: 'Asks if they are free for a chat',
                                passed: true,
                                evidence: 'chat + question',
                            },
                            {
                                id: 'no-generic-follow-up',
                                label: 'Avoids generic follow-ups such as just checking in or bumping this',
                                passed: true,
                                evidence: 'No generic follow-up phrasing',
                            },
                            {
                                id: 'no-canned-opener',
                                label: 'Avoids repeating You can as the email opener',
                                passed: true,
                                evidence: 'No canned You can opener',
                            },
                            {
                                id: 'no-souk-mention',
                                label: 'Does not mention Souk',
                                passed: true,
                                evidence: 'No Souk mention',
                            },
                            {
                                id: 'low-friction-close',
                                label: 'Ends with a respectful low-friction close',
                                passed: true,
                                evidence: 'Not required for this email step',
                            },
                            {
                                id: 'fit-personalisation',
                                label: 'Personalisation explains fit rather than unrelated personal facts',
                                passed: true,
                                evidence: 'No unrelated personal facts',
                            },
                        ],
                    },
                    {
                        emailNumber: 3,
                        verdict: 'ready',
                        summary: 'Aligned to vendor, recipient, opportunity, and research context.',
                        checks: [
                            {
                                id: 'vendor-context',
                                label: 'Uses the actual vendor opportunity context',
                                passed: true,
                                evidence: 'harborline',
                            },
                            {
                                id: 'recipient-context',
                                label: 'Targets the real recipient or company',
                                passed: true,
                                evidence: 'Jane',
                            },
                            {
                                id: 'opportunity-context',
                                label: 'References the researched partnership opportunity',
                                passed: true,
                                evidence: 'private',
                            },
                            {
                                id: 'research-grounding',
                                label: 'Grounded in cited research evidence for this prospect',
                                passed: true,
                                evidence: 'https://example.com/guide',
                            },
                            {
                                id: 'intro',
                                label: 'Opens with a short intro',
                                passed: true,
                                evidence: 'i noticed',
                            },
                            {
                                id: 'value-proposition',
                                label: 'States a partner value proposition',
                                passed: true,
                                evidence: 'equips partners + private',
                            },
                            {
                                id: 'concise',
                                label: 'Stays to 3 or 4 sentences',
                                passed: true,
                                evidence: '3 sentences',
                            },
                            {
                                id: 'new-information',
                                label: 'Adds useful new information versus previous emails',
                                passed: true,
                                evidence: 'another',
                            },
                            {
                                id: 'clear-next-step',
                                label: 'Asks if they are free for a chat',
                                passed: true,
                                evidence: 'chat + question',
                            },
                            {
                                id: 'no-generic-follow-up',
                                label: 'Avoids generic follow-ups such as just checking in or bumping this',
                                passed: true,
                                evidence: 'No generic follow-up phrasing',
                            },
                            {
                                id: 'no-canned-opener',
                                label: 'Avoids repeating You can as the email opener',
                                passed: true,
                                evidence: 'No canned You can opener',
                            },
                            {
                                id: 'no-souk-mention',
                                label: 'Does not mention Souk',
                                passed: true,
                                evidence: 'No Souk mention',
                            },
                            {
                                id: 'low-friction-close',
                                label: 'Ends with a respectful low-friction close',
                                passed: true,
                                evidence: 'Not required for this email step',
                            },
                            {
                                id: 'fit-personalisation',
                                label: 'Personalisation explains fit rather than unrelated personal facts',
                                passed: true,
                                evidence: 'No unrelated personal facts',
                            },
                        ],
                    },
                    {
                        emailNumber: 4,
                        verdict: 'ready',
                        summary: 'Aligned to vendor, recipient, opportunity, and research context.',
                        checks: [
                            {
                                id: 'vendor-context',
                                label: 'Uses the actual vendor opportunity context',
                                passed: true,
                                evidence: 'harborline',
                            },
                            {
                                id: 'recipient-context',
                                label: 'Targets the real recipient or company',
                                passed: true,
                                evidence: 'Example Consulting',
                            },
                            {
                                id: 'opportunity-context',
                                label: 'References the researched partnership opportunity',
                                passed: true,
                                evidence: 'private',
                            },
                            {
                                id: 'research-grounding',
                                label: 'Grounded in cited research evidence for this prospect',
                                passed: true,
                                evidence: 'https://example.com/guide',
                            },
                            {
                                id: 'intro',
                                label: 'Opens with a short intro',
                                passed: true,
                                evidence: 'i noticed',
                            },
                            {
                                id: 'value-proposition',
                                label: 'States a partner value proposition',
                                passed: true,
                                evidence: 'equips partners + private',
                            },
                            {
                                id: 'concise',
                                label: 'Stays to 3 or 4 sentences',
                                passed: true,
                                evidence: '4 sentences',
                            },
                            {
                                id: 'new-information',
                                label: 'Adds useful new information versus previous emails',
                                passed: true,
                                evidence: 'still',
                            },
                            {
                                id: 'clear-next-step',
                                label: 'Asks if they are free for a chat',
                                passed: true,
                                evidence: 'chat + question',
                            },
                            {
                                id: 'no-generic-follow-up',
                                label: 'Avoids generic follow-ups such as just checking in or bumping this',
                                passed: true,
                                evidence: 'No generic follow-up phrasing',
                            },
                            {
                                id: 'no-canned-opener',
                                label: 'Avoids repeating You can as the email opener',
                                passed: true,
                                evidence: 'No canned You can opener',
                            },
                            {
                                id: 'no-souk-mention',
                                label: 'Does not mention Souk',
                                passed: true,
                                evidence: 'No Souk mention',
                            },
                            {
                                id: 'low-friction-close',
                                label: 'Ends with a respectful low-friction close',
                                passed: true,
                                evidence: 'if this is not',
                            },
                            {
                                id: 'fit-personalisation',
                                label: 'Personalisation explains fit rather than unrelated personal facts',
                                passed: true,
                                evidence: 'No unrelated personal facts',
                            },
                        ],
                    },
                ],
            })
        })

        it('should match a short vendor name such as Deel', () => {
            const emails = givenReadyEmails().map((email) => email.replaceAll('Harborline', 'Deel'))
            const actual = judgeEmailsAgainstContext(
                emails,
                givenVendorBrief({ vendorName: 'Deel' }),
                givenRecipient(),
                givenOpportunity(),
                givenSources(),
            )

            expect(actual.overallVerdict).toEqual('ready')
            expect(actual.byEmail[0].checks[0]).toEqual({
                id: 'vendor-context',
                label: 'Uses the actual vendor opportunity context',
                passed: true,
                evidence: 'deel',
            })
        })

        it('should patch a missing source url into email 3', () => {
            const emails = givenReadyEmails()
            emails[2] = `Subject: Example Consulting delivery
Hi Jane,
I'm reaching out about another private-AI note around introductions.
Harborline's private AI runtime gives partners implementation revenue on that delivery work.
Are you free for a conversation?
Harborline`

            const actual = applyEmailJudgementPatches(
                emails,
                givenVendorBrief(),
                givenRecipient(),
                givenOpportunity(),
                givenSources(),
            )

            expect(actual[2]).toEqual(`Subject: Example Consulting delivery
Hi Jane,
I'm reaching out about another private-AI note around introductions.
Harborline's private AI runtime gives partners implementation revenue on that delivery work.
Are you free for a conversation?
https://example.com/guide
Harborline`)
            expect(
                judgeEmailsAgainstContext(
                    actual,
                    givenVendorBrief(),
                    givenRecipient(),
                    givenOpportunity(),
                    givenSources(),
                ).overallVerdict,
            ).toEqual('ready')
        })

        it('should not invent a source url when none exist', () => {
            const emails = givenReadyEmails()
            emails[2] = `Subject: Example Consulting delivery
Hi Jane,
I'm reaching out about another private-AI note around introductions.
Harborline's private AI runtime gives partners implementation revenue on that delivery work.
Are you free for a conversation?
Harborline`

            const actual = applyEmailJudgementPatches(
                emails,
                givenVendorBrief(),
                givenRecipient(),
                givenOpportunity(),
                [],
            )

            expect(actual[2]).toEqual(emails[2])
            expect(
                judgeEmailsAgainstContext(actual, givenVendorBrief(), givenRecipient(), givenOpportunity(), []).gaps,
            ).toEqual([
                'Email 2: Grounded in cited research evidence for this prospect',
                'Email 3: Grounded in cited research evidence for this prospect',
                'Email 4: Grounded in cited research evidence for this prospect',
            ])
        })

        it('should patch an easy decline into email 4', () => {
            const emails = givenReadyEmails()
            emails[3] = `Subject: Example Consulting chat
Hi Jane,
I'm reaching out with one last note from https://example.com/guide: this still looks like a credible path for Example Consulting and Harborline.
Harborline's private AI runtime gives partners implementation revenue if you want to take this further.
Are you free for a 15-minute call?
Harborline`

            const actual = applyEmailJudgementPatches(
                emails,
                givenVendorBrief(),
                givenRecipient(),
                givenOpportunity(),
                givenSources(),
            )

            expect(actual[3]).toEqual(`Subject: Example Consulting chat
Hi Jane,
I'm reaching out with one last note from https://example.com/guide: this still looks like a credible path for Example Consulting and Harborline.
Harborline's private AI runtime gives partners implementation revenue if you want to take this further.
Are you free for a 15-minute call?
If this is not a priority, a no is completely fine.
Harborline`)
        })

        it('should leave a ready sequence unchanged', () => {
            const emails = givenReadyEmails()

            expect(
                applyEmailJudgementPatches(
                    emails,
                    givenVendorBrief(),
                    givenRecipient(),
                    givenOpportunity(),
                    givenSources(),
                ),
            ).toEqual(emails)
        })

        it('should rewrite a You can opener', () => {
            const emails = givenReadyEmails()
            emails[0] = `Subject: Harborline and Example Consulting
Hi Jane,
You can expand Example Consulting's offering.
I'm reaching out because Jane leads partner recruitment for regulated delivery.
Harborline's private AI runtime gives partners implementation revenue on that work.
Are you free for a chat?
Harborline`

            const actual = applyEmailJudgementPatches(
                emails,
                givenVendorBrief(),
                givenRecipient(),
                givenOpportunity(),
                givenSources(),
            )

            expect(actual[0]).toEqual(`Subject: Harborline and Example Consulting
Hi Jane,
Expand Example Consulting's offering.
I'm reaching out because Jane leads partner recruitment for regulated delivery.
Harborline's private AI runtime gives partners implementation revenue on that work.
Are you free for a chat?
Harborline`)
        })

        it('should patch a missing intro', () => {
            const emails = givenReadyEmails()
            emails[0] = `Subject: Harborline and Example Consulting
Hi Jane,
Example Consulting implements private AI for banks, and Jane leads partner recruitment.
Harborline's private AI runtime gives partners implementation revenue on that work.
Are you free for a chat?
Harborline`

            const actual = applyEmailJudgementPatches(
                emails,
                givenVendorBrief(),
                givenRecipient(),
                givenOpportunity(),
                givenSources(),
            )

            expect(actual[0]).toEqual(`Subject: Harborline and Example Consulting
Hi Jane,
Example Consulting implements private AI for banks, and Jane leads partner recruitment.
Harborline's private AI runtime gives partners implementation revenue on that work.
Are you free for a chat?
I'm reaching out as you lead Head of Partnerships at Example Consulting.
Harborline`)
        })

        it('should patch a missing value proposition', () => {
            const emails = givenReadyEmails()
            emails[0] = `Subject: Harborline and Example Consulting
Hi Jane,
I'm reaching out because Example Consulting implements private AI for banks, and Jane leads partner recruitment for regulated delivery.
I'd like to talk about a Harborline partnership.
Are you free for a chat?
Harborline`

            const actual = applyEmailJudgementPatches(
                emails,
                givenVendorBrief(),
                givenRecipient(),
                givenOpportunity(),
                givenSources(),
            )

            expect(actual[0]).toEqual(`Subject: Harborline and Example Consulting
Hi Jane,
I'm reaching out because Example Consulting implements private AI for banks, and Jane leads partner recruitment for regulated delivery.
I'd like to talk about a Harborline partnership.
Are you free for a chat?
Harborline equips partners to offer Private AI runtime.
Harborline`)
        })
    })
})

describe('explainEmailImprovement unit tests', () => {
    describe('error handling', () => {
        it('should classify missing people as a discovery problem', () => {
            const empty = judgeEmailsAgainstContext(
                ['', '', '', ''],
                givenVendorBrief(),
                { name: '', companyName: '', position: '' },
                { companyFit: '', personFit: '', selectedSignal: '' },
                [],
            )
            const recipient = { name: '', companyName: '', position: '' }

            expect(explainEmailImprovement(empty, empty, recipient, givenOpportunity(), givenSources())).toEqual({
                problemSource: 'discovery',
                problemSourceWhy: 'Discovery did not return a usable recipient. Name: missing. Company: missing.',
                weakInFirst:
                    'The first snapshot did not use enough of the actual vendor, recipient, opportunity, or sourced research.',
                whatChanged: 'The rewrite did not fix the first-snapshot gaps.',
                howImproved:
                    'The final snapshot is still missing some vendor, recipient, opportunity, or sourced research.',
                fixedGaps: [],
                remainingGaps: empty.gaps,
            })
        })

        it('should classify missing fit research as an enrichment problem', () => {
            const opportunity = { companyFit: '', personFit: '', selectedSignal: '' }
            const empty = judgeEmailsAgainstContext(
                ['', '', '', ''],
                givenVendorBrief(),
                givenRecipient(),
                opportunity,
                [],
            )

            expect(explainEmailImprovement(empty, empty, givenRecipient(), opportunity, [])).toEqual({
                problemSource: 'enrichment',
                problemSourceWhy:
                    'Enrichment did not return enough research to ground the emails. Company fit: missing. Person fit: missing. Sources: 0.',
                weakInFirst:
                    'The first snapshot did not use enough of the actual vendor, recipient, opportunity, or sourced research.',
                whatChanged: 'The rewrite did not fix the first-snapshot gaps.',
                howImproved:
                    'The final snapshot is still missing some vendor, recipient, opportunity, or sourced research.',
                fixedGaps: [],
                remainingGaps: empty.gaps,
            })
        })

        it('should classify a missing selected signal as a signal-selection problem', () => {
            const opportunity = {
                companyFit: 'Example Consulting implements private AI for banks',
                personFit: '',
                selectedSignal: '',
            }
            const empty = judgeEmailsAgainstContext(
                ['', '', '', ''],
                givenVendorBrief(),
                givenRecipient(),
                opportunity,
                givenSources(),
            )

            expect(explainEmailImprovement(empty, empty, givenRecipient(), opportunity, givenSources())).toEqual({
                problemSource: 'signal-selection',
                problemSourceWhy:
                    'Signal selection did not produce a usable partnership signal. Selected signal: missing.',
                weakInFirst:
                    'The first snapshot did not use enough of the actual vendor, recipient, opportunity, or sourced research.',
                whatChanged: 'The rewrite did not fix the first-snapshot gaps.',
                howImproved:
                    'The final snapshot is still missing some vendor, recipient, opportunity, or sourced research.',
                fixedGaps: [],
                remainingGaps: empty.gaps,
            })
        })
    })

    describe('success', () => {
        it('should treat a Souk mention as a writing problem that the rewrite fixed', () => {
            const firstEmails = givenReadyEmails()
            firstEmails[0] = firstEmails[0].replace(
                "I'm reaching out as you lead partner recruitment at Example Consulting",
                "I'm reaching out from Souk as you lead partner recruitment at Example Consulting",
            )
            const first = judgeEmailsAgainstContext(
                firstEmails,
                givenVendorBrief(),
                givenRecipient(),
                givenOpportunity(),
                givenSources(),
            )
            const final = judgeEmailsAgainstContext(
                givenReadyEmails(),
                givenVendorBrief(),
                givenRecipient(),
                givenOpportunity(),
                givenSources(),
            )

            expect(first.gaps).toEqual(['Email 1: Does not mention Souk'])
            expect(explainEmailImprovement(first, final, givenRecipient(), givenOpportunity(), givenSources())).toEqual(
                {
                    problemSource: 'writing',
                    problemSourceWhy:
                        'Discovery had Jane Partner at Example Consulting. Enrichment returned 1 source. Signal selection had a selected signal. The remaining gaps were in the email writing, not in finding or researching the prospect.',
                    weakInFirst:
                        'The first snapshot did not use enough of the actual vendor, recipient, opportunity, or sourced research.',
                    whatChanged: 'The rewrite used more of the vendor, recipient, opportunity, and sourced research.',
                    howImproved:
                        'The final snapshot is grounded in the actual vendor, recipient, opportunity, and sourced research.',
                    fixedGaps: ['Email 1: Does not mention Souk'],
                    remainingGaps: [],
                },
            )
        })

        it('should keep the same grounded checks if first and final already pass', () => {
            const ready = judgeEmailsAgainstContext(
                givenReadyEmails(),
                givenVendorBrief(),
                givenRecipient(),
                givenOpportunity(),
                givenSources(),
            )

            expect(explainEmailImprovement(ready, ready, givenRecipient(), givenOpportunity(), givenSources())).toEqual(
                {
                    problemSource: 'writing',
                    problemSourceWhy:
                        'Discovery had Jane Partner at Example Consulting. Enrichment returned 1 source. Signal selection had a selected signal. The remaining gaps were in the email writing, not in finding or researching the prospect.',
                    weakInFirst:
                        'The first snapshot already used the actual vendor, recipient, opportunity, and sourced research.',
                    whatChanged: 'The rewrite kept the same grounded checks.',
                    howImproved:
                        'The final snapshot is grounded in the actual vendor, recipient, opportunity, and sourced research.',
                    fixedGaps: [],
                    remainingGaps: [],
                },
            )
        })
    })
})
