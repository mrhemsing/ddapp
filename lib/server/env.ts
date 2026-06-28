export const PACK_SLUG = "saskatoon";
export const PACK_PRICE_CAD = 1900;
export const DEVICE_CAP = 3;
export const SESSION_COOKIE = "dd_session";

export function appUrl() {
  return process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
}

export function requireEnv(name: string) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is not configured.`);
  }
  return value;
}
