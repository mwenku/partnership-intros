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
                },
            ])
        })
    })
})
