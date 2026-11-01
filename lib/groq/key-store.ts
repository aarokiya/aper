import {
  readEnvValue,
  removeEnvValue,
  setEnvValue,
} from '@/lib/env-file';

const variable = 'GROQ_API_KEY';
// Groq issues keys as gsk_ followed by an alphanumeric body.
const keyPattern = /^gsk_[A-Za-z0-9]{20,}$/;

export const isGroqKey = (value: string) => keyPattern.test(value.trim());

/** Only ever the prefix and last four characters leave the server. */
const mask = (key: string) =>
  key.length > 12 ? `${key.slice(0, 4)}…${key.slice(-4)}` : 'gsk_…';

export function groqKeyStatus() {
  const key = process.env[variable]?.trim();
  return {
    configured: Boolean(key),
    hint: key ? mask(key) : null,
    // A key exported into the shell wins over the file, and removing the file
    // entry would not disable it, so the UI has to be able to say which is which.
    inEnvFile: readEnvValue(variable) !== null,
  };
}

export function saveGroqKey(key: string) {
  const value = key.trim();
  if (!isGroqKey(value)) throw new Error('That does not look like a Groq key.');
  setEnvValue(
    variable,
    value,
    '# Groq: quick capture in the command palette, the study tutor, and the grader.',
  );
  // Apply to the running server too; .env is only read at startup.
  process.env[variable] = value;
  return groqKeyStatus();
}

export function clearGroqKey() {
  removeEnvValue(variable);
  delete process.env[variable];
  return groqKeyStatus();
}
