/**
 * Password length bounds.
 *
 * Their own module because `src/lib/validation/schemas.ts` is imported by client
 * components, and `src/lib/auth/password.ts` — which would otherwise own these
 * constants — reaches for `node:crypto` the moment it is loaded.
 */

export const PASSWORD_MIN_LENGTH = 8;

/**
 * An upper bound exists only to cap the work an unauthenticated request can ask
 * the server to do; it is not a security property.
 */
export const PASSWORD_MAX_LENGTH = 128;
