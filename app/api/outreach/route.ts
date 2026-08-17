import { getOutreachStatus } from '@/src/handlers/getOutreachStatus'
import { startOutreach } from '@/src/handlers/startOutreach'
import { APIResponse } from '@/src/utils/endpointResponses'
import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

function toNextResponse(result: APIResponse): NextResponse {
    return NextResponse.json(JSON.parse(result.body), { status: result.statusCode })
}

async function POST(request: NextRequest): Promise<NextResponse> {
    const body = await request.json()
    const result = await startOutreach(body)
    return toNextResponse(result)
}

async function GET(request: NextRequest): Promise<NextResponse> {
    const websetId = request.nextUrl.searchParams.get('websetId')
    const result = await getOutreachStatus(websetId)
    return toNextResponse(result)
}

export { GET, POST }
