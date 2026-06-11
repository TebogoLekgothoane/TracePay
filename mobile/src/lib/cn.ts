/** Join conditional Tailwind class names (filters falsy values). */
export function cn(...classes: (string | false | null | undefined)[]) {
  return classes.filter(Boolean).join(" ");
}
