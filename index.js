import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';

import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

dotenv.config();

/* ---------------------------
   APP SETUP
--------------------------- */
const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3000;

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
   LICENSE STORE (TEST MODE)
--------------------------- */
const LICENSES = {
  "ABC-123-XYZ": {
    active: true,
    expires: "2026-01-01",
    domains: ["localhost", "127.0.0.1", "woozio.local"],
    files: ["package-install__woozio-main.zip"]
  }
};

/* ---------------------------
   HELPERS
--------------------------- */
function isExpired(date) {
  return new Date(date) < new Date();
}

function validateLicense({ license, domain, file }) {
  const lic = LICENSES[license];

  if (!lic) return { ok: false, error: "License not found" };
  if (!lic.active) return { ok: false, error: "License inactive" };
  if (isExpired(lic.expires)) return { ok: false, error: "License expired" };
  if (!lic.domains.includes(domain)) return { ok: false, error: "Domain not allowed" };
  if (!lic.files.includes(file)) return { ok: false, error: "File not permitted" };

  return { ok: true };
}

/* ---------------------------
   CLOUDFARE R2 SIGNED URL
--------------------------- */
async function generateSignedUrl(file) {
    const command = new GetObjectCommand({
    Bucket: process.env.R2_BUCKET,
    Key: file
    });

    // URL valid for 10 minutes
    return await getSignedUrl(r2, command, {
    expiresIn: 60 * 10
    });
}

/* ---------------------------
   POST /download
--------------------------- */
app.post('/download', async (req, res) => {
  const { license, domain, file } = req.body;

  /* 1️⃣ Validate input */
  if (!license || !domain || !file) {
    return res.status(400).json({
      success: false,
      error: "Missing license, domain, or file"
    });
  }

  /* 2️⃣ Validate license */
  const result = validateLicense({ license, domain, file });

  if (!result.ok) {
    return res.status(403).json({
      success: false, 
      error: result.error
    });
  }

  /* 3️⃣ Generate R2 signed URL */
  try {
    const signedUrl = await generateSignedUrl(file);

    return res.json({
      success: true,
      message: "License & domain valid",
      data: {
        url: signedUrl
      }
    });

  } catch (err) {
    console.error(err);
    return res.status(500).json({
      success: false,
      error: "Failed to generate download URL"
    });
  }
});

/* ---------------------------
   START SERVER
--------------------------- */
app.listen(PORT, () => {
  console.log(`🚀 License API running at http://localhost:${PORT}`);
});