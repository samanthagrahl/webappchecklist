"use strict";

const jwt = require("jsonwebtoken");
const { config } = require("../config");

function signToken(user) {
  if (!config.jwtSecret) {
    throw new Error("JWT_SECRET fehlt");
  }
  return jwt.sign(
    {
      sub: user.id,
      username: user.username,
      role: user.role,
      label: user.label,
      manageEmployeeUsernames: user.manageEmployeeUsernames || [],
      allowedChecklistTemplateIds: user.allowedChecklistTemplateIds || []
    },
    config.jwtSecret,
    { expiresIn: config.jwtExpiresIn }
  );
}

function requireAuth(req, res, next) {
  const header = String(req.get("authorization") || "");
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!token) {
    return res.status(401).json({ ok: false, error: "unauthorized" });
  }
  try {
    const payload = jwt.verify(token, config.jwtSecret);
    req.user = {
      id: payload.sub,
      username: payload.username,
      role: payload.role,
      label: payload.label,
      manageEmployeeUsernames: payload.manageEmployeeUsernames || [],
      allowedChecklistTemplateIds: payload.allowedChecklistTemplateIds || []
    };
    return next();
  } catch (e) {
    return res.status(401).json({ ok: false, error: "invalid_token" });
  }
}

module.exports = { signToken, requireAuth };
