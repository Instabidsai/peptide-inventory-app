import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { withErrorReporting } from "../_shared/error-reporter.ts";

/**
 * Cal.com webhook handler.
 * Receives booking events (created, cancelled, rescheduled) and creates
 * in-app notifications for admin users + logs to lead_submissions.
 *
 * Required env vars:
 *   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 *
 * Optional env vars:
 *   CAL_WEBHOOK_SECRET  — HMAC-SHA256 secret for signature validation
 *   CAL_ADMIN_USER_ID   — specific admin user ID to notify (falls back to all admins)
 */

const CAL_WEBHOOK_SECRET = Deno.env.get("CAL_WEBHOOK_SECRET") || "";

// ── HMAC-SHA256 signature validation ─────────────────────────
async function validateCalSignature(
  req: Request,
  body: string,
): Promise<boolean> {
  if (!CAL_WEBHOOK_SECRET) return true; // Skip if not configured (dev mode)

  const signature = req.headers.get("x-cal-signature-256");
  if (!signature) return false;

  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(CAL_WEBHOOK_SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(body));
  const computed = Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  // Constant-time comparison
  if (computed.length !== signature.length) return false;
  let mismatch = 0;
  for (let i = 0; i < computed.length; i++) {
    mismatch |= computed.charCodeAt(i) ^ signature.charCodeAt(i);
  }
  return mismatch === 0;
}

// ── Format helpers ───────────────────────────────────────────
function formatDateTime(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      timeZoneName: "short",
    });
  } catch {
    return iso;
  }
}

// ── Main handler ─────────────────────────────────────────────
Deno.serve(withErrorReporting("cal-webhook", async (req) => {
  // Accept POST only — Cal.com may send GET for verification
  if (req.method !== "POST") {
    return new Response("OK", { status: 200 });
  }

  try {
    const body = await req.text();

    // Validate signature
    const valid = await validateCalSignature(req, body);
    if (!valid) {
      console.error("[cal-webhook] Invalid signature");
      return new Response("Forbidden", { status: 403 });
    }

    const data = JSON.parse(body);
    const event = data.triggerEvent || data.type || "";
    const payload = data.payload || data;

    // Extract booking details
    const attendee = payload.attendees?.[0] || {};
    const attendeeName = attendee.name || attendee.email || "Someone";
    const attendeeEmail = attendee.email || "";
    const startTime = payload.startTime || "";
    const endTime = payload.endTime || "";
    const eventTitle = payload.title || payload.eventTitle || "Meeting";
    const bookingUid = payload.uid || "";
    const meetUrl = payload.metadata?.videoCallUrl
      || payload.videoCallData?.url
      || "";

    // Build notification content based on event type
    let title = "";
    let message = "";
    let type = "info";

    if (event === "BOOKING_CREATED") {
      title = `New booking: ${attendeeName}`;
      message = `${eventTitle} on ${formatDateTime(startTime)}`;
      if (attendeeEmail) message += ` — ${attendeeEmail}`;
      if (meetUrl) message += `\nMeeting link: ${meetUrl}`;
      type = "success";
    } else if (event === "BOOKING_CANCELLED") {
      title = `Booking cancelled: ${attendeeName}`;
      message = `${eventTitle} for ${formatDateTime(startTime)} was cancelled.`;
      type = "warning";
    } else if (event === "BOOKING_RESCHEDULED") {
      const rescheduleData = data.payload?.reschedule || {};
      const oldTime = rescheduleData.fromReschedule
        ? formatDateTime(rescheduleData.fromReschedule)
        : "previous time";
      title = `Booking rescheduled: ${attendeeName}`;
      message = `${eventTitle} moved to ${formatDateTime(startTime)} (was ${oldTime}).`;
      type = "info";
    } else {
      // Unknown event — log but don't notify
      console.log(`[cal-webhook] Ignoring event: ${event}`);
      return new Response(JSON.stringify({ ok: true, skipped: event }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Create service-role Supabase client
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Find admin user(s) to notify
    const specificAdminId = Deno.env.get("CAL_ADMIN_USER_ID");
    let adminUserIds: string[] = [];

    if (specificAdminId) {
      adminUserIds = [specificAdminId];
    } else {
      // Notify all admin-role users (cap at 5)
      const { data: admins } = await supabase
        .from("profiles")
        .select("user_id")
        .eq("role", "admin")
        .limit(5);
      adminUserIds = (admins || []).map((a: { user_id: string }) => a.user_id);
    }

    // Insert notification for each admin
    if (adminUserIds.length > 0) {
      const notifications = adminUserIds.map((userId) => ({
        user_id: userId,
        title,
        message,
        type,
        link: "/admin/notifications",
      }));

      const { error: notifError } = await supabase
        .from("notifications")
        .insert(notifications);

      if (notifError) {
        console.error("[cal-webhook] Failed to insert notifications:", notifError);
      } else {
        console.log(`[cal-webhook] Notified ${adminUserIds.length} admin(s): ${event}`);
      }
    }

    // Also log to lead_submissions for tracking
    await supabase
      .from("lead_submissions")
      .insert({
        name: attendeeName,
        email: attendeeEmail || "no-email@cal.com",
        source: "cal_booking",
        message: `${event}: ${eventTitle} on ${formatDateTime(startTime)}${bookingUid ? ` (uid: ${bookingUid})` : ""}`,
      })
      .catch((err: Error) => {
        console.error("[cal-webhook] Failed to log lead submission:", err);
      });

    return new Response(JSON.stringify({ ok: true, event, notified: adminUserIds.length }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[cal-webhook] Error:", err);
    // Always return 200 so Cal.com doesn't retry excessively
    return new Response(JSON.stringify({ ok: false, error: "Internal error" }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }
}));
