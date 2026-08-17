import { mapProspects } from '../../../../src/utils/mapProspects'

function givenPersonItem(): Record<string, unknown> {
    return {
        id: 'item_1',
        properties: {
            url: 'https://example.com/jane',
            person: {
                name: 'Jane Partner',
                position: 'Head of Partnerships',
                location: 'London, UK',
                pictureUrl: 'https://example.com/jane.png',
            },
        },
        evaluations: [
            {
                criterion: 'UK consultancy',
                satisfied: 'yes',
                reasoning: 'Works at a UK consultancy',
                references: [{ title: 'About', snippet: 'London consultancy', url: 'https://example.com/about' }],
            },
        ],
        enrichments: [
            {
                enrichmentId: 'enr_employer',
                result: ['Example Consulting'],
                references: [{ title: 'Company', url: 'https://example.com' }],
            },
            {
                enrichmentId: 'enr_email',
                result: ['jane@example.com'],
            },
        ],
    }
}

describe('mapProspects unit tests', () => {
    describe('error handling', () => {
        it('should return an empty list if the Webset has no items', () => {
            expect(mapProspects({ enrichments: [], items: { data: [] } })).toEqual([])
        })

        it('should use Unknown when the person name is missing', () => {
            const actual = mapProspects({
                enrichments: [],
                items: { data: [{ id: 'item_missing' }] },
            })

            expect(actual[0].name).toEqual('Unknown')
            expect(actual[0].email).toEqual('')
        })
    })

    describe('success', () => {
        it('should map person profile, evaluations, and enrichments', () => {
            const actual = mapProspects({
                enrichments: [
                    { id: 'enr_employer', metadata: { key: 'employer' } },
                    { id: 'enr_email', metadata: { key: 'email' } },
                ],
                items: { data: [givenPersonItem()] },
            })

            expect(actual).toEqual([
                {
                    id: 'item_1',
                    name: 'Jane Partner',
                    position: 'Head of Partnerships',
                    location: 'London, UK',
                    profileUrl: 'https://example.com/jane',
                    pictureUrl: 'https://example.com/jane.png',
                    companyName: 'Example Consulting',
                    companyWebsite: '',
                    email: 'jane@example.com',
                    companyFit: '',
                    personFit: '',
                    evaluations: [
                        {
                            criterion: 'UK consultancy',
                            satisfied: 'yes',
                            reasoning: 'Works at a UK consultancy',
                            sources: [
                                {
                                    title: 'About',
                                    snippet: 'London consultancy',
                                    url: 'https://example.com/about',
                                },
                            ],
                        },
                    ],
                    signals: [],
                    selectedSignal: '',
                    selectedSignalWhy: '',
                    sources: [
                        {
                            title: 'About',
                            snippet: 'London consultancy',
                            url: 'https://example.com/about',
                        },
                        {
                            title: 'Company',
                            snippet: '',
                            url: 'https://example.com',
                        },
                    ],
                    emailsV1: ['', '', '', ''],
                    emailsV2: ['', '', '', ''],
                    emailJudgementV1: expect.objectContaining({
                        overallVerdict: 'revise',
                    }),
                    emailJudgement: expect.objectContaining({
                        overallVerdict: 'revise',
                        byEmail: expect.arrayContaining([
                            expect.objectContaining({ emailNumber: 1, verdict: 'revise' }),
                            expect.objectContaining({ emailNumber: 2, verdict: 'revise' }),
                            expect.objectContaining({ emailNumber: 3, verdict: 'revise' }),
                            expect.objectContaining({ emailNumber: 4, verdict: 'revise' }),
                        ]),
                    }),
                    emailImprovement: expect.objectContaining({
                        problemSource: 'enrichment',
                    }),
                },
            ])
        })

        it('should preserve first and final email snapshots for the same person', () => {
            const item = givenPersonItem()
            const actual = mapProspects({
                enrichments: [
                    { id: 'enr_employer', metadata: { key: 'employer' } },
                    { id: 'enr_email', metadata: { key: 'email' } },
                    { id: 'enr_v1', metadata: { key: 'emailsV1' } },
                    { id: 'enr_v2', metadata: { key: 'emailsV2' } },
                ],
                items: {
                    data: [
                        {
                            ...item,
                            enrichments: [
                                ...(item.enrichments as object[]),
                                {
                                    enrichmentId: 'enr_v1',
                                    result: [
                                        'EMAIL 1\nFirst snapshot for Jane\n\nEMAIL 2\nSecond first-draft note\n\nEMAIL 3\nThird first-draft note\n\nEMAIL 4\nFourth first-draft note',
                                    ],
                                },
                                {
                                    enrichmentId: 'enr_v2',
                                    result: [
                                        'EMAIL 1\nFinal snapshot for Jane\n\nEMAIL 2\nSecond final-draft note\n\nEMAIL 3\nThird final-draft note\n\nEMAIL 4\nFourth final-draft note',
                                    ],
                                },
                            ],
                        },
                    ],
                },
            })

            expect(actual[0].emailsV1).toEqual([
                'First snapshot for Jane',
                'Second first-draft note',
                'Third first-draft note',
                'Fourth first-draft note',
            ])
            expect(actual[0].emailsV2).toEqual([
                'Final snapshot for Jane',
                'Second final-draft note',
                'Third final-draft note',
                'Fourth final-draft note',
            ])
            expect(actual[0].emailJudgementV1.gaps).not.toEqual([])
            expect(actual[0].emailJudgement.gaps).not.toEqual([])
        })

        it('should keep the first snapshot as the final judgement if the rewrite is missing', () => {
            const item = givenPersonItem()
            const actual = mapProspects({
                enrichments: [
                    { id: 'enr_employer', metadata: { key: 'employer' } },
                    { id: 'enr_email', metadata: { key: 'email' } },
                    { id: 'enr_v1', metadata: { key: 'emailsV1' } },
                ],
                items: {
                    data: [
                        {
                            ...item,
                            enrichments: [
                                ...(item.enrichments as object[]),
                                {
                                    enrichmentId: 'enr_v1',
                                    result: [
                                        'EMAIL 1\nFirst snapshot for Jane\n\nEMAIL 2\nSecond first-draft note\n\nEMAIL 3\nThird first-draft note\n\nEMAIL 4\nFourth first-draft note',
                                    ],
                                },
                            ],
                        },
                    ],
                },
            })

            expect(actual[0].emailsV1).toEqual([
                'First snapshot for Jane',
                'Second first-draft note',
                'Third first-draft note',
                'Fourth first-draft note',
            ])
            expect(actual[0].emailsV2).toEqual(['', '', '', ''])
            expect(actual[0].emailJudgement).toEqual(actual[0].emailJudgementV1)
            expect(actual[0].emailImprovement.fixedGaps).toEqual([])
        })
    })
})
