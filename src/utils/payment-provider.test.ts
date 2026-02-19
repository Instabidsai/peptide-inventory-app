import { describe, it, expect } from "vitest";
import { PsiFiProvider } from "../../api/payments/provider";
import crypto from "crypto";

const TEST_KEY = "test-api-key-123";
const TEST_SECRET = "whsec_" + Buffer.from("test-webhook-secret-bytes").toString("base64");

function makeProvider() {
  return new PsiFiProvider(TEST_KEY, TEST_SECRET);
}

describe("PsiFiProvider", () => {
  it("has correct name", () => {
    expect(makeProvider().name).toBe("psifi");
  });

  describe("isSuccess", () => {
    it("recognizes complete", () => {
      expect(makeProvider().isSuccess("complete")).toBe(true);
    });

    it("recognizes completed", () => {
      expect(makeProvider().isSuccess("completed")).toBe(true);
    });

    it("is case insensitive", () => {
      expect(makeProvider().isSuccess("COMPLETE")).toBe(true);
    });

    it("rejects non-success statuses", () => {
      expect(makeProvider().isSuccess("pending")).toBe(false);
      expect(makeProvider().isSuccess("failed")).toBe(false);
    });
  });

  describe("isFailure", () => {
    it("recognizes failure statuses", () => {
      const provider = makeProvider();
      expect(provider.isFailure("failed")).toBe(true);
      expect(provider.isFailure("cancelled")).toBe(true);
      expect(provider.isFailure("expired")).toBe(true);
      expect(provider.isFailure("refunded")).toBe(true);
    });

    it("rejects non-failure statuses", () => {
      expect(makeProvider().isFailure("pending")).toBe(false);
      expect(makeProvider().isFailure("complete")).toBe(false);
    });
  });

  describe("verifyAndParseWebhook", () => {
    function signPayload(body: string, secret: string, id: string, timestamp: string) {
      const secretBytes = Buffer.from(
        secret.startsWith("whsec_") ? secret.slice(6) : secret,
        "base64"
      );
      const toSign = `${id}.${timestamp}.${body}`;
      return "v1," + crypto.createHmac("sha256", secretBytes).update(toSign).digest("base64");
    }

    it("returns null when svix headers are missing", () => {
      expect(makeProvider().verifyAndParseWebhook("{}", {})).toBeNull();
    });

    it("returns null when timestamp is too old", () => {
      const body = JSON.stringify({ event: "test", status: "complete" });
      const oldTs = String(Math.floor(Date.now() / 1000) - 600);
      const sig = signPayload(body, TEST_SECRET, "msg_123", oldTs);
      expect(
        makeProvider().verifyAndParseWebhook(body, {
          "svix-id": "msg_123",
          "svix-timestamp": oldTs,
          "svix-signature": sig,
        })
      ).toBeNull();
    });

    it("returns null for invalid signature", () => {
      const body = JSON.stringify({ event: "test", status: "complete" });
      const ts = String(Math.floor(Date.now() / 1000));
      expect(
        makeProvider().verifyAndParseWebhook(body, {
          "svix-id": "msg_123",
          "svix-timestamp": ts,
          "svix-signature": "v1,invalidsignature",
        })
      ).toBeNull();
    });

    it("parses a valid webhook", () => {
      const body = JSON.stringify({
        event: "checkout.completed",
        status: "complete",
        order: { externalId: "order-123", totalAmount: 5000 },
        order_id: "txn-456",
      });
      const ts = String(Math.floor(Date.now() / 1000));
      const id = "msg_abc";
      const sig = signPayload(body, TEST_SECRET, id, ts);

      const result = makeProvider().verifyAndParseWebhook(body, {
        "svix-id": id,
        "svix-timestamp": ts,
        "svix-signature": sig,
      });

      expect(result).not.toBeNull();
      expect(result!.eventType).toBe("checkout.completed");
      expect(result!.status).toBe("complete");
      expect(result!.externalId).toBe("order-123");
      expect(result!.transactionId).toBe("txn-456");
      expect(result!.amountCents).toBe(5000);
    });
  });
});
