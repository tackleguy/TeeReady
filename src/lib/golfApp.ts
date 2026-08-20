// TeeReady is the standalone golf product. WeatherStop remains a separate app;
// deep-link back when a weather origin is configured.

export function weatherAppHref(): string {
  const origin = import.meta.env.VITE_WEATHER_ORIGIN as string | undefined;
  return origin && origin.length ? origin : 'https://weather-stop.vercel.app';
}
