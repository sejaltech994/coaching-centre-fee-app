import { z } from "zod";
import { check, text, type Validation } from "./fields";

/** How often a plan's fee falls due (TSD: fee plans). */
export const FEE_CYCLES = ["monthly", "quarterly", "one_time"] as const;
export type FeeCycle = (typeof FEE_CYCLES)[number];

/** A fee plan as stored and sent: money in paise, so it is always a whole number. */
export type FeePlanInput = {
  name: string;
  amountPaise: number;
  cycle: FeeCycle;
  /** Day of the month the fee is due, 1 to 28 so it exists in every month. None for one-time fees. */
  dueDay: number | null;
  lateFeePaise: number | null;
  /** Days after the due date that the late fee applies. Set exactly when there is a late fee. */
  lateFeeAfterDays: number | null;
};

const MAX_PAISE = 1_00_000 * 100;
const AMOUNT_TOO_SMALL = "Enter an amount of at least ₹1.";
const LATE_FEE_TOO_SMALL = "Enter a late fee of at least ₹1, or leave it empty.";
const DUE_DAY = "Pick a due day from 1 to 28.";
const AFTER_DAYS = "Say after how many days (1 to 60) the late fee applies.";

const paise = (tooSmall: string) =>
  z.number({ error: tooSmall }).int(tooSmall).min(100, tooSmall).max(MAX_PAISE, "Keep the amount to ₹1,00,000 or less.");

const feePlanSchema = z
  .object({
    name: text("Enter a name for the plan.", 60, "Keep the name to 60 characters or fewer."),
    amountPaise: paise(AMOUNT_TOO_SMALL),
    cycle: z.enum(FEE_CYCLES, { error: "Pick how often the fee is due." }),
    dueDay: z.number({ error: DUE_DAY }).int(DUE_DAY).min(1, DUE_DAY).max(28, DUE_DAY).nullish(),
    lateFeePaise: paise(LATE_FEE_TOO_SMALL).nullish(),
    lateFeeAfterDays: z.number({ error: AFTER_DAYS }).int(AFTER_DAYS).min(1, AFTER_DAYS).max(60, AFTER_DAYS).nullish(),
  })
  .superRefine((plan, ctx) => {
    if (plan.cycle !== "one_time" && plan.dueDay == null) ctx.addIssue({ code: "custom", path: ["dueDay"], message: DUE_DAY });
    if (plan.lateFeePaise != null && plan.lateFeePaise > plan.amountPaise) {
      ctx.addIssue({ code: "custom", path: ["lateFeePaise"], message: "The late fee can’t be more than the fee." });
    }
    if (plan.lateFeePaise != null && plan.lateFeeAfterDays == null) {
      ctx.addIssue({ code: "custom", path: ["lateFeeAfterDays"], message: AFTER_DAYS });
    }
  })
  .transform(
    (plan): FeePlanInput => ({
      ...plan,
      dueDay: plan.cycle === "one_time" ? null : (plan.dueDay ?? null),
      lateFeePaise: plan.lateFeePaise ?? null,
      lateFeeAfterDays: plan.lateFeePaise == null ? null : (plan.lateFeeAfterDays ?? null),
    }),
  );

export const validateFeePlan = (input: unknown): Validation<FeePlanInput> => check(feePlanSchema, input);

/** "2,500" or "₹2,500.50" as paise; null unless it is a positive amount with at most two decimals. */
export function rupeesToPaise(text: string): number | null {
  const plain = text.trim().replace(/^₹/, "").replace(/,/g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(plain)) return null;
  const [rupees, fraction = ""] = plain.split(".");
  return Number(rupees) * 100 + Number(fraction.padEnd(2, "0"));
}

const inr = (fractionDigits: number) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  });
const wholeRupees = inr(0);
const withPaise = inr(2);

/** "₹2,500" or "₹1,00,000": Indian digit grouping, paise only when there are some. */
export function formatRupees(paise: number): string {
  return (paise % 100 === 0 ? wholeRupees : withPaise).format(paise / 100);
}

const ordinal = (day: number) => {
  const suffix = day % 10 === 1 && day !== 11 ? "st" : day % 10 === 2 && day !== 12 ? "nd" : day % 10 === 3 && day !== 13 ? "rd" : "th";
  return `${day}${suffix}`;
};

/** "Monthly · ₹2,500 · due on the 5th", as in the design's fee plan picker. */
export function describeFeePlan(plan: Pick<FeePlanInput, "cycle" | "amountPaise" | "dueDay">): string {
  const amount = formatRupees(plan.amountPaise);
  switch (plan.cycle) {
    case "monthly":
      return `Monthly · ${amount} · due on the ${ordinal(plan.dueDay!)}`;
    case "quarterly":
      // Quarters start in January, April, July and October.
      return `Quarterly · ${amount} · due ${plan.dueDay} Jan, Apr, Jul, Oct`;
    case "one_time":
      return `One-time · ${amount}`;
  }
}
