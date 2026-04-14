import Stripe from "stripe";

let stripeSingleton: Stripe | null = null;

export function getStripeServer(): Stripe {
  if (stripeSingleton) return stripeSingleton;
  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) {
    throw new Error("Missing STRIPE_SECRET_KEY");
  }
  stripeSingleton = new Stripe(secretKey, {
    apiVersion: "2026-03-25.dahlia",
  });
  return stripeSingleton;
}

