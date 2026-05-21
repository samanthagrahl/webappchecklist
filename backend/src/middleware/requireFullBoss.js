"use strict";

/** Voller Chef-Zugang (nicht eingeschränkt wie z. B. Kristina). */
function isFullBossUser(user) {
  if (!user || user.role !== "boss") return false;
  const m = user.manageEmployeeUsernames;
  return !Array.isArray(m) || !m.length;
}

function requireFullBoss(req, res, next) {
  if (!isFullBossUser(req.user)) {
    return res.status(403).json({ ok: false, error: "forbidden" });
  }
  return next();
}

module.exports = { requireFullBoss, isFullBossUser };
