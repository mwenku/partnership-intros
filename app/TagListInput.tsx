'use client'

import { KeyboardEvent, ReactElement, useState } from 'react'
import { InputActionMeta, MultiValue } from 'react-select'
import CreatableSelect from 'react-select/creatable'

type TagOption = {
    label: string
    value: string
}

type TagListInputProps = {
    instanceId: string
    value: string
    placeholder: string
    onChange: (value: string) => void
}

function splitTags(value: string): string[] {
    return value
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean)
}

function toOptions(value: string): TagOption[] {
    return splitTags(value).map((item) => ({
        label: item,
        value: item,
    }))
}

function joinTags(options: readonly TagOption[]): string {
    return options.map((option) => option.value).join(', ')
}

function addTags(currentValue: string, incoming: string[]): string {
    const next = splitTags(currentValue)

    for (const item of incoming) {
        const trimmed = item.trim()
        if (!trimmed) {
            continue
        }

        if (next.some((existing) => existing.toLowerCase() === trimmed.toLowerCase())) {
            continue
        }

        next.push(trimmed)
    }

    return next.join(', ')
}

function HiddenIndicator(): null {
    return null
}

const tagSelectComponents = {
    DropdownIndicator: HiddenIndicator,
    IndicatorSeparator: HiddenIndicator,
}

function TagListInput({ instanceId, value, placeholder, onChange }: TagListInputProps): ReactElement {
    const [inputValue, setInputValue] = useState('')

    function commitTags(incoming: string[]): void {
        onChange(addTags(value, incoming))
        setInputValue('')
    }

    function handleInputChange(nextInput: string, meta: InputActionMeta): void {
        if (meta.action !== 'input-change') {
            return
        }

        if (!nextInput.includes(',')) {
            setInputValue(nextInput)
            return
        }

        commitTags(nextInput.split(','))
    }

    function handleKeyDown(event: KeyboardEvent<HTMLDivElement>): void {
        if (event.key === 'Enter') {
            event.preventDefault()
            if (!inputValue.trim()) {
                return
            }

            commitTags([inputValue])
            return
        }

        if (event.key !== 'Tab' || !inputValue.trim()) {
            return
        }

        event.preventDefault()
        commitTags([inputValue])
    }

    function handleBlur(): void {
        if (!inputValue.trim()) {
            return
        }

        commitTags([inputValue])
    }

    function handleChange(options: MultiValue<TagOption>): void {
        onChange(joinTags(options))
    }

    return (
        <div className="tag-list">
            <CreatableSelect
                unstyled
                isMulti
                isClearable
                menuIsOpen={false}
                openMenuOnClick={false}
                openMenuOnFocus={false}
                className="tag-select"
                classNamePrefix="tag-select"
                instanceId={instanceId}
                inputId={instanceId}
                placeholder={placeholder}
                value={toOptions(value)}
                inputValue={inputValue}
                onChange={handleChange}
                onInputChange={handleInputChange}
                onKeyDown={handleKeyDown}
                onBlur={handleBlur}
                components={tagSelectComponents}
            />
            <span className="tag-hint">Press Enter or comma to add</span>
        </div>
    )
}

export { TagListInput }
