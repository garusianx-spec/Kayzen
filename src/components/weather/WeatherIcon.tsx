'use client';

import {
  Cloud,
  CloudDrizzle,
  CloudFog,
  CloudHail,
  CloudLightning,
  CloudMoon,
  CloudOff,
  CloudRain,
  CloudRainWind,
  CloudSnow,
  CloudSun,
  Moon,
  Sun,
  type LucideIcon,
} from 'lucide-react';

import { cn } from '@/lib/utils';
import type { WeatherLook } from '@/types/domain';

/**
 * A weather glyph, resolved from the name the server sent.
 *
 * The condition table is a plain data module so the route handler can import it
 * without dragging React in; the cost is that icons arrive as strings and have
 * to be looked up here. An explicit map rather than `lucide[name]`, because a
 * dynamic index defeats tree-shaking and would ship the whole icon set — about
 * a thousand components — to every reader who opened the weather tool.
 */

const ICONS: Record<string, LucideIcon> = {
  Sun,
  Moon,
  Cloud,
  CloudSun,
  CloudMoon,
  CloudFog,
  CloudDrizzle,
  CloudRain,
  CloudRainWind,
  CloudHail,
  CloudSnow,
  CloudLightning,
  CloudOff,
};

const TONES: Record<WeatherLook['tone'], string> = {
  violet: 'text-violet',
  flame: 'text-flame',
  emerald: 'text-emerald',
  rose: 'text-rose',
  sky: 'text-sky',
};

export function WeatherIcon({
  look,
  className,
}: {
  look: Pick<WeatherLook, 'icon' | 'tone' | 'label'>;
  className?: string;
}) {
  const Icon = ICONS[look.icon] ?? CloudOff;

  // The label rides on the wrapper rather than the glyph, so a screen reader
  // hears "باران" once instead of hearing the icon name too.
  return <Icon className={cn('h-5 w-5', TONES[look.tone], className)} aria-hidden />;
}
