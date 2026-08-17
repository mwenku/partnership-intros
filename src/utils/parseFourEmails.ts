function parseFourEmails(text: string): string[] {
    if (!text.trim()) {
        return ['', '', '', '']
    }

    const labelled = text
        .split(/^\s*EMAIL\s*[1-4]\s*[:.\-)]*\s*/im)
        .map((part) => part.trim())
        .filter(Boolean)

    if (labelled.length >= 4) {
        return labelled.slice(0, 4)
    }

    const numbered = text
        .split(/^\s*[1-4][.:)]\s+/m)
        .map((part) => part.trim())
        .filter(Boolean)

    if (numbered.length >= 4) {
        return numbered.slice(0, 4)
    }

    const blocks = text
        .split(/\n{2,}/)
        .map((part) => part.trim())
        .filter(Boolean)

    if (blocks.length >= 4) {
        return blocks.slice(0, 4)
    }

    return [text.trim(), '', '', '']
}

export { parseFourEmails }
