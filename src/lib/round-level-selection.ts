export const ROUND_LEVEL_INDEXES_NOTE_KEY = '__meta_selected_level_indexes__';

export type SelectedLevelIndexes = Record<string, number>;

function isValidSelectedIndexes(input: unknown): input is SelectedLevelIndexes {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return false;
  return Object.values(input).every(value => Number.isInteger(value) && value >= 0);
}

export function splitRoundNotes(
  notes: Record<string, string> | null | undefined
): { userNotes: Record<string, string>; selectedLevelIndexes: SelectedLevelIndexes } {
  const rawNotes = notes || {};
  const userNotes: Record<string, string> = {};

  for (const [key, value] of Object.entries(rawNotes)) {
    if (key !== ROUND_LEVEL_INDEXES_NOTE_KEY && typeof value === 'string') {
      userNotes[key] = value;
    }
  }

  const rawMeta = rawNotes[ROUND_LEVEL_INDEXES_NOTE_KEY];
  if (!rawMeta) {
    return { userNotes, selectedLevelIndexes: {} };
  }

  try {
    const parsed = JSON.parse(rawMeta);
    if (isValidSelectedIndexes(parsed)) {
      return { userNotes, selectedLevelIndexes: parsed };
    }
  } catch {
    // ignore invalid metadata
  }

  return { userNotes, selectedLevelIndexes: {} };
}

export function composeRoundNotes(
  notes: Record<string, string>,
  selectedLevelIndexes: SelectedLevelIndexes
): Record<string, string> {
  const composedNotes: Record<string, string> = {};
  for (const [key, value] of Object.entries(notes || {})) {
    if (key !== ROUND_LEVEL_INDEXES_NOTE_KEY && typeof value === 'string') {
      composedNotes[key] = value;
    }
  }

  if (Object.keys(selectedLevelIndexes).length > 0) {
    composedNotes[ROUND_LEVEL_INDEXES_NOTE_KEY] = JSON.stringify(selectedLevelIndexes);
  }

  return composedNotes;
}
