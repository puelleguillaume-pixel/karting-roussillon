/** Concatène des classes en ignorant les valeurs fausses. */
export function cx(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(' ');
}
