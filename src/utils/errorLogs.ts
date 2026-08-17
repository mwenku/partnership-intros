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

function errorFields(error: unknown): Record<string, unknown> {
    if (!(error instanceof Error)) {
        return { error }
    }

    return {
        name: error.name,
        message: error.message,
    }
}

export { apiKeyFingerprint, errorFields }
