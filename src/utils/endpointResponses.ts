import { ZodError } from 'zod'

export type APIResponse = {
    statusCode: number
    body: string
}

const defaultResponseMessage: Record<string, string> = {
    '200': 'Ok',
    '400': 'Validation error',
    '401': 'Unauthorised',
    '404': 'Not found',
    '500': 'Internal error',
}

const apiResponse = (statusCode: number, message?: string, body?: unknown): APIResponse => {
    return {
        statusCode,
        body: JSON.stringify(
            body
                ? { ...body, message }
                : {
                      message: message ?? defaultResponseMessage[statusCode.toString()],
                  },
        ),
    }
}

const successResponse = <T>(obj?: T): APIResponse => {
    return {
        statusCode: 200,
        body: JSON.stringify({
            message: 'Ok',
            data: obj,
        }),
    }
}

const internalError = (): APIResponse => {
    return {
        statusCode: 500,
        body: JSON.stringify({
            message: 'Internal error',
        }),
    }
}

const validationError = (error: ZodError): APIResponse => {
    return {
        statusCode: 400,
        body: JSON.stringify({
            message: 'Validation error',
            validationError: error.issues.map((issue) => ({
                path: issue.path,
                code: issue.code,
                message: issue.message,
            })),
        }),
    }
}

export { apiResponse, internalError, successResponse, validationError }
