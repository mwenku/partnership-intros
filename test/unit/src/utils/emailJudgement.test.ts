import { applyEmailJudgementPatches, judgeEmailsAgainstContext } from '../../../../src/utils/emailJudgement'
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
        `Subject: Partner motion with Harborline for Example Consulting
Hi Jane,
I'd like to introduce a partnership with Harborline. Harborline offers a private AI runtime, and we recruit UK implementation partners.
Example Consulting implements private AI for banks, and Jane leads partner recruitment for regulated delivery.
Partners gain implementation revenue with regulated UK companies.
Would a 15-minute call be useful to explore fit?
Harborline`,
        `Subject: Why Example Consulting maps to Harborline
Hi Jane,
The public proof point is https://example.com/guide.
That private-AI implementation guide for insurers is why a Harborline partnership fits Example Consulting.
The gain for you is implementation revenue.
Would you like to discuss this on a short call?
Harborline`,
        `Subject: What a Harborline partner actually does
Hi Jane,
The partner contributes introductions and delivery. The gain is implementation revenue for regulated UK companies.
That maps to the same motion in https://example.com/guide.
Would it be worth a conversation to review the first 90 days?
Harborline`,
        `Subject: Should we explore a Harborline partnership?
Hi Jane,
Last useful note from https://example.com/guide: this still looks like a credible path for Example Consulting and Harborline.
The gain for you is implementation revenue.
If this is not a priority, a no is fine.
Would you prefer a 15-minute call, or should we close this out?
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
                'Email 1: States what the partner gains from this partnership',
                'Email 1: Contains a concrete partner next step',
                'Email 2: Uses the actual vendor opportunity context',
                'Email 2: Targets the real recipient or company',
                'Email 2: References the researched partnership opportunity',
                'Email 2: Grounded in cited research evidence for this prospect',
                'Email 2: States what the partner gains from this partnership',
                'Email 2: Adds useful new information versus previous emails',
                'Email 2: Contains a concrete partner next step',
                'Email 3: Uses the actual vendor opportunity context',
                'Email 3: Targets the real recipient or company',
                'Email 3: References the researched partnership opportunity',
                'Email 3: Grounded in cited research evidence for this prospect',
                'Email 3: States what the partner gains from this partnership',
                'Email 3: Adds useful new information versus previous emails',
                'Email 3: Contains a concrete partner next step',
                'Email 4: Uses the actual vendor opportunity context',
                'Email 4: Targets the real recipient or company',
                'Email 4: References the researched partnership opportunity',
                'Email 4: Grounded in cited research evidence for this prospect',
                'Email 4: States what the partner gains from this partnership',
                'Email 4: Adds useful new information versus previous emails',
                'Email 4: Contains a concrete partner next step',
                'Email 4: Ends with a respectful low-friction close',
            ])
        })

        it('should fail a generic follow-up and a Souk mention', () => {
            const emails = givenReadyEmails()
            emails[0] = `Subject: Partner motion with Harborline for Example Consulting
Hi Jane,
I'm writing from Souk on behalf of Harborline. Harborline offers a private AI runtime, and we recruit UK implementation partners.
Example Consulting implements private AI for banks, and Jane leads partner recruitment for regulated delivery.
Partners gain implementation revenue with regulated UK companies.
Would a 15-minute call be useful to explore fit?
Souk, on behalf of Harborline`
            emails[1] = `Subject: Checking in
Hi Jane,
Just checking in on Harborline for Example Consulting.
The gain for you is implementation revenue.
https://example.com/guide
Would a call help?
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
            emails[0] = `Subject: Partner motion with Harborline for Example Consulting
Hi there,
I'd like to introduce a partnership with Harborline. Harborline offers a private AI runtime.
Example Consulting implements private AI for banks.
Partners gain implementation revenue with regulated UK companies.
Would a 15-minute call be useful to explore fit?
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
            emails[3] = `Subject: Should we explore a Harborline partnership?
Hi Jane,
Last useful note from https://example.com/guide: this still looks like a credible path for Example Consulting and Harborline.
Would you prefer a 15-minute call?
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
            emails[3] = `Subject: Should we explore a Harborline partnership?
Hi Jane,
Last useful note from https://example.com/guide: this still looks like a credible path for Example Consulting and Harborline.
If this isn't relevant, please say so.
Would you prefer a 15-minute call, or should we close this out?
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
            emails[0] = `${emails[0]}
Congrats on the university hobby.`

            const actual = judgeEmailsAgainstContext(
                emails,
                givenVendorBrief(),
                givenRecipient(),
                givenOpportunity(),
                givenSources(),
            )

            expect(actual.overallVerdict).toEqual('revise')
            expect(actual.gaps).toEqual([
                'Email 1: Personalisation explains fit rather than unrelated personal facts',
            ])
        })

        it('should fail email 1 if partner value is missing', () => {
            const emails = givenReadyEmails()
            emails[0] = `Subject: Partner motion with Harborline for Example Consulting
