export const env = {
  port: Number(process.env.PORT ?? 3000),
  production: process.env.NODE_ENV === "production",
  databaseUrl: process.env.DATABASE_URL ?? "",
  vapidPublicKey: process.env.VAPID_PUBLIC_KEY ?? "",
};
