type SearchHit = {
    title: string
    url: string
    content: string
}

type DiscoveredPerson = {
    name: string
    position: string
    location: string
    profileUrl: string
    pictureUrl: string
    companyName: string
    companyWebsite: string
    email: string
    personFit: string
}

const genericEmailLocals = new Set([
    'admin',
    'contact',
    'enquiries',
    'enquiry',
    'hello',
    'info',
    'media',
    'noreply',
    'no-reply',
    'office',
    'press',
    'privacy',
    'sales',
    'support',
    'team',
    'webmaster',
])

const publisherHosts = [
    'linkedin.com',
    'wikipedia.org',
    'medium.com',
    'youtube.com',
    'twitter.com',
    'x.com',
    'facebook.com',
    'crunchbase.com',
    'g2.com',
    'capterra.com',
    'trustradius.com',
    'gartner.com',
    'forbes.com',
    'techcrunch.com',
    'businessinsider.com',
]

const jobTitleWords = new Set([
    'manager',
    'director',
    'officer',
    'specialist',
    'consultant',
    'recruiter',
    'executive',
    'president',
    'lead',
    'head',
])

function hostFromUrl(url: string): string {
    try {
        const hostname = new URL(url).hostname
        return hostname.replace(/^www\./, '')
    } catch {
        return ''
    }
}

function looksLikeCompanyWebsite(url: string): boolean {
    const host = hostFromUrl(url)
    if (!host) {
        return false
    }

    return !publisherHosts.some((publisher) => host === publisher || host.endsWith(`.${publisher}`))
}

