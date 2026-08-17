import { readFile } from 'fs/promises'
import { join } from 'path'
import { ProspectType, VendorBriefType } from '../zod-schemas'

type SavedRun = {
    search: string
    brief: VendorBriefType
    websetId: string
    dashboardUrl: string
    prospects: ProspectType[]
}

const exampleRunFiles = ['example_output.json', 'run.json']

async function readExampleRun(): Promise<SavedRun> {
    for (const fileName of exampleRunFiles) {
        try {
            const contents = await readFile(join(process.cwd(), 'examples', fileName), 'utf8')
            return JSON.parse(contents) as SavedRun
        } catch {
            continue
        }
    }

    throw new Error('Example run is not saved yet')
}

export { readExampleRun }
export type { SavedRun }
