const express = require('express');
const multer = require('multer');
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const dotenv = require('dotenv');
const cors = require('cors');
const sequelize = require('./config/database');
const Image = require('./models/image');

dotenv.config();

// Increase max listeners if necessary
require('events').EventEmitter.defaultMaxListeners = 20;

const app = express();
const port = process.env.PORT || 3000;

// Configure CORS
app.use(cors());

// Configure AWS S3
const s3 = new S3Client({
    region: process.env.AWS_REGION,
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    },
});

// Configure Multer
const storage = multer.memoryStorage();
const upload = multer({
    storage: storage,
    limits: { fileSize: 10 * 1024 * 1024 }, // Limit file size to 10MB
    fileFilter: (req, file, cb) => {
        const allowedTypes = ['image/jpeg', 'image/png', 'image/gif'];
        if (!allowedTypes.includes(file.mimetype)) {
            return cb(new Error('Invalid file type, only JPEG, PNG, and GIF are allowed.'));
        }
        cb(null, true);
    }
});

// Sync Sequelize models
sequelize.sync().then(() => {
    console.log('Database synced');
}).catch((err) => {
    console.error('Unable to sync database:', err);
});

// Function to format file name
const formatFileName = (fileName) => {
    return fileName
        .toLowerCase()
        .replace(/\s+/g, '_') // Replace spaces with hyphens
        .replace(/[^\w.-]/g, ''); // Remove special characters except dots and hyphens
};

// Route to handle image upload
app.post('/upload', upload.single('image'), async (req, res) => {
    const file = req.file;
    const userId = req.body.userId;

    if (!file) {
        return res.status(400).json({ message: 'No file uploaded' });
    }

    const formattedFileName = formatFileName(file.originalname);
    const params = {
        Bucket: process.env.S3_BUCKET_NAME,
        Key: `${Date.now()}-${formattedFileName}`,
        Body: file.buffer,
        ContentType: file.mimetype,
        // Removed ACL property
    };

    try {
        // Upload the image to S3
        const command = new PutObjectCommand(params);
        const s3Response = await s3.send(command);

        // Save image metadata to the database
        const image = await Image.create({
            userId,
            url: `https://${process.env.S3_BUCKET_NAME}.s3.amazonaws.com/${params.Key}`,
            filename: formattedFileName,
        });

        res.status(200).json({
            message: 'Image uploaded successfully',
            image,
        });
    } catch (error) {
        console.error('Error uploading:', error);
        res.status(500).json({ error: error.message });
    }
});
app.get('/images', async (req, res) => {
    try {
        const images = await Image.findAll();
        res.status(200).json(images);
    } catch (error) {
        console.error('Error retrieving images:', error);
        res.status(500).json({ error: error.message });
    }
});
app.get('/', (req, res) => {
    res.send('Hello, World!');
})
// Start the server
app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
});
