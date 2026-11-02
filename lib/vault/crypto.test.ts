import { describe, expect, it } from "vitest";
import { fromBase64, packSealed, seal, toBase64, unpackSealed, unseal } from "./crypto";

const bytes = (s: string) => new TextEncoder().encode(s);
const newKey = () => crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);

describe("vault crypto", () => {
  it("round-trips a payload", async () => {
    const key = await newKey();
    const sealed = await seal(key, bytes("sk-ant-api03-example"), "database");
    expect(new TextDecoder().decode(await unseal(key, sealed, "database"))).toBe("sk-ant-api03-example");
  });

  it("uses a fresh 12-byte IV for every write", async () => {
    const key = await newKey();
    const a = await seal(key, bytes("same"), "database");
    const b = await seal(key, bytes("same"), "database");
    expect(a.iv).toHaveLength(12);
    expect(a.iv).not.toEqual(b.iv);
    expect(a.data).not.toEqual(b.data);
  });

  it("rejects a wrong key, a tampered payload and one opened for another purpose", async () => {
    const key = await newKey();
    const sealed = await seal(key, bytes("payload"), "database");
    await expect(unseal(await newKey(), sealed, "database")).rejects.toThrow();
    const flipped = sealed.data.slice();
    flipped[0] ^= 1;
    await expect(unseal(key, { ...sealed, data: flipped }, "database")).rejects.toThrow();
    await expect(unseal(key, sealed, "backup")).rejects.toThrow();
  });

  it("packs a sealed payload into one string and back", async () => {
    const key = await newKey();
    const sealed = await seal(key, bytes("payload"), "backup");
    const packed = packSealed(sealed);
    expect(packed.startsWith("v1.")).toBe(true);
    expect(new TextDecoder().decode(await unseal(key, unpackSealed(packed), "backup"))).toBe("payload");
    expect(() => unpackSealed("v2.a.b")).toThrow();
  });

  it("base64 round-trips large binary data", () => {
    const big = Uint8Array.from({ length: 200_000 }, (_, i) => (i * 7919) % 256);
    expect(fromBase64(toBase64(big))).toEqual(big);
  });
});
