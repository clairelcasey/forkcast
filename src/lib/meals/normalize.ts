// The saved-meal cache key: two lines that differ only in case, spacing,
// punctuation or a leading "I had" are the same meal. Anything else (amounts,
// "no rice", brands) stays significant.

const LEADING_FILLER =
  /^(?:(?:i|we)\s+(?:had|ate|got)|had|ate|just\s+had|for\s+(?:breakfast|lunch|dinner)\s+i\s+had)\s+/;

export function mealMatchKey(text: string): string {
  return (
    text
      .normalize("NFKC")
      .toLowerCase()
      // Curly quotes and apostrophes: "mcdonald’s" == "mcdonalds".
      .replace(/['’‘`]/g, "")
      // NFKC turns "½" into "1⁄2" (fraction slash); spell it "1/2".
      .replace(/(\d)\s*[⁄/]\s*(\d)/g, "$1/$2")
      // Keep letters, digits, %, fractions and decimal points.
      .replace(/[^\p{L}\p{N}%./\s]/gu, " ")
      // A slash that isn't part of a fraction is punctuation.
      .replace(/\/(?!\d)|(?<!\d)\//g, " ")
      // A dot that isn't a decimal point is punctuation.
      .replace(/\.(?!\d)/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .replace(LEADING_FILLER, "")
  );
}
