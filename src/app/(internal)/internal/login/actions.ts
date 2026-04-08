// Re-export shared OTP actions for use in this login page.
// The "use server" directive lives in otp-actions.ts (the actual implementation).
export type { ActionResult } from "@/lib/auth/otp-actions";
export { sendOtp, verifyOtp } from "@/lib/auth/otp-actions";
