// Search text folding — shared by every accent-insensitive matcher.
//
// One rule for "does this text contain what was typed", ignoring case and
// diacritics, so a search for `svetlo` finds `Světlo` and `Emi` folds the same
// way `emi` does. NFD splits each accented letter into its base plus a combining
// mark, the Unicode `Diacritic` property matches those marks, and stripping them
// leaves the ASCII skeleton; `toLowerCase` folds case on top. ASCII input is
// unchanged, so existing English matching behaves exactly as before.

/** Case- and diacritics-insensitive form of `value`, for `includes` matching. */
export function foldForSearch(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();
}
