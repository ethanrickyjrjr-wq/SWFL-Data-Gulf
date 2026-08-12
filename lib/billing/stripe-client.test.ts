// lib/billing/stripe-client.test.ts
import { describe, test } from "bun:test";
import assert from "node:assert/strict";
import Stripe from "stripe";
import { isResourceMissing } from "./stripe-client.ts";

describe("isResourceMissing", () => {
  test("Stripe's own 'no such subscription' error IS a genuine missing resource", () => {
    const err = new Stripe.errors.StripeInvalidRequestError({
      code: "resource_missing",
      message: "No such subscription: 'sub_gone'",
      type: "invalid_request_error",
    });
    assert.equal(isResourceMissing(err), true);
  });

  test("a connection error is NOT missing — transient, must not be swallowed", () => {
    const err = new Stripe.errors.StripeConnectionError({
      message: "An error occurred while connecting to Stripe.",
    });
    assert.equal(isResourceMissing(err), false);
  });

  test("a rate-limit error is NOT missing — transient, must not be swallowed", () => {
    const err = new Stripe.errors.StripeRateLimitError({
      code: "rate_limit",
      message: "Too many requests hit the API too quickly.",
      type: "invalid_request_error",
    });
    assert.equal(isResourceMissing(err), false);
  });

  test("a generic API error is NOT missing — transient, must not be swallowed", () => {
    const err = new Stripe.errors.StripeAPIError({
      message: "Something went wrong on Stripe's end.",
      type: "api_error",
    });
    assert.equal(isResourceMissing(err), false);
  });

  test("an invalid_request_error with a DIFFERENT code is NOT treated as missing", () => {
    const err = new Stripe.errors.StripeInvalidRequestError({
      code: "parameter_invalid_empty",
      message: "id is required",
      type: "invalid_request_error",
    });
    assert.equal(isResourceMissing(err), false);
  });

  test("a plain non-Stripe error is NOT missing", () => {
    assert.equal(isResourceMissing(new Error("boom")), false);
    assert.equal(isResourceMissing("boom"), false);
    assert.equal(isResourceMissing(null), false);
  });
});
