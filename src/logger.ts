class Logger {
    info(msg: string, data?: Record<string, unknown>): void {
        console.info({ msg, data })
    }

    warn(msg: string, data?: Record<string, unknown>): void {
        console.warn({ msg, data })
    }

    error(msg: string, error?: Error, data?: Record<string, unknown>): void {
        console.error({
            msg,
            ...(error instanceof Error && { errorMsg: error.message }),
            ...(error instanceof Error && { stack: error.stack }),
            data,
        })
    }
}

export const logger = new Logger()
