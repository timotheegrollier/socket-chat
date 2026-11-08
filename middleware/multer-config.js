const multer = require('multer')
const path = require('path')
const fs = require('fs')

const MIME_TYPES = {
    'image/jpg': 'jpg',
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/gif': 'gif',
    'image/webp': 'webp'
}

// Ensure the images directory exists (Render deploys from a clean checkout).
const imagesDir = path.join(__dirname, '..', 'images')
if (!fs.existsSync(imagesDir)) {
    fs.mkdirSync(imagesDir, { recursive: true })
}

const storage = multer.diskStorage({
    destination: (req, file, callback) => {
        callback(null, imagesDir)
    },
    filename: (req, file, callback) => {
        const extension = MIME_TYPES[file.mimetype]
        if (!extension) {
            return callback(new Error('Unsupported file type.'), false)
        }
        const name = file.originalname.split(' ').join('_').replace(/\.[^/.]+$/, '')
        callback(null, name + '_' + Date.now() + '.' + extension)
    }
})

const limits = {
    fileSize: 8 * 1024 * 1024, // 8 Mo max
}

module.exports = multer({ storage, limits }).single('image')
