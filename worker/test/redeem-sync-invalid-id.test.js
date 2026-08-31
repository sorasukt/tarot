import assert from "node:assert/strict";
import test from "node:test";
import {syncExistingStripePromotionCode} from "../src/redeem-stripe-sync.js";

test("rejects invalid Stripe promotion ids before fetching",async()=>{
  const result=await syncExistingStripePromotionCode({DB:{},STRIPE_SECRET_KEY:"test_key"},{promotionCodeId:"not-a-promo",plan:"yearly"});
  assert.equal(result.status,400);
  assert.equal(result.data.error.code,"INVALID_PROMOTION_CODE");
});
