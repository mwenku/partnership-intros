import type { Metadata } from 'next'
import { ReactElement, ReactNode } from 'react'
import './globals.css'

export const metadata: Metadata = {
    title: 'Souk partner outreach',
    description: 'Research prospects and draft a four-email partner recruitment sequence.',
}

export default function RootLayout({ children }: { children: ReactNode }): ReactElement {
    return (
        <html lang="en">
            <body>{children}</body>
        </html>
    )
}
