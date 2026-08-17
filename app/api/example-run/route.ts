import { readExampleRun } from '@/src/utils/exampleRun'
import { NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

async function GET(): Promise<NextResponse> {
    try {
        const saved = await readExampleRun()
        return new NextResponse(JSON.stringify(saved, null, 2), {
            headers: {
                'Content-Type': 'application/json',
                'Content-Disposition': 'attachment; filename="run.json"',
            },
        })
    } catch {
        return NextResponse.json({ message: 'Example run is not saved yet' }, { status: 404 })
    }
}

export { GET }
