import { describe, expect, it } from "vitest";
import { computeFormulas, evaluate, parseFormula } from "./formula";
import { IBaseProperty, IBaseRow } from "./types/base.types";

const calc = (src: string, vars: Record<string, any> = {}) =>
  evaluate(parseFormula(src), (n) => (n in vars ? vars[n] : null));

describe("Formeln", () => {
  it("rechnet mit Punkt vor Strich, Klammern und Potenz", () => {
    expect(calc("1 + 2 * 3")).toBe(7);
    expect(calc("(1 + 2) * 3")).toBe(9);
    expect(calc("2 ^ 3 ^ 2")).toBe(512);
    expect(calc("-2 ^ 2")).toBe(-4); // wie in der Mathematik: -(2^2)
    expect(calc("10 % 4")).toBe(2);
  });
  it("kennt Funktionen und Bedingungen", () => {
    expect(calc("round(2 / 3, 2)")).toBe(0.67);
    expect(calc('if({P} >= 50, "bestanden", "nicht bestanden")', { P: 72 })).toBe("bestanden");
    expect(calc("wenn({P} >= 50; 1; 0)", { P: 10 })).toBe(0);
    expect(calc("sum({A}, {B}, 3)", { A: 1, B: "2" })).toBe(6);
    expect(calc("max(1, 5, 3) - min(4, 2)")).toBe(3);
    expect(calc("{A} > 1 and not {B}", { A: 2, B: false })).toBe(true);
    expect(calc('"Note: " & {N}', { N: 2 })).toBe("Note: 2");
  });
  it("rechnet mit Datum und Uhrzeit", () => {
    expect(calc('days("2026-11-24", "2026-12-01")')).toBe(7);
    expect(calc('hours("2026-11-24T14:30", "2026-11-24T16:00")')).toBe(1.5);
    expect(calc('adddays("2026-12-30", 3)')).toBe("2027-01-02");
    expect(calc('month("2026-11-24")')).toBe(11);
  });
  it("meldet Fehler verständlich", () => {
    expect(() => calc("1 / 0")).toThrow("Division by zero");
    expect(() => parseFormula("1 +")).toThrow();
    expect(() => parseFormula("Punkte * 2")).toThrow("{Punkte}");
    expect(() => calc("foo(1)")).toThrow("Unknown function");
    // Kein Zugriff auf JavaScript
    expect(() => calc("constructor.constructor(\"return 1\")()")).toThrow();
  });
  it("berechnet Spalten, Ketten und Kreisbezüge", () => {
    const props: IBaseProperty[] = [
      { id: "n", name: "Name", type: "text", position: "a", typeOptions: null, isPrimary: true },
      { id: "p", name: "Punkte", type: "number", position: "b", typeOptions: null, isPrimary: false },
      { id: "f1", name: "Prozent", type: "formula", position: "c", typeOptions: { expression: "{Punkte} / 80 * 100" }, isPrimary: false },
      { id: "f2", name: "Note", type: "formula", position: "d", typeOptions: { expression: 'if({Prozent} >= 50, "ok", "nein")' }, isPrimary: false },
      { id: "f3", name: "A", type: "formula", position: "e", typeOptions: { expression: "{B} + 1" }, isPrimary: false },
      { id: "f4", name: "B", type: "formula", position: "f", typeOptions: { expression: "{A} + 1" }, isPrimary: false },
    ];
    const rows = [{ id: "r1", cells: { p: 60 } }] as unknown as IBaseRow[];
    const r = computeFormulas(rows, props).get("r1")!;
    expect(r.f1).toEqual({ value: 75 });
    expect(r.f2).toEqual({ value: "ok" });
    expect(r.f3).toEqual({ error: "Circular reference" });
  });
});
