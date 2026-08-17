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

type SequenceTab = 'first' | 'final' | 'improved'

type SavedRun = {
    search: string
    brief: VendorBriefType
    websetId: string
    dashboardUrl: string
    prospects: ProspectType[]
}

function hasEmailContent(emails: string[]): boolean {
    return emails.some((email) => Boolean(email.trim()))
}

function defaultSequenceTab(prospect: ProspectType, phase: OutreachStatusType['phase'] | undefined): SequenceTab {
    if (hasEmailContent(prospect.emailsV2) || phase === 'writing-v2') {
        return 'final'
    }

    return 'first'
}

function problemSourceLabel(source: ProspectType['emailImprovement']['problemSource']): string {
    if (source === 'signal-selection') {
        return 'Signal selection'
    }

    if (source === 'discovery') {
        return 'Discovery'
    }

    if (source === 'enrichment') {
        return 'Enrichment'
    }

    return 'Writing'
}

function EmailDrafts({
    emails,
    prospectId,
    phase,
    running,
}: {
    emails: string[]
    prospectId: string
    phase: OutreachStatusType['phase'] | undefined
    running: boolean
}): ReactElement {
    return (
        <>
            {running && !emails.some(Boolean) ? (
                <p className="sequence-status">
                    <span className="status-dot" aria-hidden="true" />
                    {sequenceWaitingCopy(phase)}
                </p>
            ) : null}
            {emails.map((email, index) => {
                if (email) {
                    return (
                        <div className="email" key={`${prospectId}-${index}`}>
                            <ReactMarkdown remarkPlugins={[remarkGfm]}>
                                {emailDraftForPreview(email, index)}
                            </ReactMarkdown>
                        </div>
                    )
                }

                if (running) {
                    return (
                        <div className="email loading" key={`${prospectId}-${index}`}>
                            <h3>Email {index + 1}</h3>
                            <p className="email-loading-copy">
                                <span className="status-dot" aria-hidden="true" />
                                {emailWaitingCopy(phase)}
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
                    <div className="email" key={`${prospectId}-${index}`}>
                        <h3>Email {index + 1}</h3>
                        <p>Draft not returned.</p>
                    </div>
                )
            })}
        </>
    )
}

function SequenceSnapshots({
    prospect,
    phase,
    running,
    tab,
    onTabChange,
}: {
    prospect: ProspectType
    phase: OutreachStatusType['phase'] | undefined
    running: boolean
    tab: SequenceTab
    onTabChange: (next: SequenceTab) => void
}): ReactElement {
    const showFinalTab = hasEmailContent(prospect.emailsV2) || phase === 'writing-v2' || phase === 'done'
    const showImprovedTab = hasEmailContent(prospect.emailsV1) && hasEmailContent(prospect.emailsV2)
    const improvement = prospect.emailImprovement

    return (
        <div className="section">
            <h3>Sequence</h3>
            <div className="sequence-tabs" role="tablist" aria-label="Email snapshots">
                <button
                    type="button"
                    role="tab"
                    aria-selected={tab === 'first'}
                    className={tab === 'first' ? 'active' : ''}
                    onClick={() => onTabChange('first')}
                >
                    First draft
                </button>
                {showFinalTab ? (
                    <button
                        type="button"
                        role="tab"
                        aria-selected={tab === 'final'}
                        className={tab === 'final' ? 'active' : ''}
                        onClick={() => onTabChange('final')}
                    >
                        Final
                    </button>
                ) : null}
                {showImprovedTab ? (
                    <button
                        type="button"
                        role="tab"
                        aria-selected={tab === 'improved'}
                        className={tab === 'improved' ? 'active' : ''}
                        onClick={() => onTabChange('improved')}
                    >
                        How it improved
                    </button>
                ) : null}
            </div>

            {tab === 'first' ? (
                <div role="tabpanel">
                    <EmailDrafts
                        emails={prospect.emailsV1}
                        prospectId={`${prospect.id}-first`}
                        phase={phase === 'writing-v2' ? 'writing-v1' : phase}
                        running={running && !hasEmailContent(prospect.emailsV1)}
                    />
                </div>
            ) : null}

            {tab === 'final' ? (
                <div role="tabpanel">
                    <EmailDrafts
                        emails={
                            hasEmailContent(prospect.emailsV2) || phase === 'writing-v2'
                                ? prospect.emailsV2
                                : prospect.emailsV1
                        }
                        prospectId={`${prospect.id}-final`}
                        phase={phase}
                        running={running && !hasEmailContent(prospect.emailsV2)}
                    />
                </div>
            ) : null}

            {tab === 'improved' ? (
                <div role="tabpanel" className="improvement">
                    <p className="judgement-verdict">
                        Problem source: {problemSourceLabel(improvement.problemSource)}
                    </p>
                    <h3>What was weak in the first version</h3>
                    <p>{improvement.weakInFirst}</p>
                    <h3>Where the problem came from</h3>
                    <p>{improvement.problemSourceWhy}</p>
                    <h3>What changed</h3>
                    <p>{improvement.whatChanged}</p>
                    <h3>How the emails improved</h3>
                    <p>{improvement.howImproved}</p>
                </div>
            ) : null}
        </div>
    )
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
    const [reusingResearch, setReusingResearch] = useState(false)
    const [emailModel, setEmailModel] = useState('')
    const [sequenceTabs, setSequenceTabs] = useState<Record<string, SequenceTab>>({})
    const vendorLogoUrl = logoUrlFromWebsite(brief.website)

    function updateBrief(field: keyof VendorBriefType, value: string): void {
        setBrief((current) => ({ ...current, [field]: value }))
    }

    async function startRun(reuseResearch = false): Promise<void> {
        const researchProspects = status?.prospects || []
        const trimmedEmailModel = emailModel.trim()
        setError('')
        setStatus(null)
        setSequenceTabs({})
        setReusingResearch(reuseResearch)
        setRunning(true)

        const response = await fetch('/api/outreach', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                search,
                brief,
                reuseResearch,
                ...(trimmedEmailModel ? { emailModel: trimmedEmailModel } : {}),
                ...(reuseResearch && researchProspects.length > 0 ? { prospects: researchProspects } : {}),
            }),
        })
        const payload = await response.json()

        if (!response.ok) {
            setRunning(false)
            setError(payload.message || 'Failed to start')
            return
        }

        setReusingResearch(reuseResearch || Boolean(payload.data.reusedResearch))
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

    function downloadSavedRun(saved: SavedRun): void {
        const blob = new Blob([JSON.stringify(saved, null, 2)], { type: 'application/json' })
        const url = URL.createObjectURL(blob)
        const link = document.createElement('a')
        link.href = url
        link.download = 'run.json'
        link.click()
        URL.revokeObjectURL(url)
    }

    function downloadRun(): void {
        if (!status) {
            return
        }

        downloadSavedRun({
            search,
            brief,
            websetId,
            dashboardUrl,
            prospects: status.prospects,
        })
    }

    async function loadExampleRun(): Promise<void> {
        setError('')
        const response = await fetch('/api/example-run')
        if (!response.ok) {
            setError('Example run is not saved yet')
            return
        }

        const saved = (await response.json()) as SavedRun
        setSearch(saved.search)
        setBrief(saved.brief)
        setWebsetId(saved.websetId)
        setDashboardUrl(saved.dashboardUrl || '')
        setRunning(false)
        setReusingResearch(false)
        setSequenceTabs({})
        setStatus({
            websetId: saved.websetId,
            dashboardUrl: saved.dashboardUrl || '',
            status: 'done',
            phase: 'done',
            itemCount: saved.prospects.length,
            error: '',
            prospects: saved.prospects,
        })
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
                                {running && !reusingResearch ? 'Running Websets…' : 'Run outreach research'}
                            </button>
                            <button type="button" className="secondary" onClick={loadExampleRun} disabled={running}>
                                Load example run
                            </button>
                            <a href="/api/example-run" download="run.json">
                                Download example run
                            </a>
                            {status?.status === 'done' ? (
                                <button type="button" className="secondary" onClick={downloadRun}>
                                    Download this run JSON
                                </button>
                            ) : null}
                            {dashboardUrl ? (
                                <a href={dashboardUrl} target="_blank" rel="noreferrer">
                                    Open Webset dashboard
                                </a>
                            ) : null}
                        </div>
                    </form>

                    <details className="rewrite-tools">
                        <summary>Rewrite emails</summary>
                        <label>
                            OpenAI model
                            <input
                                value={emailModel}
                                placeholder="gpt-4.1"
                                onChange={(event) => setEmailModel(event.target.value)}
                            />
                        </label>
                        <button
                            type="button"
                            className="secondary"
                            disabled={running}
                            onClick={() => {
                                startRun(true)
                            }}
                        >
                            {running && reusingResearch ? 'Rewriting emails…' : 'Rewrite emails'}
                        </button>
                    </details>
                </section>

                <section className="results-panel">
                    {error ? <p className="status error">{error}</p> : null}
                    {running || status ? (
                        <p className={`status${running ? ' running' : ''}`} aria-live="polite">
                            {running ? <span className="status-dot" aria-hidden="true" /> : null}
                            {phaseCopy[status?.phase || (reusingResearch ? 'writing-v1' : 'discovering')]}
                            {status ? ` · ${status.itemCount} found` : ''}
                        </p>
                    ) : (
                        <p className="status">Run outreach research to see companies, contacts, and drafts.</p>
                    )}

                    {(status?.prospects || []).map((prospect) => {
                        const companyLogoUrl = logoUrlFromWebsite(prospect.companyWebsite)
                        const sequenceTab = sequenceTabs[prospect.id] || defaultSequenceTab(prospect, status?.phase)

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

                                <SequenceSnapshots
                                    prospect={prospect}
                                    phase={status?.phase}
                                    running={running}
                                    tab={sequenceTab}
                                    onTabChange={(next) => {
                                        setSequenceTabs((current) => ({ ...current, [prospect.id]: next }))
                                    }}
                                />
                            </article>
                        )
                    })}
                </section>
            </div>
        </main>
    )
}