Hi Jane,
I'd like to introduce a partnership with Harborline. Harborline offers a private AI runtime.
Example Consulting implements private AI for banks, and Jane leads partner recruitment.
Would a 15-minute call be useful to explore fit?
Harborline`

            const actual = judgeEmailsAgainstContext(
                emails,
                givenVendorBrief(),
                givenRecipient(),
                givenOpportunity(),
                givenSources(),
            )

            expect(actual.overallVerdict).toEqual('revise')
            expect(actual.gaps).toEqual(['Email 1: States what the partner gains from this partnership'])
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
                                id: 'partner-value',
                                label: 'States what the partner gains from this partnership',
                                passed: true,
                                evidence: 'implementation',
                            },
                            {
                                id: 'new-information',
                                label: 'Adds useful new information versus previous emails',
                                passed: true,
                                evidence: 'Not required for this email step',
                            },
                            {
                                id: 'clear-next-step',
                                label: 'Contains a concrete partner next step',
                                passed: true,
                                evidence: 'call + question',
                            },
                            {
                                id: 'no-generic-follow-up',
                                label: 'Avoids generic follow-ups such as just checking in or bumping this',
                                passed: true,
                                evidence: 'No generic follow-up phrasing',
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
                                id: 'partner-value',
                                label: 'States what the partner gains from this partnership',
                                passed: true,
                                evidence: 'implementation',
                            },
                            {
                                id: 'new-information',
                                label: 'Adds useful new information versus previous emails',
                                passed: true,
                                evidence: 'public',
                            },
                            {
                                id: 'clear-next-step',
                                label: 'Contains a concrete partner next step',
                                passed: true,
                                evidence: 'call + question',
                            },
                            {
                                id: 'no-generic-follow-up',
                                label: 'Avoids generic follow-ups such as just checking in or bumping this',
                                passed: true,
                                evidence: 'No generic follow-up phrasing',
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
                                evidence: 'implementation',
                            },
                            {
                                id: 'research-grounding',
                                label: 'Grounded in cited research evidence for this prospect',
                                passed: true,
                                evidence: 'https://example.com/guide',
                            },
                            {
                                id: 'partner-value',
                                label: 'States what the partner gains from this partnership',
                                passed: true,
                                evidence: 'implementation',
                            },
                            {
                                id: 'new-information',
                                label: 'Adds useful new information versus previous emails',
                                passed: true,
                                evidence: 'contributes',
                            },
                            {
                                id: 'clear-next-step',
                                label: 'Contains a concrete partner next step',
                                passed: true,
                                evidence: 'conversation + question',
                            },
                            {
                                id: 'no-generic-follow-up',
                                label: 'Avoids generic follow-ups such as just checking in or bumping this',
                                passed: true,
                                evidence: 'No generic follow-up phrasing',
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
                                evidence: 'guide',
                            },
                            {
                                id: 'research-grounding',
                                label: 'Grounded in cited research evidence for this prospect',
                                passed: true,
                                evidence: 'https://example.com/guide',
                            },
                            {
                                id: 'partner-value',
                                label: 'States what the partner gains from this partnership',
                                passed: true,
                                evidence: 'implementation',
                            },
                            {
                                id: 'new-information',
                                label: 'Adds useful new information versus previous emails',
                                passed: true,
                                evidence: 'still',
                            },
                            {
                                id: 'clear-next-step',
                                label: 'Contains a concrete partner next step',
                                passed: true,
                                evidence: 'call + question',
                            },
                            {
                                id: 'no-generic-follow-up',
                                label: 'Avoids generic follow-ups such as just checking in or bumping this',
                                passed: true,
                                evidence: 'No generic follow-up phrasing',
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
            emails[2] = `Subject: What a Harborline partner actually does
Hi Jane,
The partner contributes introductions and delivery. The gain is implementation revenue for regulated UK companies.
Would it be worth a conversation to review the first 90 days?
Harborline`

            const actual = applyEmailJudgementPatches(
                emails,
                givenVendorBrief(),
                givenRecipient(),
                givenOpportunity(),
                givenSources(),
            )

            expect(actual[2]).toEqual(`Subject: What a Harborline partner actually does
Hi Jane,
The partner contributes introductions and delivery. The gain is implementation revenue for regulated UK companies.
Would it be worth a conversation to review the first 90 days?
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
            emails[2] = `Subject: What a Harborline partner actually does
Hi Jane,
The partner contributes introductions and delivery. The gain is implementation revenue for regulated UK companies.
Would it be worth a conversation to review the first 90 days?
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
                judgeEmailsAgainstContext(
                    actual,
                    givenVendorBrief(),
                    givenRecipient(),
                    givenOpportunity(),
                    [],
                ).gaps,
            ).toEqual([
                'Email 2: Grounded in cited research evidence for this prospect',
                'Email 3: Grounded in cited research evidence for this prospect',
                'Email 4: Grounded in cited research evidence for this prospect',
            ])
        })

        it('should patch an easy decline into email 4', () => {
            const emails = givenReadyEmails()
            emails[3] = `Subject: Should we explore a Harborline partnership?
Hi Jane,
Last useful note from https://example.com/guide: this still looks like a credible path for Example Consulting and Harborline.
The gain for you is implementation revenue.
Would you prefer a 15-minute call?
Harborline`

            const actual = applyEmailJudgementPatches(
                emails,
                givenVendorBrief(),
                givenRecipient(),
                givenOpportunity(),
                givenSources(),
            )

            expect(actual[3]).toEqual(`Subject: Should we explore a Harborline partnership?
Hi Jane,
Last useful note from https://example.com/guide: this still looks like a credible path for Example Consulting and Harborline.
The gain for you is implementation revenue.
Would you prefer a 15-minute call?
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
    })
})
