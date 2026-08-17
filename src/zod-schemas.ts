import { z } from 'zod'

export const VendorBrief = z.object({
    vendorName: z.string().min(1),
    website: z.string().min(1),
    offer: z.string().min(1),
    objective: z.string().min(1),
    idealPartner: z.string().min(1),
    targetCustomers: z.string().min(1),
    partnerContributes: z.string().min(1),
    partnerGains: z.string().min(1),
    constraints: z.string().min(1),
})

export const Source = z.object({
    title: z.string(),
    snippet: z.string(),
    url: z.string(),
})

export const CriterionEvaluation = z.object({
    criterion: z.string(),
    satisfied: z.string(),
    reasoning: z.string(),
    sources: z.array(Source),
})

export const Signal = z.object({
    text: z.string(),
    sources: z.array(Source),
})

export const EmailJudgementCheck = z.object({
    id: z.string(),
    label: z.string(),
    passed: z.boolean(),
    evidence: z.string(),
})

export const EmailJudgementByEmail = z.object({
    emailNumber: z.number(),
    verdict: z.enum(['ready', 'revise']),
    summary: z.string(),
    checks: z.array(EmailJudgementCheck),
})

export const EmailJudgement = z.object({
    overallVerdict: z.enum(['ready', 'revise']),
    overallSummary: z.string(),
    gaps: z.array(z.string()),
    byEmail: z.array(EmailJudgementByEmail),
})

export const EmailImprovement = z.object({
    problemSource: z.enum(['discovery', 'enrichment', 'signal-selection', 'writing']),
    problemSourceWhy: z.string(),
    weakInFirst: z.string(),
    whatChanged: z.string(),
    howImproved: z.string(),
    fixedGaps: z.array(z.string()),
    remainingGaps: z.array(z.string()),
})

export const Prospect = z.object({
    id: z.string(),
    name: z.string(),
    position: z.string(),
    location: z.string(),
    profileUrl: z.string(),
    pictureUrl: z.string(),
    companyName: z.string(),
    companyWebsite: z.string(),
    email: z.string(),
    companyFit: z.string(),
    personFit: z.string(),
    evaluations: z.array(CriterionEvaluation),
    signals: z.array(Signal),
    selectedSignal: z.string(),
    selectedSignalWhy: z.string(),
    sources: z.array(Source),
    emailsV1: z.array(z.string()),
    emailsV2: z.array(z.string()),
    emailJudgementV1: EmailJudgement,
    emailJudgement: EmailJudgement,
    emailImprovement: EmailImprovement,
})

export const OutreachRequest = z.object({
    search: z.string().min(1),
    brief: VendorBrief,
    reuseResearch: z.boolean().optional(),
    emailModel: z.string().optional(),
    prospects: z.array(Prospect).optional(),
})

export const OutreachPhase = z.enum(['discovering', 'researching', 'writing-v1', 'writing-v2', 'done'])

export const OutreachStatus = z.object({
    websetId: z.string(),
    dashboardUrl: z.string(),
    status: z.enum(['running', 'done', 'error']),
    phase: OutreachPhase,
    itemCount: z.number(),
    error: z.string(),
    prospects: z.array(Prospect),
})

export const StartOutreachResponse = z.object({
    websetId: z.string(),
    dashboardUrl: z.string(),
    reusedResearch: z.boolean().optional(),
})

export type VendorBriefType = z.infer<typeof VendorBrief>
export type OutreachRequestType = z.infer<typeof OutreachRequest>
export type SourceType = z.infer<typeof Source>
export type CriterionEvaluationType = z.infer<typeof CriterionEvaluation>
export type SignalType = z.infer<typeof Signal>
export type EmailJudgementCheckType = z.infer<typeof EmailJudgementCheck>
export type EmailJudgementByEmailType = z.infer<typeof EmailJudgementByEmail>
export type EmailJudgementType = z.infer<typeof EmailJudgement>
export type EmailImprovementType = z.infer<typeof EmailImprovement>
export type ProspectType = z.infer<typeof Prospect>
export type OutreachPhaseType = z.infer<typeof OutreachPhase>
export type OutreachStatusType = z.infer<typeof OutreachStatus>
export type StartOutreachResponseType = z.infer<typeof StartOutreachResponse>
