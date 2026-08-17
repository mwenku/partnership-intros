'use client'

import { FormEvent, ReactElement, useEffect, useState } from 'react'
import { OutreachStatusType, ProspectType, VendorBriefType } from '../src/zod-schemas'

const defaultBrief: VendorBriefType = {
    vendorName: 'Harborline',
    website: 'https://harborline.ai',
    offer: "A private AI runtime for regulated enterprises: models run on the customer's infrastructure with audit logs and data residency.",
    objective: 'Recruit UK implementation partners who already serve regulated clients.',
    idealPartner: 'UK consultancies that implement private AI or Kubernetes infrastructure for regulated companies.',
    targetCustomers: 'Banks, insurers, health providers, and public-sector organisations in the UK.',
    partnerContributes: 'Trusted introductions, implementation delivery, and ongoing operational support.',
    partnerGains:
        'A private-AI offering to take to existing accounts, implementation revenue, and a differentiated delivery motion.',
    constraints: 'United Kingdom. Partners should already work with regulated industries.',
}

const defaultSearch =
    'Find partnership leaders at UK consultancies that implement private-AI or Kubernetes infrastructure for regulated companies.'

const phaseCopy: Record<OutreachStatusType['phase'], string> = {
    discovering: 'Searching Websets for people…',
    researching: 'Verifying criteria and researching each profile…',
    'writing-v1': 'Writing the first four-email sequence…',
    'writing-v2': 'Rewriting a stricter, source-backed sequence…',
    done: 'Reviewed sequences ready for potential use. Nothing has been sent.',
}

function emailsForDisplay(prospect: ProspectType, showFinal: boolean): string[] {
    if (!showFinal) {
        return prospect.emailsV1
    }

    if (prospect.emailsV2.some(Boolean)) {
        return prospect.emailsV2
    }

    return prospect.emailsV1
}

