import { readFile } from 'fs/promises'
import { join } from 'path'
import { NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

async function GET(): Promise<NextResponse> {
    try {
        const contents = await readFile(join(process.cwd(), 'examples', 'run.json'), 'utf8')
        return new NextResponse(contents, {
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
