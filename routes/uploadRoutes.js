const router = require('express').Router();
const fs = require('fs');
const path = require('path');
const { auth } = require('../middlewares/authMiddleware');

const uploadDir = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// POST /api/upload (Base64 image upload)
router.post('/', auth, async (req, res) => {
  try {
    const { image, filename } = req.body;
    if (!image) {
      return res.status(400).json({ error: 'Image data is required' });
    }

    // Determine extension and clean base64 data
    let ext = 'jpg';
    let base64Data = image;

    if (image.startsWith('data:image/')) {
      const matches = image.match(/^data:image\/([a-zA-Z0-9+]+);base64,(.+)$/);
      if (matches && matches.length === 3) {
        ext = matches[1] === 'jpeg' ? 'jpg' : matches[1];
        base64Data = matches[2];
      }
    } else if (filename && filename.includes('.')) {
      ext = filename.split('.').pop().toLowerCase();
    }

    // Clean any unwanted ext variations
    if (ext === 'svg+xml') ext = 'svg';

    const uniqueName = `img_${Date.now()}_${Math.random().toString(36).substring(2, 7)}.${ext}`;
    const filePath = path.join(uploadDir, uniqueName);

    const buffer = Buffer.from(base64Data, 'base64');
    await fs.promises.writeFile(filePath, buffer);

    const relativeUrl = `/uploads/${uniqueName}`;
    res.json({
      success: true,
      url: relativeUrl,
      filename: uniqueName,
    });
  } catch (err) {
    console.error('Image upload error:', err);
    res.status(500).json({ error: 'Failed to upload image', details: err.message });
  }
});

module.exports = router;
