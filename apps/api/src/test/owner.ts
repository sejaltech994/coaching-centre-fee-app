import { createTestApp, refreshCookie } from "./harness";

export const DAY = 24 * 60 * 60 * 1000;
export const MONTHLY = { name: "Monthly", amountPaise: 250000, cycle: "monthly", dueDay: 5, lateFeePaise: 10000, lateFeeAfterDays: 3 };
export const AARAV = { name: "Aarav Sharma", parentName: "Neha Sharma", parentPhone: "98765 43210" };

/**
 * An owner with a batch billed monthly (₹2,500, due on the 5th, ₹100 late after 3
 * days) and Aarav in it. `call` sends the owner's current token; `advance` moves
 * the clock and renews the session, as the web app would.
 */
export async function owner(email = "asha@example.com", shared?: Awaited<ReturnType<typeof createTestApp>>) {
  const app = shared ?? (await createTestApp());
  const login = await app.login(email);
  let token = login.body.accessToken as string;
  let cookie = login.cookie;
  const call = (method: string, path: string, body?: unknown) => app.call(method, path, { token, body });
  const json = async (method: string, path: string, body?: unknown) => (await call(method, path, body)).json();
  async function advance(ms: number) {
    app.clock.advance(ms);
    const res = await app.call("POST", "/auth/refresh", { cookie });
    token = (await res.json()).accessToken;
    cookie = refreshCookie(res);
  }

  const plan = (await json("POST", "/fee-plans", MONTHLY)).feePlan.id as string;
  const batch = (await json("POST", "/batches", { name: "Class 10 Maths", days: ["mon"], startTime: "16:00", endTime: "17:00", feePlanId: plan })).batch.id as string;
  const { student } = await json("POST", "/students", { ...AARAV, batchIds: [batch] });
  const list = (query = "") => json("GET", `/invoices${query}`);
  return {
    app,
    call,
    json,
    advance,
    token: () => token,
    plan,
    batch,
    studentId: student.id as string,
    enrolmentId: student.batches[0].enrolmentId as string,
    list,
  };
}
