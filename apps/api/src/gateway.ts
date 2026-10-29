import { createFakeGateway, createRazorpayGateway, type FakeGateway, type PaymentGateway } from "@chukta/integrations";
import type { Config } from "./config";

/** The fake checkout's address: the API's own /dev/fake-razorpay pages. */
export const fakeCheckoutBase = (apiBase: string) => `${apiBase}/dev/fake-razorpay`;

/** Razorpay with each centre's keys, or (never in production) the in-memory fake. */
export function gatewayFromConfig(config: Config, apiBase: string): PaymentGateway | FakeGateway {
  return config.razorpay === "fake" ? createFakeGateway(fakeCheckoutBase(apiBase)) : createRazorpayGateway();
}
