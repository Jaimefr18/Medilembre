import { afterAll, describe, expect, it } from "vitest";
// @ts-expect-error - script ESM na raiz sem d.ts em src
import { createPharmacy as rawCreatePharmacy } from "../../../scripts/create-pharmacy.mjs";
import { checkPassword } from "./auth.js";
import { pool } from "./db.js";

interface CreatePharmacyParams {
  name: string;
  email: string;
  password: string;
  nif?: string | null;
  phone?: string | null;
  connectionString?: string;
}

interface CreatePharmacyReturn {
  pharmacyId: string;
  name: string;
  email: string;
  hash: string;
}

const createPharmacy = rawCreatePharmacy as (
  options: CreatePharmacyParams,
) => Promise<CreatePharmacyReturn>;

const hasDb = Boolean(process.env.DATABASE_URL_ADMIN ?? process.env.DATABASE_URL);

describe.skipIf(!hasDb)("scripts/create-pharmacy.mjs", () => {
  const testEmail = `test-admin-${Date.now()}@farmacia.ao`;
  let createdPharmacyId: string | null = null;

  afterAll(async () => {
    if (createdPharmacyId) {
      await pool.query("delete from pharmacies where id = $1", [createdPharmacyId]);
    }
    await pool.end();
  });

  it("rejeita senha com menos de 10 caracteres", async () => {
    await expect(
      createPharmacy({
        name: "Farmácia Teste",
        email: "valido@farmacia.ao",
        password: "curta",
      }),
    ).rejects.toThrow("pelo menos 10 caracteres");
  });

  it("rejeita email inválido", async () => {
    await expect(
      createPharmacy({
        name: "Farmácia Teste",
        email: "email-invalido",
        password: "senha-valida-10",
      }),
    ).rejects.toThrow("formato de email inválido");
  });

  it("cria farmácia e utilizador admin com hash argon2id verificável", async () => {
    const password = "senha-muito-segura-10";
    const result = await createPharmacy({
      name: "Farmácia Central Teste",
      email: testEmail,
      password,
      nif: "123456789",
      phone: "+244900000000",
    });

    expect(result.pharmacyId).toBeDefined();
    expect(result.email).toBe(testEmail);
    createdPharmacyId = result.pharmacyId;

    // Verificar na base de dados
    const userRes = await pool.query(
      "select id, pharmacy_id, name, email, role, password_hash from pharmacy_users where email = $1",
      [testEmail],
    );
    expect(userRes.rows.length).toBe(1);
    const user = userRes.rows[0];
    expect(user.pharmacy_id).toBe(result.pharmacyId);
    expect(user.role).toBe("admin");

    // Verificar autenticação com checkPassword
    const valid = await checkPassword(user.password_hash, password);
    expect(valid).toBe(true);

    const invalid = await checkPassword(user.password_hash, "senha-errada");
    expect(invalid).toBe(false);
  });

  it("rejeita email duplicado", async () => {
    await expect(
      createPharmacy({
        name: "Outra Farmácia",
        email: testEmail,
        password: "outra-senha-10",
      }),
    ).rejects.toThrow("já existe um utilizador registado com o email");
  });
});
