// Auto-format names: capitalize first letter of each word, lowercase the rest
// Handles hyphenated names (e.g., "mary-jane" → "Mary-Jane")

export function properCase(input: string): string {
  return input
    .split(/(\s+|-)/g)
    .map((part) => {
      if (part === ' ' || part === '-' || !part) return part;
      return part.charAt(0).toUpperCase() + part.slice(1).toLowerCase();
    })
    .join('');
}