function looksLikeJobPost(result: SearchHit): boolean {
    const url = result.url.toLowerCase()
    const title = result.title.toLowerCase()
    if (url.includes('/jobs') || url.includes('linkedin.com/jobs')) {
        return true
    }

    return /\b(job opening|we're hiring|is hiring|jobs?)\b/i.test(title)
}

function looksLikeArticleTitle(title: string): boolean {
    return /\b(alternatives?|best \d+|top \d+|vs\.?|compared|review of|\d+\s+comments?)\b/i.test(title)
}

function looksLikeRealCompanyName(name: string): boolean {
    const cleaned = name.trim()
    if (!cleaned) {
        return false
    }

    if (looksLikeArticleTitle(cleaned) || looksLikeJobPost({ title: cleaned, url: '', content: '' })) {
        return false
    }

    if (/^\d+\s+comments?$/i.test(cleaned)) {
        return false
    }

    return cleaned.length <= 80
}

function isVendorProperty(result: SearchHit, vendorWebsite: string): boolean {
    const vendorHost = hostFromUrl(vendorWebsite)
    const resultHost = hostFromUrl(result.url)
    if (!vendorHost || !resultHost) {
        return false
    }

    return resultHost === vendorHost || resultHost.endsWith(`.${vendorHost}`)
}

function isUsableCompanyResult(result: SearchHit, vendorWebsite: string): boolean {
    if (isVendorProperty(result, vendorWebsite)) {
        return false
    }

    if (looksLikeJobPost(result) || looksLikeArticleTitle(result.title)) {
        return false
    }

    if (!looksLikeCompanyWebsite(result.url) && !/linkedin\.com\/company\//i.test(result.url)) {
        return false
    }

    return looksLikeRealCompanyName(companyNameFromResult(result))
}

function companyNameFromResult(result: SearchHit): string {
    const title = result.title.split(/[|–]/)[0]?.trim() || ''
    if (title && looksLikeRealCompanyName(title) && !looksLikeArticleTitle(title)) {
        return title
    }

    const host = hostFromUrl(result.url)
    if (!host) {
        return title
    }

    const brand = host.split('.')[0] || host
    return brand
        .split('-')
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(' ')
}

function peopleQueryForCompany(companyName: string): string {
    return `Best current employee to contact about partnerships at ${companyName}. Prefer Head of Partnerships, Director of Alliances, Business Development Director, or Partner. LinkedIn profile or leadership team page.`
}

function emailQueryForPerson(name: string, companyName: string): string {
    return `Public work email address for ${name} at ${companyName}`
}

function globalPeopleQuery(search: string): string {
    return `${search.split('\n')[0]?.trim() || search} Head of Partnerships OR Director of Alliances OR Business Development LinkedIn`
}

function cleanPersonName(name: string): string {
    return name
        .replace(/^(dr|mr|mrs|ms|miss|prof|sir)\.?\s+/i, '')
        .replace(/,.*$/, '')
        .replace(/\s+/g, ' ')
        .trim()
}

const skippedNameTokens = new Set([
    'chartered',
    'dame',
    'dr',
    'fellow',
    'lady',
    'lord',
    'miss',
    'mr',
    'mrs',
    'ms',
    'prof',
    'sir',
])

function looksLikeCredentialToken(token: string): boolean {
    const cleaned = token.replace(/[.]/g, '')
    if (!cleaned) {
        return true
    }

    if (skippedNameTokens.has(cleaned.toLowerCase())) {
        return true
    }

    if (/^[A-Z]{2,6}$/.test(cleaned)) {
        return true
    }

    return /^(mc[a-z]{2,4}|fr[a-z]{1,3}|mba|phd|cfa|obe|cbe|mbe|jp)$/i.test(cleaned)
}

function firstNameFrom(name: string): string {
    const firstName =
        cleanPersonName(name)
            .split(/\s+/)
            .map((token) => token.replace(/^[-–—]+|[-–—]+$/g, ''))
            .find((token) => token && !looksLikeCredentialToken(token)) || ''

    if (!firstName || firstName.toLowerCase() === 'unknown') {
        return 'there'
    }

    return firstName
}

function looksLikePersonName(name: string): boolean {
    const cleaned = cleanPersonName(name)
    if (!cleaned) {
        return false
    }

    if (/^(leadership|team|about|home|partners?|contact|our team|people|careers|news|blog)$/i.test(cleaned)) {
        return false
    }

    if (/^(our|the|about|meet)\s+/i.test(cleaned)) {
        return false
    }

    if (/\b(ltd|inc|llc|plc|llp|group|consulting|consultancy|limited|partners)\b/i.test(cleaned)) {
        return false
    }

    const parts = cleaned.split(/\s+/)
    if (parts.length < 2 || parts.length > 4) {
        return false
    }

    if (cleaned.length > 60) {
        return false
    }

    const lastPart = parts[parts.length - 1]?.toLowerCase() || ''
    if (jobTitleWords.has(lastPart)) {
        return false
    }

    if (parts.some((part) => /^[A-Z]{2,4}$/.test(part))) {
        return false
    }

    return parts.every((part) => /^[A-Z][A-Za-z'.-]*$/.test(part) || /^(de|van|von|da|la|le)\.?$/i.test(part))
}

function parsePersonFromTitle(title: string): { name: string; position: string; companyName: string } | null {
    const cleaned = title.replace(/\s*\|\s*LinkedIn\s*$/i, '').trim()
    if (!cleaned) {
        return null
    }

    const atMatch = cleaned.match(/^(.+?)\s*[-–|:]\s*(.+?)\s+at\s+(.+)$/i)
    if (atMatch) {
        const name = cleanPersonName(atMatch[1])
        if (looksLikePersonName(name)) {
            return {
                name,
                position: atMatch[2].trim(),
                companyName: atMatch[3].trim(),
            }
        }
    }

    const parts = cleaned
        .split(/\s*[-–|]\s*/)
        .map((part) => part.trim())
        .filter(Boolean)
    const nameIndex = parts.findIndex((part) => looksLikePersonName(part))
    if (nameIndex < 0) {
        return null
    }

    const rest = parts.filter((_, index) => index !== nameIndex)
    const rawPosition = rest[0] || ''
    const rawCompany = rest.slice(1).join(' - ')
    return {
        name: cleanPersonName(parts[nameIndex]),
        position: /^\d+\s+comments?$/i.test(rawPosition) ? '' : rawPosition,
        companyName: looksLikeRealCompanyName(rawCompany) ? rawCompany : '',
    }
}

function nameFromLinkedInUrl(url: string): string {
    const match = url.match(/linkedin\.com\/in\/([^/?#]+)/i)
    if (!match) {
        return ''
    }

    const slug = decodeURIComponent(match[1]).replace(/-/g, ' ').trim()
    const named = slug
        .split(/\s+/)
        .filter((part) => !/^\d+$/.test(part))
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(' ')

    if (!looksLikePersonName(named)) {
        return ''
    }

    return named
}

function isLinkedInProfile(url: string): boolean {
    return /linkedin\.com\/in\//i.test(url)
}

function emailsFromText(text: string): string[] {
    const matches = text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) || []
    const unique: string[] = []
    const seen = new Set<string>()

    for (const match of matches) {
        const email = match.toLowerCase()
        if (seen.has(email)) {
            continue
        }

        if (/\.(png|jpe?g|gif|svg|webp)$/i.test(email)) {
            continue
        }

        seen.add(email)
        unique.push(email)
    }

    return unique
}

function emailLocalMatchesName(email: string, personName: string): boolean {
    const local = email.split('@')[0]?.toLowerCase().replace(/[._-]/g, '') || ''
    const parts = personName.toLowerCase().split(/\s+/).filter(Boolean)
    if (parts.length === 0 || !local) {
        return false
    }

    const first = parts[0]
    const last = parts[parts.length - 1]
    if (local === `${first}${last}` || local === `${first[0]}${last}` || local === first) {
        return true
    }

    return local.includes(first) && local.includes(last)
}

function selectWorkEmail(emails: string[], companyDomain: string, personName: string): string {
    const candidates = emails.filter((email) => {
        const local = email.split('@')[0] || ''
        return !genericEmailLocals.has(local)
    })

    if (candidates.length === 0) {
        return ''
    }

    const domainMatches = companyDomain ? candidates.filter((email) => email.endsWith(`@${companyDomain}`)) : []
    const namedOnDomain = domainMatches.filter((email) => emailLocalMatchesName(email, personName))
    if (namedOnDomain[0]) {
        return namedOnDomain[0]
    }

    const named = candidates.filter((email) => emailLocalMatchesName(email, personName))
    if (named[0]) {
        return named[0]
    }

    if (domainMatches[0]) {
        return domainMatches[0]
    }

    return ''
}

function partnershipRoleScore(position: string): number {
    const lowered = position.toLowerCase()
    if (!lowered) {
        return 0
    }

    if (lowered.includes('partnership') || lowered.includes('alliance')) {
        return 6
    }

    if (lowered.includes('business development') || lowered.includes('biz dev') || /\bbd\b/.test(lowered)) {
        return 5
    }

    if (lowered.includes('partner')) {
        return 4
    }

    if (lowered.includes('commercial') || lowered.includes('ecosystem')) {
        return 3
    }

    if (
        lowered.includes('director') ||
        lowered.includes('head of') ||
        lowered.includes('vp') ||
        lowered.includes('chief') ||
        lowered.includes('managing')
    ) {
        return 2
    }

    return 1
}

function positionFromContent(content: string, name: string): string {
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const isMatch = content.match(new RegExp(`${escaped}\\s+(?:is|serves as)\\s+(?:the\\s+)?([^.,\\n]+)`, 'i'))
    if (isMatch) {
        return isMatch[1].trim()
    }

    const commaMatch = content.match(new RegExp(`${escaped},\\s+([^.,\\n]+)`, 'i'))
    if (!commaMatch) {
        return ''
    }

    return commaMatch[1].trim()
}

function locationFromContent(content: string): string {
    const cityMatch = content.match(
        /\b((?:London|Manchester|Birmingham|Edinburgh|Glasgow|Bristol|Leeds|Cambridge|Oxford)(?:,?\s*(?:UK|United Kingdom|England|Scotland|Wales))?)\b/i,
    )
    if (cityMatch) {
        return cityMatch[1]
    }

    const basedMatch = content.match(
        /\b(?:based in|located in|lives in)\s+([A-Z][A-Za-z]+(?:\s+[A-Z][A-Za-z]+)?(?:,\s*[A-Z][A-Za-z]+)?)/,
    )
    if (!basedMatch) {
        return ''
    }

    return basedMatch[1]
}

function personFitFrom(name: string, position: string, companyName: string, sourceUrl: string): string {
    if (position) {
        return `${name} is ${position} at ${companyName}, so they are a natural owner for a partnership conversation. Source: ${sourceUrl}`
    }

    return `${name} works at ${companyName} and is a relevant public contact for a partnership conversation. Source: ${sourceUrl}`
}

function uniqueByCompany(people: DiscoveredPerson[], maxPeoplePerCompany: number): DiscoveredPerson[] {
    const counts = new Map<string, number>()
    const unique: DiscoveredPerson[] = []

    for (const person of people) {
        const key = person.companyName.toLowerCase()
        const count = counts.get(key) || 0
        if (count >= maxPeoplePerCompany) {
            continue
        }

        counts.set(key, count + 1)
        unique.push(person)
    }

    return unique
}

function pickBestPersonFromResults(
    results: SearchHit[],
    companyName: string,
    companyWebsite: string,
): DiscoveredPerson | null {
    let best: { person: DiscoveredPerson; score: number } | null = null
    const companyDomain = hostFromUrl(companyWebsite)

    for (const result of results) {
        const parsed = parsePersonFromTitle(result.title)
        const linkedInName = nameFromLinkedInUrl(result.url)
        const name = parsed?.name || linkedInName
        if (!name) {
            continue
        }

        const position = parsed?.position || positionFromContent(result.content, name)
        const resolvedCompanyName = parsed?.companyName || companyName
        const email = selectWorkEmail(emailsFromText(`${result.title}\n${result.content}`), companyDomain, name)
        const profileUrl = result.url
        const person: DiscoveredPerson = {
            name,
            position,
            location: locationFromContent(result.content),
            profileUrl,
            pictureUrl: '',
            companyName: resolvedCompanyName,
            companyWebsite,
            email,
            personFit: personFitFrom(name, position, resolvedCompanyName, profileUrl),
        }
        const score = partnershipRoleScore(position) + (isLinkedInProfile(profileUrl) ? 3 : 0) + (email ? 1 : 0)

        if (!best || score > best.score) {
            best = { person, score }
        }
    }

    if (!best) {
        return null
    }

    return best.person
}

function peopleFromHitList(results: SearchHit[]): DiscoveredPerson[] {
    const people: DiscoveredPerson[] = []

    for (const result of results) {
        const companyWebsite = looksLikeCompanyWebsite(result.url) ? result.url : ''
        const person = pickBestPersonFromResults([result], companyNameFromResult(result), companyWebsite)
        if (!person) {
            continue
        }

        people.push(person)
    }

    return people
}

export {
    companyNameFromResult,
    emailQueryForPerson,
    emailsFromText,
    firstNameFrom,
    globalPeopleQuery,
    hostFromUrl,
    isUsableCompanyResult,
    looksLikeCompanyWebsite,
    looksLikePersonName,
    parsePersonFromTitle,
    peopleFromHitList,
    peopleQueryForCompany,
    pickBestPersonFromResults,
    selectWorkEmail,
    uniqueByCompany,
}

export type { DiscoveredPerson, SearchHit }
