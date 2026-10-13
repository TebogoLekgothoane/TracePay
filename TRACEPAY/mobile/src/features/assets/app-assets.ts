/**
 * Public CDN URLs for app illustrations hosted in Supabase Storage (`app-assets`).
 * Merchant logos stay on Hunter — same pattern as banking apps (CDN brand marks).
 */

const APP_ASSETS_BUCKET = "app-assets";

function supabasePublicBase(): string | null {
  const raw = (process.env.EXPO_PUBLIC_SUPABASE_URL ?? "").trim();
  if (!raw) return null;
  return raw.replace(/\/+$/, "");
}

export function appAssetPublicUrl(objectPath: string): string | null {
  const base = supabasePublicBase();
  if (!base) return null;
  const path = objectPath.replace(/^\/+/, "");
  return `${base}/storage/v1/object/public/${APP_ASSETS_BUCKET}/${path}`;
}

export const TRANSPORT_INSIGHT_URL = appAssetPublicUrl(
  "illustrations/transport-insight.png",
);
