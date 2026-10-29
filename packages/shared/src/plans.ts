/**
 * Chukta's own plans (TSD: subscription billing), as on the pricing page:
 * Free for up to 25 students with reminders sent by hand; Pro, ₹499 a month,
 * for any number of students, automatic reminders and payments marked paid
 * through the centre's own Razorpay account.
 */
export type Plan = "free" | "pro";

export const PRO_PRICE_PAISE = 49900;

export const PLANS: Record<Plan, { maxStudents: number | null; automaticReminders: boolean; ownGateway: boolean }> = {
  free: { maxStudents: 25, automaticReminders: false, ownGateway: false },
  pro: { maxStudents: null, automaticReminders: true, ownGateway: true },
};

/** True when a centre on `plan` with `activeStudents` can't add another. */
export function studentLimitReached(plan: Plan, activeStudents: number): boolean {
  const max = PLANS[plan].maxStudents;
  return max !== null && activeStudents >= max;
}
