import assert from "node:assert/strict";
import test from "node:test";
import {
  ownerIdFromSerial,
  passAuthenticationToken,
  passTokenMatches,
  serialFromWalletPath,
  walletSerialFor,
} from "./wallet-serial.ts";

const OWNER = "550e8400-e29b-41d4-a716-446655440000";
const PASS_TYPE = "pass.com.aded.card";
const DEVICE = "abcdef0123456789";

test("slot serials keep the owner and the suffix", () => {
  assert.equal(walletSerialFor(OWNER, 1), `person-${OWNER}`);
  assert.equal(walletSerialFor(OWNER, 2), `person-${OWNER}-2`);
  assert.equal(walletSerialFor(OWNER, 3), `person-${OWNER}-3`);
  assert.equal(ownerIdFromSerial(walletSerialFor(OWNER, 1)), OWNER);
  assert.equal(ownerIdFromSerial(walletSerialFor(OWNER, 2)), OWNER);
  assert.equal(ownerIdFromSerial(walletSerialFor(OWNER, 3)), OWNER);
  assert.equal(ownerIdFromSerial(`person-${OWNER}-1`), null);
});

test("the path serial includes the slot suffix", () => {
  for (const serial of [`person-${OWNER}`, `person-${OWNER}-2`, `person-${OWNER}-3`]) {
    const path = `/api/wallet/v1/devices/${DEVICE}/registrations/${PASS_TYPE}/${serial}`;
    assert.equal(serialFromWalletPath(path), serial);
    assert.equal(serialFromWalletPath(`/api/wallet/v1/passes/${PASS_TYPE}/${encodeURIComponent(serial)}`), serial);
  }
});

test("a suffixed pass token matches only that serial", () => {
  process.env.SUPABASE_SERVICE_ROLE_KEY = "wallet-test-secret";
  const bare = walletSerialFor(OWNER, 1);
  const second = walletSerialFor(OWNER, 2);
  const third = walletSerialFor(OWNER, 3);
  assert.equal(passTokenMatches(bare, passAuthenticationToken(bare)), true);
  assert.equal(passTokenMatches(second, passAuthenticationToken(second)), true);
  assert.equal(passTokenMatches(third, passAuthenticationToken(third)), true);
  assert.equal(passTokenMatches(second, passAuthenticationToken(bare)), false);
  assert.equal(passTokenMatches(third, passAuthenticationToken(second)), false);
});
