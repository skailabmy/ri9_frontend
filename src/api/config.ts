/* ============================================================
   RI9 · API configuration
   Base URL comes from Vite env files (.env.development /
   .env.production). Because this lives in WEB code (not
   capacitor.config.json), switching backends is an OTA push —
   not a native rebuild.
   ============================================================ */
export const API_BASE_URL: string = import.meta.env.VITE_API_BASE_URL ?? '/api';

/** CloudFront CDN base URL for static app assets, products & prize images */
export const CLOUDFRONT_APP_URL: string =
  import.meta.env.VITE_CLOUDFRONT_APP_URL ?? 'https://d4p30divqiye2.cloudfront.net/app';

