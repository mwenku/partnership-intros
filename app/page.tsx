'use client'

import { FormEvent, ReactElement, SyntheticEvent, useEffect, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { OutreachStatusType, ProspectType, VendorBriefType } from '../src/zod-schemas'
import { TagListInput } from './TagListInput'

const defaultBrief: VendorBriefType = {
    vendorName: 'Deel',
    website: 'https://www.deel.com',
    offer: 'Global payroll, HR, and contractor management: hire, pay, and manage teams in 150+ countries with EOR, payroll, and compliance in one platform.',
    objective: 'Recruit UK implementation partners who already advise companies on international hiring and payroll.',
    idealPartner: 'UK consultancies, accountants, and HR advisors that help companies hire and pay internationally.',
    targetCustomers: 'Scale-ups, Mid-market companies, PE-backed businesses, Global employers',
    partnerContributes: 'Trusted introductions, Implementation delivery, Ongoing payroll and HR support',
    partnerGains: 'Global hiring offering for existing accounts, Implementation revenue, Differentiated delivery motion',
    constraints: 'United Kingdom, International hiring',
}

const defaultSearch =
    'Find partnership leaders at UK consultancies, accountancies, or HR firms that help companies hire and pay internationally.'

const phaseCopy: Record<OutreachStatusType['phase'], string> = {
    discovering: 'Searching Websets for people…',
    researching: 'Verifying criteria and researching each profile…',
    'writing-v1': 'Writing the first four-email sequence…',
    'writing-v2': 'Rewriting a stricter, source-backed sequence…',
    done: 'Reviewed sequences ready for potential use. Nothing has been sent.',
}

function emailsForDisplay(prospect: ProspectType): string[] {
    if (prospect.emailsV2.some(Boolean)) {
        return prospect.emailsV2
    }

    return prospect.emailsV1
}

function emailDraftForPreview(email: string, index: number): string {
    return `### Email ${index + 1}\n\n${email.replace(/\n/g, '  \n')}`
}

function sequenceWaitingCopy(phase: OutreachStatusType['phase'] | undefined): string {
    if (phase === 'writing-v2') {
        return 'Rewriting a stricter, source-backed sequence…'
    }

    if (phase === 'writing-v1') {
        return 'Writing the four-email sequence…'
    }

    return 'Research first, then the sequence will appear here.'
}

function emailWaitingCopy(phase: OutreachStatusType['phase'] | undefined): string {
    if (phase === 'writing-v2') {
        return 'Rewriting this email…'
    }

    if (phase === 'writing-v1') {
        return 'Writing this email…'
    }

    return 'Waiting on research…'
}

function hostFromUrl(url: string): string {
    try {
        return new URL(url).hostname.replace(/^www\./, '')
    } catch {
        return url
    }
}

function logoUrlFromWebsite(website: string): string {
    const host = hostFromUrl(website)
    if (!host || host === website) {
        return ''
    }

    return `https://www.google.com/s2/favicons?sz=64&domain=${encodeURIComponent(host)}`
}

function hideBrokenImage(event: SyntheticEvent<HTMLImageElement>): void {
    event.currentTarget.style.display = 'none'
}

function extraResearchExample(prospect: ProspectType): string {
    const firstSignal = prospect.signals[0]?.text || ''
    const firstEvaluation = prospect.evaluations[0]
    const exampleParts = [
        firstSignal ? `Signals: ${firstSignal.slice(0, 72)}${firstSignal.length > 72 ? '…' : ''}` : '',
        firstEvaluation ? `Criteria: ${firstEvaluation.satisfied} · ${firstEvaluation.criterion}` : '',
        prospect.sources.length === 1
            ? '1 source'
            : prospect.sources.length > 1
              ? `${prospect.sources.length} sources`
              : '',
    ].filter(Boolean)

    if (exampleParts.length === 0) {
        return 'Signals, criteria, and sources'
    }

    return `e.g. ${exampleParts.join(' · ')}`
}

export default function Page(): ReactElement {
    const [search, setSearch] = useState(defaultSearch)
    const [brief, setBrief] = useState(defaultBrief)
    const [websetId, setWebsetId] = useState('')
    const [dashboardUrl, setDashboardUrl] = useState('')
    const [status, setStatus] = useState<OutreachStatusType | null>(null)
    const [error, setError] = useState('')
    const [running, setRunning] = useState(false)
    const vendorLogoUrl = logoUrlFromWebsite(brief.website)

    function updateBrief(field: keyof VendorBriefType, value: string): void {
        setBrief((current) => ({ ...current, [field]: value }))
    }

    async function startRun(): Promise<void> {
        setError('')
        setStatus(null)
        setRunning(true)

        const response = await fetch('/api/outreach', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ search, brief }),
        })
        const payload = await response.json()

        if (!response.ok) {
            setRunning(false)
            setError(payload.message || 'Failed to start')
            return
        }

        setWebsetId(payload.data.websetId)
        setDashboardUrl(payload.data.dashboardUrl || '')
    }

    useEffect(() => {
        if (!websetId || !running) {
            return
        }

        let cancelled = false

        async function poll(): Promise<void> {
            const response = await fetch(`/api/outreach?websetId=${encodeURIComponent(websetId)}`)
            const payload = await response.json()

            if (cancelled) {
                return
            }

            if (!response.ok) {
                setRunning(false)
                setError(payload.message || 'Failed to poll Webset')
                return
            }

            const outreachStatus = payload.data as OutreachStatusType
            setStatus(outreachStatus)
            if (outreachStatus.dashboardUrl) {
                setDashboardUrl(outreachStatus.dashboardUrl)
            }

            if (outreachStatus.status === 'done') {
                setRunning(false)
            }
        }

        poll()
        const interval = setInterval(poll, 4000)
        return (): void => {
            cancelled = true
            clearInterval(interval)
        }
    }, [websetId, running])

    function downloadRun(): void {
        if (!status) {
            return
        }

        const blob = new Blob(
            [
                JSON.stringify(
                    {
                        search,
                        brief,
                        websetId,
                        dashboardUrl,
                        prospects: status.prospects,
                    },
                    null,
                    2,
                ),
            ],
            { type: 'application/json' },
        )
        const url = URL.createObjectURL(blob)
        const link = document.createElement('a')
        link.href = url
        link.download = 'run.json'
        link.click()
        URL.revokeObjectURL(url)
    }

    return (
        <main className="page">
            <p className="kicker">Souk · partner recruitment</p>
            <h1>Find partners, then draft the sequence</h1>
            <p className="lede">
                Souk would email cold prospects on a vendor&apos;s behalf. This prototype uses Tavily-backed web search
                to find people, verify them, research signals, and draft a four-email sequence. It stops at reviewed
                drafts ready for potential use. No real emails are sent.
            </p>

            <div className="workspace">
                <section className="form-panel">
                    <form
                        className="form"
                        onSubmit={(event: FormEvent) => {
                            event.preventDefault()
                            startRun()
                        }}
                    >
                        <label>
                            Partner search
                            <textarea value={search} onChange={(event) => setSearch(event.target.value)} />
                        </label>

                        <div className="grid-2">
                            <label>
                                Vendor name
                                <span className="named-input">
                                    {vendorLogoUrl ? (
                                        <img
                                            className="company-logo"
                                            src={vendorLogoUrl}
                                            alt=""
                                            onError={hideBrokenImage}
                                        />
                                    ) : null}
                                    <input
                                        value={brief.vendorName}
                                        onChange={(event) => updateBrief('vendorName', event.target.value)}
                                    />
                                </span>
                            </label>
                            <label>
                                Vendor website
                                <input
                                    value={brief.website}
                                    onChange={(event) => updateBrief('website', event.target.value)}
                                />
                            </label>
                        </div>

                        <label>
                            What the vendor offers
                            <textarea
                                value={brief.offer}
                                onChange={(event) => updateBrief('offer', event.target.value)}
                            />
                        </label>
                        <label>
                            Partnership objective
                            <textarea
                                value={brief.objective}
                                onChange={(event) => updateBrief('objective', event.target.value)}
                            />
                        </label>
                        <label>
                            Ideal partner
                            <textarea
                                value={brief.idealPartner}
                                onChange={(event) => updateBrief('idealPartner', event.target.value)}
                            />
                        </label>
                        <label>
                            Customers the vendor wants to reach
                            <TagListInput
                                instanceId="targetCustomers"
                                value={brief.targetCustomers}
                                placeholder="Add a customer type"
                                onChange={(value) => updateBrief('targetCustomers', value)}
                            />
                        </label>
                        <div className="grid-2">
                            <label>
                                What the partner contributes
                                <TagListInput
                                    instanceId="partnerContributes"
                                    value={brief.partnerContributes}
                                    placeholder="Add a contribution"
                                    onChange={(value) => updateBrief('partnerContributes', value)}
                                />
                            </label>
                            <label>
                                What the partner gains
                                <TagListInput
                                    instanceId="partnerGains"
                                    value={brief.partnerGains}
                                    placeholder="Add a partner gain"
                                    onChange={(value) => updateBrief('partnerGains', value)}
                                />
                            </label>
                        </div>
                        <label>
                            Geography or other constraints
                            <TagListInput
                                instanceId="constraints"
                                value={brief.constraints}
                                placeholder="Add a constraint"
                                onChange={(value) => updateBrief('constraints', value)}
                            />
                        </label>

                        <div className="actions">
                            <button type="submit" disabled={running}>
                                {running ? 'Running Websets…' : 'Run outreach research'}
                            </button>
                            {status?.status === 'done' ? (
                                <button type="button" className="secondary" onClick={downloadRun}>
                                    Download reviewed run JSON
                                </button>
                            ) : null}
                            {dashboardUrl ? (
                                <a href={dashboardUrl} target="_blank" rel="noreferrer">
                                    Open Webset dashboard
                                </a>
                            ) : null}
                        </div>
                    </form>
                </section>

                <section className="results-panel">
                    {error ? <p className="status error">{error}</p> : null}
                    {running || status ? (
                        <p className={`status${running ? ' running' : ''}`} aria-live="polite">
                            {running ? <span className="status-dot" aria-hidden="true" /> : null}
                            {phaseCopy[status?.phase || 'discovering']}
                            {status ? ` · ${status.itemCount} found` : ''}
                        </p>
                    ) : (
                        <p className="status">Run outreach research to see companies, contacts, and drafts.</p>
                    )}

                    {(status?.prospects || []).map((prospect) => {
                        const emails = emailsForDisplay(prospect)
                        const companyLogoUrl = logoUrlFromWebsite(prospect.companyWebsite)

                        return (
                            <article className="prospect" key={prospect.id}>
                                <div className="company-block">
                                    {companyLogoUrl ? (
                                        <img
                                            className="company-logo"
                                            src={companyLogoUrl}
                                            alt=""
                                            onError={hideBrokenImage}
                                        />
                                    ) : null}
                                    <div className="company-copy">
                                        <h2>{prospect.companyName || 'Company not found'}</h2>
                                        {prospect.companyWebsite ? (
                                            <a href={prospect.companyWebsite} target="_blank" rel="noreferrer">
                                                {hostFromUrl(prospect.companyWebsite)}
                                            </a>
                                        ) : null}
                                    </div>
                                </div>

                                <div className="contact">
                                    {prospect.pictureUrl ? (
                                        <img src={prospect.pictureUrl} alt="" onError={hideBrokenImage} />
                                    ) : null}
                                    <div>
                                        <p className="contact-name">{prospect.name}</p>
                                        <p className="meta">
                                            {[prospect.position, prospect.location].filter(Boolean).join(' · ')}
                                        </p>
                                        <p className="meta">
                                            {prospect.email ||
                                                (status?.status === 'done'
                                                    ? 'work email not found'
                                                    : 'looking up work email')}
                                            {' · '}
                                            {prospect.profileUrl ? (
                                                <a href={prospect.profileUrl} target="_blank" rel="noreferrer">
                                                    LinkedIn
                                                </a>
                                            ) : (
                                                'LinkedIn not found'
                                            )}
                                        </p>
                                    </div>
                                </div>

                                <div className="section">
                                    <h3>Why this company</h3>
                                    <p>{prospect.companyFit || 'Not returned by Websets.'}</p>
                                </div>
                                <div className="section">
                                    <h3>Why this person</h3>
                                    <p>{prospect.personFit || 'Not returned by Websets.'}</p>
                                </div>
                                <div className="section selected">
                                    <h3>Selected personalisation</h3>
                                    <p>{prospect.selectedSignal || 'Not selected.'}</p>
                                    <p className="small">{prospect.selectedSignalWhy}</p>
                                </div>

                                <details className="research">
                                    <summary>
                                        Extra research
                                        <span className="research-example">{extraResearchExample(prospect)}</span>
                                    </summary>
                                    <div className="section">
                                        <h3>Signals</h3>
                                        {prospect.signals.length === 0 ? (
                                            <p>No signals returned.</p>
                                        ) : (
                                            prospect.signals.map((signal) => <p key={signal.text}>{signal.text}</p>)
                                        )}
                                    </div>
                                    <div className="section">
                                        <h3>Criteria</h3>
                                        {prospect.evaluations.length === 0 ? (
                                            <p>No criteria returned.</p>
                                        ) : (
                                            prospect.evaluations.map((evaluation) => (
                                                <div className="tick" key={evaluation.criterion}>
                                                    <strong>{evaluation.satisfied}</strong>
                                                    {` · ${evaluation.criterion}`}
                                                    <div className="small">{evaluation.reasoning}</div>
                                                </div>
                                            ))
                                        )}
                                    </div>
                                    <div className="section">
                                        <h3>Sources</h3>
                                        <div className="sources">
                                            {prospect.sources.length === 0 ? (
                                                <p className="small">No sources returned.</p>
                                            ) : (
                                                prospect.sources.map((source) => (
                                                    <a
                                                        key={source.url}
                                                        href={source.url}
                                                        target="_blank"
                                                        rel="noreferrer"
                                                    >
                                                        {source.title}
                                                    </a>
                                                ))
                                            )}
                                        </div>
                                    </div>
                                </details>

                                <div className="section">
                                    <h3>Sequence</h3>
                                    {running && !emails.some(Boolean) ? (
                                        <p className="sequence-status">
                                            <span className="status-dot" aria-hidden="true" />
                                            {sequenceWaitingCopy(status?.phase)}
                                        </p>
                                    ) : null}
                                    {emails.map((email, index) => {
                                        if (email) {
                                            return (
                                                <div className="email" key={`${prospect.id}-${index}`}>
                                                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                                                        {emailDraftForPreview(email, index)}
                                                    </ReactMarkdown>
                                                </div>
                                            )
                                        }

                                        if (running) {
                                            return (
                                                <div className="email loading" key={`${prospect.id}-${index}`}>
                                                    <h3>Email {index + 1}</h3>
                                                    <p className="email-loading-copy">
                                                        <span className="status-dot" aria-hidden="true" />
                                                        {emailWaitingCopy(status?.phase)}
                                                    </p>
                                                    <div className="email-skeleton" aria-hidden="true">
                                                        <span />
                                                        <span />
                                                        <span />
                                                        <span />
                                                    </div>
                                                </div>
                                            )
                                        }

                                        return (
                                            <div className="email" key={`${prospect.id}-${index}`}>
                                                <h3>Email {index + 1}</h3>
                                                <p>Draft not returned.</p>
                                            </div>
                                        )
                                    })}
                                </div>
                            </article>
                        )
                    })}
                </section>
            </div>
        </main>
    )
}
