import { useState } from 'react'
import { AUTO, LANGUAGES, SAME } from '../../types/languages'
import { readSpokenLanguage, readWriteLanguage, writeSpokenLanguage, writeWriteLanguage } from './languageSettings'

interface SelectProps {
  id: string
  /** Free accounts are English only: the choice is fixed and says why. */
  locked?: boolean
}

const ENGLISH_ONLY = 'English only on the free plan'

/** Which language the user is speaking. Naming it makes recognition noticeably more accurate, for Afrikaans especially. */
export function SpokenLanguageSelect({ id, locked = false }: SelectProps) {
  const [value, setValue] = useState(readSpokenLanguage)
  return (
    <div className="flex-1 text-left">
      <label htmlFor={id} className="mb-1.5 block text-sm font-semibold">
        I will speak
      </label>
      <select
        id={id}
        value={locked ? 'en' : value}
        disabled={locked}
        onChange={(e) => {
          writeSpokenLanguage(e.target.value)
          setValue(e.target.value)
        }}
        className="field"
        aria-describedby={locked ? `${id}-note` : undefined}
      >
        <option value={AUTO}>Detect automatically</option>
        {LANGUAGES.filter((language) => language.speech).map((language) => (
          <option key={language.code} value={language.code}>
            {language.name}
          </option>
        ))}
      </select>
      {locked && (
        <p id={`${id}-note`} className="muted mt-1 text-xs">
          {ENGLISH_ONLY}
        </p>
      )}
    </div>
  )
}

/** Which language the finished draft is written in, so a message can be spoken in one language and sent in another. */
export function WriteLanguageSelect({ id, locked = false }: SelectProps) {
  const [value, setValue] = useState(readWriteLanguage)
  return (
    <div className="flex-1 text-left">
      <label htmlFor={id} className="mb-1.5 block text-sm font-semibold">
        Write it in
      </label>
      <select
        id={id}
        value={locked ? SAME : value}
        disabled={locked}
        onChange={(e) => {
          writeWriteLanguage(e.target.value)
          setValue(e.target.value)
        }}
        className="field"
        aria-describedby={locked ? `${id}-note` : undefined}
      >
        <option value={SAME}>Same language I speak</option>
        {LANGUAGES.map((language) => (
          <option key={language.code} value={language.code}>
            {language.name}
            {language.beta ? ' (check before sending)' : ''}
          </option>
        ))}
      </select>
      {locked && (
        <p id={`${id}-note`} className="muted mt-1 text-xs">
          {ENGLISH_ONLY}
        </p>
      )}
    </div>
  )
}
