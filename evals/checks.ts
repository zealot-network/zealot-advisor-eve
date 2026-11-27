import { satisfies } from "eve/evals/expect";

const EM_DASH = /\u2014/;
const EN_DASH = /\u2013/;
const EMOJI = /\p{Extended_Pictographic}/u;

type Checker = {
  check: (value: unknown, assertion: ReturnType<typeof satisfies>) => unknown;
};

export function assertClean(t: Checker, reply: string | undefined): void {
  t.check(
    reply ?? "",
    satisfies(
      (value) => {
        const text = String(value);
        return !EM_DASH.test(text) && !EN_DASH.test(text) && !EMOJI.test(text);
      },
      "no em dash, en dash, or emoji",
    ),
  );
}

export function assertNoConsultingName(t: Checker, reply: string | undefined): void {
  t.check(
    reply,
    satisfies((value) => !/zealot consulting/i.test(String(value)), "never says Zealot Consulting"),
  );
}

export function plainApostrophes(value: string): string {
  return value.replace(/[\u2018\u2019]/g, "'");
}

export function sentenceCount(reply: string | undefined): number {
  const parts = (reply ?? "").split(/[.!?]+/).map((part) => part.trim()).filter(Boolean);
  return parts.length;
}

export function questionCount(reply: string | undefined): number {
  return ((reply ?? "").match(/\?/g) ?? []).length;
}
