/**
 * Arabic-aware text normalisation for local search.
 * Finds «الأهداف» when the user types «الاهداف», ignores diacritics and
 * tatweel, and treats ة/ه and ى/ي as the same letter.
 */
const DIACRITICS = /[ؐ-ًؚ-ٰٟۖ-ۭ]/g;
const TATWEEL = /ـ/g;

export function normalizeArabic(input: string): string {
  return input
    .normalize('NFKC')
    .replace(DIACRITICS, '')
    .replace(TATWEEL, '')
    .replace(/[إأآٱ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/ؤ/g, 'و')
    .replace(/ئ/g, 'ي')
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/** True when every word of the query appears somewhere in the haystack fields. */
export function matchesQuery(query: string, ...fields: (string | string[] | undefined)[]): boolean {
  const q = normalizeArabic(query);
  if (!q) return true;
  const hay = normalizeArabic(
    fields
      .flat()
      .filter((f): f is string => typeof f === 'string')
      .join(' '),
  );
  return q.split(' ').every((word) => hay.includes(word));
}
