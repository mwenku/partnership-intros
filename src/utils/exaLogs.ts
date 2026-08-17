function apiKeyFingerprint(apiKey: string | undefined): Record<string, unknown> {
    if (!apiKey) {
        return {
            present: false,
            length: 0,
        }
    }

    return {
        present: true,
        length: apiKey.length,
        prefix: apiKey.slice(0, 6),
        suffix: apiKey.slice(-4),
    }
}

function exaErrorFields(error: unknown): Record<string, unknown> {
    if (!(error instanceof Error)) {
        return { error }
    }

    const exaError = error as Error & {
        statusCode?: number
        path?: string
        type?: string
        code?: string
        detail?: unknown
        requestId?: string
        timestamp?: string
    }

    return {
        name: exaError.name,
        message: exaError.message,
        statusCode: exaError.statusCode,
        path: exaError.path,
        type: exaError.type,
        code: exaError.code,
        detail: exaError.detail,
        requestId: exaError.requestId,
        timestamp: exaError.timestamp,
    }
}

export { apiKeyFingerprint, exaErrorFields }
