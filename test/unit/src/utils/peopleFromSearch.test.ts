import {
    companyNameFromResult,
    emailQueryForPerson,
    emailsFromText,
    globalPeopleQuery,
    hostFromUrl,
    looksLikeCompanyWebsite,
    looksLikePersonName,
    parsePersonFromTitle,
    peopleFromHitList,
    peopleQueryForCompany,
    pickBestPersonFromResults,
    selectWorkEmail,
    uniqueByCompany,
} from '../../../../src/utils/peopleFromSearch'

function givenLinkedInResult(overrides: { title?: string; url?: string; content?: string } = {}): {
    title: string
    url: string
    content: string
} {
    return {
        title: 'Jane Smith - Head of Partnerships - Example Consulting | LinkedIn',
        url: 'https://www.linkedin.com/in/jane-smith',
        content: 'Jane Smith is Head of Partnerships at Example Consulting in London.',
        ...overrides,
    }
}

function givenCompanyResult(overrides: { title?: string; url?: string; content?: string } = {}): {
    title: string
    url: string
    content: string
} {
    return {
        title: 'Example Consulting',
        url: 'https://example-consulting.com',
        content: 'A UK consultancy implementing payroll for international hiring.',
        ...overrides,
    }
}

describe('peopleFromSearch unit tests', () => {
    describe('hostFromUrl error handling', () => {
        it('should return an empty string if the url is invalid', () => {
            expect(hostFromUrl('not-a-url')).toEqual('')
        })
    })

    describe('hostFromUrl success', () => {
        it('should return the hostname without www', () => {
            expect(hostFromUrl('https://www.example-consulting.com/team')).toEqual('example-consulting.com')
        })
    })

    describe('looksLikeCompanyWebsite error handling', () => {
        it('should return false for publisher profile urls', () => {
            expect(looksLikeCompanyWebsite('https://www.linkedin.com/in/jane-smith')).toEqual(false)
        })
    })

    describe('looksLikeCompanyWebsite success', () => {
        it('should return true for a company website', () => {
            expect(looksLikeCompanyWebsite('https://example-consulting.com')).toEqual(true)
        })
    })

    describe('companyNameFromResult error handling', () => {
        it('should use the hostname if the title is empty', () => {
            expect(
                companyNameFromResult({
                    title: '',
                    url: 'https://www.example-consulting.com',
                    content: '',
                }),
            ).toEqual('example-consulting.com')
        })
    })

    describe('companyNameFromResult success', () => {
        it('should use the title before a pipe', () => {
            expect(
                companyNameFromResult({
                    title: 'Example Consulting | Professional services',
                    url: 'https://example-consulting.com',
                    content: '',
                }),
            ).toEqual('Example Consulting')
        })
    })

    describe('looksLikePersonName error handling', () => {
        it('should return false for company and page titles', () => {
            expect(looksLikePersonName('Example Consulting')).toEqual(false)
            expect(looksLikePersonName('Our Partners')).toEqual(false)
            expect(looksLikePersonName('Leadership')).toEqual(false)
        })
    })

    describe('looksLikePersonName success', () => {
        it('should return true for a first and last name', () => {
            expect(looksLikePersonName('Jane Smith')).toEqual(true)
        })
    })

    describe('parsePersonFromTitle error handling', () => {
        it('should return null for a company page title', () => {
            expect(parsePersonFromTitle('Example Consulting | Professional services')).toEqual(null)
        })

        it('should return null if the title is empty', () => {
            expect(parsePersonFromTitle('')).toEqual(null)
        })
    })

    describe('parsePersonFromTitle success', () => {
        it('should parse a LinkedIn title with dashes', () => {
            expect(parsePersonFromTitle('Jane Smith - Head of Partnerships - Example Consulting | LinkedIn')).toEqual({
                name: 'Jane Smith',
                position: 'Head of Partnerships',
                companyName: 'Example Consulting',
            })
        })

        it('should parse a title with at', () => {
            expect(parsePersonFromTitle('Jane Smith | Head of Alliances at Example Consulting')).toEqual({
                name: 'Jane Smith',
                position: 'Head of Alliances',
                companyName: 'Example Consulting',
            })
        })
    })

    describe('emailsFromText error handling', () => {
        it('should return an empty list if no emails are present', () => {
            expect(emailsFromText('No contact details here')).toEqual([])
        })

        it('should ignore image filenames that look like emails', () => {
            expect(emailsFromText('logo@2x.png and banner@company.jpg')).toEqual([])
        })
    })

    describe('emailsFromText success', () => {
        it('should return unique lowercase emails', () => {
            expect(emailsFromText('Reach Jane at Jane.Smith@example-consulting.com or jane.smith@example-consulting.com')).toEqual([
                'jane.smith@example-consulting.com',
            ])
        })
    })

    describe('selectWorkEmail error handling', () => {
        it('should return an empty string if only generic inboxes are present', () => {
            expect(selectWorkEmail(['info@example-consulting.com', 'hello@example-consulting.com'], 'example-consulting.com', 'Jane Smith')).toEqual(
                '',
            )
        })

        it('should return an empty string if no emails are present', () => {
            expect(selectWorkEmail([], 'example-consulting.com', 'Jane Smith')).toEqual('')
        })
    })

    describe('selectWorkEmail success', () => {
        it('should prefer a named email on the company domain', () => {
            expect(
                selectWorkEmail(
                    ['press@other.com', 'jane.smith@example-consulting.com'],
                    'example-consulting.com',
                    'Jane Smith',
                ),
            ).toEqual('jane.smith@example-consulting.com')
        })
    })

    describe('peopleQueryForCompany success', () => {
        it('should ask for the best partnership contact at the company', () => {
            expect(peopleQueryForCompany('Example Consulting')).toEqual(
                'Best current employee to contact about partnerships at Example Consulting. Prefer Head of Partnerships, Director of Alliances, Business Development Director, or Partner. LinkedIn profile or leadership team page.',
            )
        })
    })

    describe('emailQueryForPerson success', () => {
        it('should ask for the public work email for that person', () => {
            expect(emailQueryForPerson('Jane Smith', 'Example Consulting')).toEqual(
                'Public work email address for Jane Smith at Example Consulting',
            )
        })
    })

    describe('globalPeopleQuery success', () => {
        it('should keep the first line of the original search and ask for partnership leaders', () => {
            expect(globalPeopleQuery('Find partnership leaders at UK consultancies\nVendor: Deel')).toEqual(
                'Find partnership leaders at UK consultancies Head of Partnerships OR Director of Alliances OR Business Development LinkedIn',
            )
        })
    })

    describe('pickBestPersonFromResults error handling', () => {
        it('should return null if results are only company pages', () => {
            expect(pickBestPersonFromResults([givenCompanyResult()], 'Example Consulting', 'https://example-consulting.com')).toEqual(
                null,
            )
        })
    })

    describe('pickBestPersonFromResults success', () => {
        it('should pick the partnership contact over a weaker role', () => {
            const actual = pickBestPersonFromResults(
                [
                    {
                        title: 'Alex Jones - Recruiter - Example Consulting | LinkedIn',
                        url: 'https://www.linkedin.com/in/alex-jones',
                        content: 'Alex Jones is a recruiter in Manchester.',
                    },
                    givenLinkedInResult(),
                ],
                'Example Consulting',
                'https://example-consulting.com',
            )

            expect(actual).toEqual({
                name: 'Jane Smith',
                position: 'Head of Partnerships',
                location: 'London',
                profileUrl: 'https://www.linkedin.com/in/jane-smith',
                pictureUrl: '',
                companyName: 'Example Consulting',
                companyWebsite: 'https://example-consulting.com',
                email: '',
                personFit:
                    'Jane Smith is Head of Partnerships at Example Consulting, so they are a natural owner for a partnership conversation. Source: https://www.linkedin.com/in/jane-smith',
            })
        })

        it('should extract a public work email from the snippet', () => {
            const actual = pickBestPersonFromResults(
                [
                    givenLinkedInResult({
                        content:
                            'Jane Smith is Head of Partnerships at Example Consulting in London. Email jane.smith@example-consulting.com',
                    }),
                ],
                'Example Consulting',
                'https://example-consulting.com',
            )

            expect(actual?.email).toEqual('jane.smith@example-consulting.com')
        })
    })

    describe('peopleFromHitList error handling', () => {
        it('should skip company pages that do not name a person', () => {
            expect(peopleFromHitList([givenCompanyResult()])).toEqual([])
        })
    })

    describe('peopleFromHitList success', () => {
        it('should return people parsed from LinkedIn results', () => {
            const actual = peopleFromHitList([givenLinkedInResult()])

            expect(actual).toEqual([
                {
                    name: 'Jane Smith',
                    position: 'Head of Partnerships',
                    location: 'London',
                    profileUrl: 'https://www.linkedin.com/in/jane-smith',
                    pictureUrl: '',
                    companyName: 'Example Consulting',
                    companyWebsite: '',
                    email: '',
                    personFit:
                        'Jane Smith is Head of Partnerships at Example Consulting, so they are a natural owner for a partnership conversation. Source: https://www.linkedin.com/in/jane-smith',
                },
            ])
        })
    })

    describe('uniqueByCompany error handling', () => {
        it('should drop extra people from the same company', () => {
            const first = pickBestPersonFromResults([givenLinkedInResult()], 'Example Consulting', 'https://example-consulting.com')
            const second = pickBestPersonFromResults(
                [
                    {
                        title: 'Alex Jones - Director of Alliances - Example Consulting | LinkedIn',
                        url: 'https://www.linkedin.com/in/alex-jones',
                        content: 'Alex Jones is Director of Alliances at Example Consulting in London.',
                    },
                ],
                'Example Consulting',
                'https://example-consulting.com',
            )

            expect(uniqueByCompany([first!, second!], 1)).toEqual([first])
        })
    })

    describe('uniqueByCompany success', () => {
        it('should keep people from different companies', () => {
            const first = pickBestPersonFromResults([givenLinkedInResult()], 'Example Consulting', 'https://example-consulting.com')
            const second = pickBestPersonFromResults(
                [
                    {
                        title: 'Alex Jones - Director of Alliances - Other Advisory | LinkedIn',
                        url: 'https://www.linkedin.com/in/alex-jones',
                        content: 'Alex Jones is Director of Alliances at Other Advisory in London.',
                    },
                ],
                'Other Advisory',
                'https://other-advisory.com',
            )

            expect(uniqueByCompany([first!, second!], 1)).toEqual([first, second])
        })
    })
})
