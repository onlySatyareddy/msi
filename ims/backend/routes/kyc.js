const express = require('express');
const router = express.Router();
const c = require('../controllers/kycController');
const { protect, authorize } = require('../middleware/auth');
const upload = require('../middleware/upload');

router.use(protect);
router.get('/', authorize('CHECKER','ADMIN'), c.getAllDossiers);
router.get('/:investorId', c.getDossier);
router.post('/:investorId/upload/:docType',
  authorize('MAKER','ADMIN'),
  (req, res, next) => { req.params.investorId = req.params.investorId; next(); },
  upload.single('file'), c.uploadDoc);

module.exports = router;
