const express = require('express');
const router = express.Router();
const winston = require('winston');

// POST /api/errors/client - Log client-side errors
router.post('/client', async (req, res) => {
  try {
    const { error, stack, componentStack, timestamp, userAgent, url, userId, buildVersion } = req.body;
    
    // Log structured error
    winston.error('Client Error', {
      type: 'client_error',
      message: error,
      stack,
      componentStack,
      timestamp,
      userAgent,
      url,
      userId,
      buildVersion,
      ip: req.ip
    });

    res.status(200).json({ message: 'Error logged successfully' });
  } catch (err) {
    winston.error('Failed to log client error:', err);
    res.status(500).json({ message: 'Failed to log error' });
  }
});

module.exports = router;
