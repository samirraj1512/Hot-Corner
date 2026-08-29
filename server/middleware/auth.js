import { clerkClient } from "@clerk/express";

export const protectAdmin = async (req, res, next) => {
  try {
    const userId = req.auth?.().userId;
    if (!userId) {
      return res.status(401).json({ success: false, message: "Authentication is required." });
    }

    const user = await clerkClient.users.getUser(userId);
    const adminEmail = String(process.env.ADMIN_EMAIL || "").toLowerCase();
    const userEmails = (user.emailAddresses || []).map(({ emailAddress }) => String(emailAddress || "").toLowerCase());
    const hasAdminRole = user.privateMetadata?.role === "admin";
    const hasAdminEmail = Boolean(adminEmail) && userEmails.includes(adminEmail);

    if (!hasAdminRole && !hasAdminEmail) {
      return res.status(403).json({ success: false, message: "Admin access is required." });
    }

    return next();
  } catch (error) {
    console.error("Admin authorization failed:", error.message);
    return res.status(401).json({ success: false, message: "Authentication is required." });
  }
};
