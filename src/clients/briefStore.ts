import { VendorBriefType } from '../zod-schemas'

const briefsByWebset = new Map<string, VendorBriefType>()

function setStoredBrief(websetId: string, brief: VendorBriefType): void {
    briefsByWebset.set(websetId, brief)
}

function getStoredBrief(websetId: string): VendorBriefType | undefined {
    return briefsByWebset.get(websetId)
}

export { getStoredBrief, setStoredBrief }
