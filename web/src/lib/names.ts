/** A person's name as others see it: their own, or their email's first half. */
export function displayName(u: { name: string | null; email: string }): string {
  return u.name?.trim() || u.email.split("@")[0];
}
