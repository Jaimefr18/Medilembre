import { describe, expect, it } from "vitest";
import { canTransition, generateReminders } from "./index";

const base = { zone: "Africa/Luanda", startDate: "2026-10-05", endDate: "2026-10-07" };
const from = new Date("2026-10-05T00:00:00Z");

describe("generateReminders", () => {
  it("converte 08:00 de Luanda (UTC+1) para 07:00Z", () => {
    const r = generateReminders({ ...base, timesLocal: ["08:00"], from });
    expect(r[0].toISOString()).toBe("2026-10-05T07:00:00.000Z");
  });
  it("respeita o fim do plano", () => {
    expect(generateReminders({ ...base, timesLocal: ["08:00", "20:00"], from })).toHaveLength(6);
  });
  it("ignora horas já passadas", () => {
    const r = generateReminders({
      ...base,
      timesLocal: ["08:00"],
      from: new Date("2026-10-06T10:00:00Z"),
    });
    expect(r.map((d) => d.toISOString())).toEqual(["2026-10-07T07:00:00.000Z"]);
  });
});

describe("estados do plano", () => {
  it("não deixa reativar um plano terminado", () => {
    expect(canTransition("terminado", "ativo")).toBe(false);
    expect(canTransition("aguarda_ativacao", "ativo")).toBe(true);
  });
});
