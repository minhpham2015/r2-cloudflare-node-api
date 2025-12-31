// index.js
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import pino from 'pino';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';

import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

dotenv.config();

/* ---------------------------
   LOGGER SETUP
--------------------------- */
const logger = pino({
  level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
  transport: {
    target: 'pino-pretty',
    options: { colorize: true }
  }
});

/* ---------------------------
   APP SETUP
--------------------------- */
const app = express();

// CORS: Chỉ cho phép từ các domain hợp lệ hoặc localhost (demo)
const allowedOrigins = [
  'http://localhost',
  'http://127.0.0.1',
  'http://localhost:8888',
  'https://woozio.local', // thêm domain demo của bạn
  // Thêm domain production sau này
];

app.use(cors({
  origin: (origin, callback) => {
    // Cho phép request không có origin (Postman, curl, etc.) trong dev
    if (!origin || allowedOrigins.some(allowed => origin.startsWith(allowed))) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  methods: ['POST'],
  allowedHeaders: ['Content-Type']
}));

app.use(express.json({ limit: '1mb' }));

const PORT = process.env.PORT || 3000;

/* ---------------------------
   RATE LIMITING (chống spam/abuse)
--------------------------- */
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 phút
  max: 30, // tối đa 30 requests từ cùng IP hoặc license
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    return req.body.license || ipKeyGenerator(req);
  },
  handler: (req, res) => {
    logger.warn({ ip: req.ip, license: req.body.license }, 'Rate limit exceeded');
    res.status(429).json({
      success: false,
      error: 'Too many requests. Please try again later.'
    });
  }
});

/* ---------------------------
   R2 CLIENT (S3 COMPATIBLE)
--------------------------- */
const r2 = new S3Client({
  region: 'auto',
  endpoint: process.env.R2_ENDPOINT,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY
  }
});

/* ---------------------------
   LICENSE STORE (DEMO - In Memory)
--------------------------- */
const LICENSES = {
  "ABC-123-XYZ": {
    active: true,
    expires: "2026-12-31", // Hết hạn sau ngày hiện tại (Dec 31, 2025)
    domains: ["localhost", "127.0.0.1", "woozio.local", "demo.yourtheme.com"],
    files: ["package-install__woozio-main.zip", "theme-a/demo.zip", "theme-b/demo.zip"]
  },
  "TEST-999-KEY": { // Key test thêm để dễ thử
    active: true,
    expires: "2026-01-01",
    domains: ["localhost"],
    files: ["package-install__woozio-main.zip"]
  }
};

/* ---------------------------
   HELPERS
--------------------------- */
function isExpired(dateStr) {
  return new Date(dateStr) < new Date();
}

function validateFileName(file) {
  // Chỉ cho phép tên file an toàn: chữ, số, gạch ngang, gạch dưới, dấu chấm, slash, kết thúc bằng .zip
  return /^[\w\-\/]+\.zip$/.test(file);
}

function validateLicense({ license, domain, file }) {
  const lic = LICENSES[license];

  if (!lic) return { ok: false, error: "License not found" };
  if (!lic.active) return { ok: false, error: "License inactive" };
  if (isExpired(lic.expires)) return { ok: false, error: "License expired" };
  if (!lic.domains.some(allowed => domain.includes(allowed))) {
    return { ok: false, error: "Domain not allowed" };
  }
  if (!lic.files.includes(file)) return { ok: false, error: "File not permitted for this license" };

  return { ok: true };
}

async function generateSignedUrl(fileKey) {
  const command = new GetObjectCommand({
    Bucket: process.env.R2_BUCKET,
    Key: fileKey
  });

  return await getSignedUrl(r2, command, { expiresIn: 60 * 10 }); // 10 phút
}

/* ---------------------------
   ROUTES
--------------------------- */

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// Main download endpoint
app.post('/download', async (req, res) => {
  const { license, domain, file } = req.body;
  const ip = req.ip || req.connection.remoteAddress;

  // Log request
  logger.info({ ip, license, domain, file }, 'Download request received');

  // 1. Validate input
  if (!license || !domain || !file) {
    logger.warn({ ip }, 'Missing required fields');
    return res.status(400).json({
      success: false,
      error: "Missing license, domain, or file"
    });
  }

  // 2. Validate file name format (security)
  if (!validateFileName(file)) {
    logger.warn({ ip, file }, 'Invalid file name format');
    return res.status(400).json({
      success: false,
      error: "Invalid file name"
    });
  }

  // 3. Validate license
  const validation = validateLicense({ license, domain, file });
  if (!validation.ok) {
    logger.warn({ ip, license, domain, file, error: validation.error }, 'License validation failed');
    return res.status(403).json({
      success: false,
      error: validation.error
    });
  }

  // 4. Generate signed URL
  try {
    const signedUrl = await generateSignedUrl(file);

    logger.info({ ip, license, domain, file }, 'Signed URL generated successfully');

    return res.json({
      success: true,
      message: "License and domain verified",
      data: {
        url: signedUrl,
        expires_in: 600, // seconds
        expires_at: new Date(Date.now() + 600 * 1000).toISOString(),
        file: file
      }
    });

  } catch (err) {
    logger.error({ err, ip, file }, 'Failed to generate signed URL');
    return res.status(500).json({
      success: false,
      error: "Failed to generate download URL. Please try again later."
    });
  }
});

/* ---------------------------
   GLOBAL ERROR HANDLING
--------------------------- */
process.on('unhandledRejection', (err) => {
  logger.error({ err }, 'Unhandled Rejection');
});

process.on('uncaughtException', (err) => {
  logger.error({ err }, 'Uncaught Exception');
  process.exit(1);
});

/* ---------------------------
   START SERVER
--------------------------- */
app.listen(PORT, '0.0.0.0', () => {
  logger.info(`🚀 License API running on http://localhost:${PORT}`);
  logger.info(`Health check: http://localhost:${PORT}/health`);
});