import cookie from "@fastify/cookie";
import rateLimit from "@fastify/rate-limit";
import Fastify, { type FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
// @ts-expect-error - script ESM na raiz sem d.ts em src
import { createPharmacy as rawCreatePharmacy } from "../../../scripts/create-pharmacy.mjs";
import { pool } from "./db.js";
import { _resetIpRateLimitsForTesting, ipRateLimitGuard, pharmacyRoutes } from "./farmacia.js";

interface CreatePharmacyParams {
  name: string;
  email: string;
  password: string;
  nif?: string | null;
  phone?: string | null;
  connectionString?: string;
}

const createPharmacy = rawCreatePharmacy as (
  options: CreatePharmacyParams,
) => Promise<{ pharmacyId: string; name: string; email: string; hash: string }>;

const hasDb = Boolean(process.env.DATABASE_URL_ADMIN ?? process.env.DATABASE_URL);

describe.skipIf(!hasDb)("API /api/farmacia/login e rate limit", () => {
  let app: FastifyInstance;
  const adminEmail = `admin-login-${Date.now()}@farmacia.ao`;
  const adminPassword = "senha-super-segura-10";
  let pharmacyId: string | null = null;
  let validCookie = "";

  beforeAll(async () => {
    // Criar farmácia e utilizador admin
    const created = await createPharmacy({
      name: "Farmácia Teste Login",
      email: adminEmail,
      password: adminPassword,
      nif: "999888777",
      phone: "+244923000111",
    });
    pharmacyId = created.pharmacyId;

    // Configurar app Fastify de teste
    app = Fastify();
    await app.register(cookie);
    await app.register(rateLimit);
    await app.register(pharmacyRoutes, { prefix: "/api/farmacia" });
    await app.ready();
  });

  afterAll(async () => {
    if (pharmacyId) {
      await pool.query("delete from pharmacies where id = $1", [pharmacyId]);
    }
    await app.close();
    await pool.end();
  });

  it("recusa login sem header csrf (x-ml)", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/farmacia/auth/login",
      payload: { email: adminEmail, password: adminPassword },
    });
    expect(res.statusCode).toBe(403);
  });

  it("recusa login com senha incorreta", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/farmacia/auth/login",
      headers: { "x-ml": "1" },
      payload: { email: adminEmail, password: "senha-errada-10" },
    });
    expect(res.statusCode).toBe(401);
    expect(res.json()).toEqual({ error: "email ou senha incorretos" });
  });

  it("recusa login com email inexistente", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/farmacia/auth/login",
      headers: { "x-ml": "1" },
      payload: { email: "fantasma@farmacia.ao", password: "senha-qualquer-10" },
    });
    expect(res.statusCode).toBe(401);
    expect(res.json()).toEqual({ error: "email ou senha incorretos" });
  });

  it("realiza login com sucesso e define cookie ml_ph", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/farmacia/auth/login",
      headers: { "x-ml": "1" },
      payload: { email: adminEmail, password: adminPassword },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true });

    // Verificar cookie
    const cookies = res.cookies;
    const phCookie = cookies.find((c) => c.name === "ml_ph");
    expect(phCookie).toBeDefined();
    expect(phCookie?.httpOnly).toBe(true);
    expect(phCookie?.path).toBe("/api/farmacia");
    expect(phCookie?.sameSite).toBe("Strict");

    validCookie = `${phCookie?.name}=${phCookie?.value}`;

    // Verificar se sessão foi inserida na tabela sessions
    const sessions = await pool.query(
      "select s.id from sessions s join pharmacy_users u on u.id = s.user_id where u.email = $1",
      [adminEmail],
    );
    expect(sessions.rows.length).toBeGreaterThan(0);
  });

  it("acede a /api/farmacia/auth/me com cookie de sessão", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/farmacia/auth/me",
      headers: { cookie: validCookie },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.user).toBe("Farmácia Teste Login");
    expect(body.pharmacy).toBe("Farmácia Teste Login");
  });

  it("recusa /api/farmacia/auth/me sem sessão", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/farmacia/auth/me",
    });
    expect(res.statusCode).toBe(401);
    expect(res.json()).toEqual({ error: "sessão em falta" });
  });

  it("aplica rate limit de 5 tentativas por identificador e não bloqueia outros utilizadores no mesmo IP (CGNAT)", async () => {
    const targetEmail = `brute-force-${Date.now()}@farmacia.ao`;
    const siblingEmail = `innocent-user-${Date.now()}@farmacia.ao`;

    // 5 tentativas para o email alvo
    for (let i = 0; i < 5; i++) {
      const res = await app.inject({
        method: "POST",
        url: "/api/farmacia/auth/login",
        headers: { "x-ml": "1" },
        payload: { email: targetEmail, password: "senha-tentativa-10" },
      });
      expect(res.statusCode).toBe(401);
    }

    // A 6ª tentativa para o mesmo email deve ser bloqueada com 429
    const blockedRes = await app.inject({
      method: "POST",
      url: "/api/farmacia/auth/login",
      headers: { "x-ml": "1" },
      payload: { email: targetEmail, password: "senha-tentativa-10" },
    });
    expect(blockedRes.statusCode).toBe(429);
    expect(blockedRes.json().message).toContain("Demasiadas tentativas");

    // Outro email no MESMO IP deve continuar a ter resposta normal (401 e não 429)
    const otherRes = await app.inject({
      method: "POST",
      url: "/api/farmacia/auth/login",
      headers: { "x-ml": "1" },
      payload: { email: siblingEmail, password: "senha-tentativa-10" },
    });
    expect(otherRes.statusCode).toBe(401);
  });

  it("limita IP quando atinge o limite alto da rede (ipRateLimitGuard)", async () => {
    _resetIpRateLimitsForTesting();
    const fakeIp = "197.149.200.1"; // IP angolano de teste

    let blocked = false;
    // Dispara 65 pedidos simulados do mesmo IP
    for (let i = 0; i < 65; i++) {
      const fakeReq = { ip: fakeIp } as any;
      const fakeReply = {
        code: (status: number) => ({
          send: (body: any) => {
            if (status === 429) blocked = true;
          },
        }),
      } as any;

      await ipRateLimitGuard(fakeReq, fakeReply);
    }

    expect(blocked).toBe(true);
    _resetIpRateLimitsForTesting();
  });

  it("efetua logout apagando a sessão", async () => {
    const logoutRes = await app.inject({
      method: "POST",
      url: "/api/farmacia/auth/logout",
      headers: { "x-ml": "1", cookie: validCookie },
    });

    expect(logoutRes.statusCode).toBe(200);
    expect(logoutRes.json()).toEqual({ ok: true });

    // Acesso subsequente a /auth/me com o cookie antigo deve falhar
    const meRes = await app.inject({
      method: "GET",
      url: "/api/farmacia/auth/me",
      headers: { cookie: validCookie },
    });
    expect(meRes.statusCode).toBe(401);
  });
});
