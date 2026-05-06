# Goofy Drive

Goofy Drive is a full-stack document upload/download web app with account-based access, public/private file sharing, plan controls, folder organization, and subscription upgrade scaffolding.

## Features

- **Authentication required** for all upload/download management operations.
- **Free plan**:
  - Upload/download threshold: up to **1GB per file**.
  - File type restrictions to common extensions (png, jpeg/jpg, gif, webp, svg, pdf, doc/docx, txt, md, html, css, js, json, blend, zip).
- **Pro plan**:
  - Upload/download threshold up to **3GB per file**.
  - Upload **any file type**.
- **Unrestricted accounts**:
  - Internal override bypasses transfer threshold and file-type restrictions.
- **Public/private visibility** per document.
- **Folder support** for personal organization.
- **Subscription & banking integration hooks**:
  - `/api/subscription/checkout` placeholder for Stripe/PayPal flow.
  - `/api/subscription/activate-pro` demo endpoint for post-payment activation.
- **Virus-protection policy hooks**:
  - Basic blocking heuristic for high-risk executable extensions.
  - Designed to be replaced/extended with ClamAV or cloud malware scanning.

## Project structure

```
Goofy-Drive/
├── data/                # SQLite user + file metadata + sessions
├── public/
│   ├── index.html       # Main UI
│   ├── styles.css       # Styling/theme
│   └── app.js           # Front-end logic
├── uploads/             # Uploaded files (local storage)
├── package.json
├── server.js            # Express API + app server
└── README.md
```

## Run locally

1. Install dependencies:
   ```bash
   npm install
   ```
2. Start server:
   ```bash
   npm start
   ```
3. Open browser:
   - `http://localhost:3000`

## Production notes

For real 100% production readiness, add:

- Reverse proxy upload tuning (Nginx/Cloudflare body limits) for 3GB uploads.
- Multi-part/resumable uploads for very large files.
- Cloud object storage (S3/GCS/Azure Blob).
- Full malware scanning pipeline (ClamAV daemon or API scanner).
- Real payment processor integration + signed webhooks.
- Admin role model separate from unrestricted capability.
- Background jobs for scanning/transcoding/indexing.

## API overview

- `POST /api/register`
- `POST /api/login`
- `POST /api/logout`
- `GET /api/me`
- `POST /api/folders`
- `GET /api/files`
- `POST /api/upload`
- `GET /api/download/:id`
- `POST /api/subscription/checkout`
- `POST /api/subscription/activate-pro`
- `POST /api/admin/unrestricted/:userId`

