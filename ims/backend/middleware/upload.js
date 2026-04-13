const multer = require('multer');
const path = require('path');
const fs = require('fs');

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(__dirname, '../uploads', req.params.investorId || 'general');
    try {
      fs.mkdirSync(dir, { recursive: true });
      // Verify directory was created
      if (!fs.existsSync(dir)) {
        return cb(new Error(`Failed to create upload directory: ${dir}`));
      }
      console.log('[UPLOAD] Directory ready:', dir);
      cb(null, dir);
    } catch (err) {
      console.error('[UPLOAD] Directory creation failed:', err);
      cb(err);
    }
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    const filename = `${file.fieldname}_${Date.now()}${ext}`;
    console.log('[UPLOAD] Generated filename:', filename, 'for field:', file.fieldname);
    cb(null, filename);
  }
});

const fileFilter = (req, file, cb) => {
  const allowed = /jpeg|jpg|png|pdf/;
  const ext = allowed.test(path.extname(file.originalname).toLowerCase());
  const mime = allowed.test(file.mimetype);
  if (ext && mime) cb(null, true);
  else cb(new Error('Only JPEG, PNG, PDF files allowed'));
};

// Custom error handler for multer
const upload = multer({ 
  storage, 
  fileFilter, 
  limits: { fileSize: 5 * 1024 * 1024 }
});

// Wrapper to handle multer errors
upload.handleError = (err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    // A Multer error occurred when uploading
    console.error('[UPLOAD] Multer error:', err);
    return res.status(400).json({ message: `Upload error: ${err.message}` });
  } else if (err) {
    // An unknown error occurred
    console.error('[UPLOAD] Unknown error:', err);
    return res.status(500).json({ message: err.message || 'Upload failed' });
  }
  next();
};

module.exports = upload;
