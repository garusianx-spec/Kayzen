import { NextResponse } from 'next/server';

/**
 * `GET /api/v1/health` — liveness probe.
 *
 * Deliberately does not touch the database: a container that cannot reach
 * Postgres should stay in the load balancer long enough to serve cached pages
 * and report the failure, rather than being killed and restarted into the same
 * outage. Readiness (including the database) is a separate concern.
 */

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

export function GET(): NextResponse {
  return NextResponse.json(
    {
      ok: true,
      service: 'kayzen',
      version: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? 'dev',
      timestamp: new Date().toISOString(),
    },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
