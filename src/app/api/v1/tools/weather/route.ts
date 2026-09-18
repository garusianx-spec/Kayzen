import { z } from 'zod';

import { withAuthedRoute } from '@/lib/api/handler';
import { DEFAULT_CITY_ID, findCity } from '@/lib/domain/iran-geo';
import { ApiError } from '@/lib/errors';
import { fetchForecast } from '@/lib/weather/open-meteo';
import type { ForecastDto } from '@/types/domain';

/**
 * `GET /api/v1/tools/weather?city=tehran` — one city's forecast.
 *
 * Proxied rather than called from the browser, for three reasons that all point
 * the same way: the upstream response is shared between every reader looking at
 * the same city, so Next's data cache turns a hundred readers into one request;
 * the parsing lives on one side of the wire instead of in every client; and the
 * app's own error envelope is what the UI already knows how to render.
 *
 * The city is resolved against the bundled index, so the route never forwards a
 * client-supplied latitude — which would make this an open proxy for arbitrary
 * coordinates, and a way to use the app's IP to geolocate anything.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const querySchema = z.object({
  city: z.string().trim().min(1).max(64).default(DEFAULT_CITY_ID),
});

type WeatherQuery = z.infer<typeof querySchema>;

export const GET = withAuthedRoute<undefined, WeatherQuery, { forecast: ForecastDto }>({
  querySchema,
  rateLimit: 'read',
  handler: async ({ query, user }) => {
    const resolved = findCity(query.city);
    if (!resolved) throw ApiError.notFound('این شهر را نمی‌شناسیم.');

    return {
      // The reader's own timezone, not the city's: somebody in تهران checking
      // the weather in چابهار wants "۶ صبح" to mean six their time, because
      // that is the clock they are planning against. Iran has one zone anyway;
      // the distinction only shows up for an account set elsewhere.
      forecast: await fetchForecast(resolved.city, resolved.province, user.timezone),
    };
  },
});
