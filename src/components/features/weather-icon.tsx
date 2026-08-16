import React from 'react'
import {
  Cloud,
  CloudDrizzle,
  CloudFog,
  CloudLightning,
  CloudMoon,
  CloudRain,
  CloudSnow,
  CloudSun,
  Cloudy,
  Moon,
  Sun,
} from 'lucide-react'

/**
 * Kreslená ikona stavu počasí podle kódu OpenWeather (01d…50n) — sdílená
 * přehledem počasí u zemí a bočním panelem u míst. Emoji se sem nehodí: mají
 * vlastní barevnost, kterou nejde sladit s podkladem (na fotce zanikaly, v
 * klidném panelu naopak křičely).
 */
export const WEATHER_ICON: Record<string, React.ComponentType<{ className?: string }>> = {
  '01d': Sun,
  '01n': Moon,
  '02d': CloudSun,
  '02n': CloudMoon,
  '03d': Cloud,
  '03n': Cloud,
  '04d': Cloudy,
  '04n': Cloudy,
  '09d': CloudDrizzle,
  '09n': CloudDrizzle,
  '10d': CloudRain,
  '10n': CloudRain,
  '11d': CloudLightning,
  '11n': CloudLightning,
  '13d': CloudSnow,
  '13n': CloudSnow,
  '50d': CloudFog,
  '50n': CloudFog,
}

/** Neznámý kód nekreslí nic — layout na ikonu nespoléhá. */
export function WeatherIcon({
  icon,
  className,
}: {
  icon: string | null
  className?: string
}): React.ReactElement | null {
  const Icon = icon ? WEATHER_ICON[icon] : null
  if (!Icon) return null
  return <Icon className={className} />
}
