import { parseFourEmails } from '../../../../src/utils/parseFourEmails'

describe('parseFourEmails unit tests', () => {
    describe('error handling', () => {
        it('should return four empty strings if the text is blank', () => {
            expect(parseFourEmails('')).toEqual(['', '', '', ''])
            expect(parseFourEmails('   ')).toEqual(['', '', '', ''])
        })

        it('should keep a single unlabelled blob in the first slot', () => {
            expect(parseFourEmails('Hello from Souk on behalf of Harborline.')).toEqual([
                'Hello from Souk on behalf of Harborline.',
                '',
                '',
                '',
            ])
        })
    })

    describe('success', () => {
        it('should split labelled EMAIL 1 to EMAIL 4 blocks', () => {
            const text = `EMAIL 1
Intro

EMAIL 2
Proof

EMAIL 3
Value

EMAIL 4
Close`

            expect(parseFourEmails(text)).toEqual(['Intro', 'Proof', 'Value', 'Close'])
        })

        it('should split numbered 1. 2. 3. 4. blocks', () => {
            const text = `1. Intro
2. Proof
3. Value
4. Close`

            expect(parseFourEmails(text)).toEqual(['Intro', 'Proof', 'Value', 'Close'])
        })
    })
})
