'use strict';

/**
 * Simple shared-secret auth for biometric device API.
 * Header: X-Device-Key: <BIOMETRIC_API_KEY from env>
 */
function requireDeviceKey(req, res, next) {
  const expected = process.env.BIOMETRIC_API_KEY || process.env.DEVICE_API_KEY;
  if (!expected) {
    // Fail closed in production if not configured
    if (process.env.NODE_ENV === 'production') {
      return res.status(503).json({ error: 'Device API not configured.' });
    }
    // Dev: allow if no key set
    return next();
  }
  const provided =
    req.get('X-Device-Key') ||
    req.get('X-API-Key') ||
    (req.body && req.body.api_key);

  if (!provided || provided !== expected) {
    return res.status(401).json({ error: 'Invalid or missing device API key.' });
  }
  next();
}

module.exports = { requireDeviceKey };