export default function Page(): ReactElement {
    const [search, setSearch] = useState(defaultSearch)
    const [brief, setBrief] = useState(defaultBrief)
    const [websetId, setWebsetId] = useState('')
    const [dashboardUrl, setDashboardUrl] = useState('')
    const [status, setStatus] = useState<OutreachStatusType | null>(null)
    const [error, setError] = useState('')
    const [running, setRunning] = useState(false)
    const [finalByProspect, setFinalByProspect] = useState<Record<string, boolean>>({})

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
                Souk would email cold prospects on a vendor&apos;s behalf. This prototype uses Exa Websets to find
                people, verify them, research signals, and draft a four-email sequence. It stops at reviewed drafts
                ready for potential use. No real emails are sent.
            </p>

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
                        <input
                            value={brief.vendorName}
                            onChange={(event) => updateBrief('vendorName', event.target.value)}
                        />
                    </label>
                    <label>
                        Vendor website
                        <input value={brief.website} onChange={(event) => updateBrief('website', event.target.value)} />
                    </label>
                </div>

                <label>
                    What the vendor offers
                    <textarea value={brief.offer} onChange={(event) => updateBrief('offer', event.target.value)} />
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
                    <textarea
                        value={brief.targetCustomers}
                        onChange={(event) => updateBrief('targetCustomers', event.target.value)}
                    />
                </label>
                <div className="grid-2">
                    <label>
                        What the partner contributes
                        <textarea
                            value={brief.partnerContributes}
                            onChange={(event) => updateBrief('partnerContributes', event.target.value)}
                        />
                    </label>
                    <label>
                        What the partner gains
                        <textarea
                            value={brief.partnerGains}
                            onChange={(event) => updateBrief('partnerGains', event.target.value)}
                        />
                    </label>
                </div>
                <label>
                    Geography or other constraints
                    <textarea
                        value={brief.constraints}
                        onChange={(event) => updateBrief('constraints', event.target.value)}
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

            {error ? <p className="status error">{error}</p> : null}
            {running || status ? (
                <p className="status">
                    {phaseCopy[status?.phase || 'discovering']}
                    {status ? ` · ${status.itemCount} people found` : ''}
                </p>
            ) : null}

            {(status?.prospects || []).map((prospect) => {
                const showFinal = finalByProspect[prospect.id] ?? true
                const emails = emailsForDisplay(prospect, showFinal)

                return (
                    <article className="prospect" key={prospect.id}>
                        <div className="prospect-header">
                            {prospect.pictureUrl ? <img src={prospect.pictureUrl} alt="" /> : null}
                            <div>
                                <h2>{prospect.name}</h2>
                                <p className="meta">
                                    {[prospect.position, prospect.companyName, prospect.location]
                                        .filter(Boolean)
                                        .join(' · ')}
                                </p>
                                <p className="meta">
                                    {prospect.profileUrl ? (
                                        <a href={prospect.profileUrl} target="_blank" rel="noreferrer">
                                            Profile
                                        </a>
                                    ) : null}
                                    {prospect.companyWebsite ? (
                                        <>
                                            {' · '}
                                            <a href={prospect.companyWebsite} target="_blank" rel="noreferrer">
                                                Company
                                            </a>
                                        </>
                                    ) : null}
                                    {` · ${prospect.email || 'work email not found'}`}
                                </p>
                            </div>
                        </div>

                        <div className="section">
                            <h3>Criteria</h3>
                            {prospect.evaluations.map((evaluation) => (
                                <div className="tick" key={evaluation.criterion}>
                                    <strong>{evaluation.satisfied}</strong>
                                    {` · ${evaluation.criterion}`}
                                    <div className="small">{evaluation.reasoning}</div>
                                </div>
                            ))}
                        </div>

                        <div className="section">
                            <h3>Why this company</h3>
                            <p>{prospect.companyFit || 'Not returned by Websets.'}</p>
                        </div>

                        <div className="section">
                            <h3>Why this person</h3>
                            <p>{prospect.personFit || 'Not returned by Websets.'}</p>
                        </div>

                        <div className="section">
                            <h3>Signals</h3>
                            {prospect.signals.length === 0 ? (
                                <p>No signals returned.</p>
                            ) : (
                                prospect.signals.map((signal) => <p key={signal.text}>{signal.text}</p>)
                            )}
                        </div>

                        <div className="section selected">
                            <h3>Selected personalisation</h3>
                            <p>{prospect.selectedSignal || 'Not selected.'}</p>
                            <p className="small">{prospect.selectedSignalWhy}</p>
                        </div>

                        <div className="section">
                            <h3>Sources</h3>
                            <div className="sources">
                                {prospect.sources.length === 0 ? (
                                    <p className="small">No sources returned.</p>
                                ) : (
                                    prospect.sources.map((source) => (
                                        <a key={source.url} href={source.url} target="_blank" rel="noreferrer">
                                            {source.title}
                                        </a>
                                    ))
                                )}
                            </div>
                        </div>

                        <div className="section">
                            <h3>Reviewed four-email sequence</h3>
                            <p className="small">
                                Drafts for review only. Ready for potential use. Not sent to{' '}
                                {prospect.email || 'the prospect'}.
                            </p>
                            <div className="toggle">
                                <button
                                    type="button"
                                    className={showFinal ? 'secondary' : ''}
                                    onClick={() =>
                                        setFinalByProspect((current) => ({ ...current, [prospect.id]: false }))
                                    }
                                >
                                    First
                                </button>
                                <button
                                    type="button"
                                    className={showFinal ? '' : 'secondary'}
                                    onClick={() =>
                                        setFinalByProspect((current) => ({ ...current, [prospect.id]: true }))
                                    }
                                >
                                    Final
                                </button>
                            </div>
                            {emails.map((email, index) => (
                                <pre className="email" key={`${prospect.id}-${index}`}>
                                    {`Email ${index + 1}\n\n${email || 'Not generated yet.'}`}
                                </pre>
                            ))}
                        </div>
                    </article>
                )
            })}
        </main>
    )
}
