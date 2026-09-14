import '@testing-library/jest-dom/vitest';

/**
 * Test environment contract.
 *
 * `serverEnv()` refuses to parse an incomplete environment, which is the point
 * — but unit tests should not need a `.env`. These are syntactically valid,
 * obviously fake values; nothing here reaches a network or a database.
 */
process.env.AUTH_JWT_SECRET ??= 'unit-test-secret-unit-test-secret-unit-test-secret';
process.env.AUTH_OTP_PEPPER ??= 'unit-test-pepper-unit-test-pepper-unit-test-pepper';
process.env.DATABASE_URL ??= 'postgresql://kayzen:kayzen@localhost:5432/kayzen';
process.env.DIRECT_URL ??= process.env.DATABASE_URL;
process.env.NEXT_PUBLIC_APP_URL ??= 'https://kayzen.app';
process.env.SMS_PROVIDER ??= 'console';
