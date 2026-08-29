# Watch Together Production Setup

The application now has graceful local fallbacks, but a public Vercel deployment needs the settings below for reliable multi-user calls and Drive conversion.

## 1. Shared realtime state

Add `WATCH_TOGETHER_REDIS_URL` in the server Vercel project. An Upstash Redis integration provides a `rediss://` connection string. The Socket.IO Redis adapter and room presence store use it so users connected to different Vercel function instances still receive chat, call signals, and roster updates.

## 2. TURN relay for video calls

STUN discovers direct peer routes, but it cannot relay traffic when a network firewall or NAT blocks that route. Configure one of the following server-side choices. Do not add a `VITE_WATCH_TOGETHER_ICE_SERVERS` value because Vite exposes it to every browser.

### Metered hosted TURN

1. Create a Metered TURN account and create a TURN credential in the Metered dashboard.
2. Open **Show ICE Servers Array** for that credential and copy its `apiKey`, not an ICE username or password.
3. Add these Vercel server environment variables:

```text
METERED_TURN_DOMAIN=your-app.metered.live
METERED_TURN_API_KEY=the-credential-api-key
WATCH_TOGETHER_ICE_TRANSPORT_POLICY=relay
```

`WATCH_TOGETHER_ICE_TRANSPORT_POLICY=relay` makes browsers use the TURN relay instead of an unreliable direct route. It is especially useful for school, office, and mobile networks. The server only returns this policy when it has received a valid relay list.

For short-lived Metered credentials instead, create a TURN project and use:

```text
METERED_TURN_DOMAIN=your-app.metered.live
METERED_TURN_SECRET_KEY=the-secret-from-Developers
METERED_TURN_PROJECT_ID=the-turn-project-id
METERED_TURN_CREDENTIAL_TTL_SECONDS=7200
WATCH_TOGETHER_ICE_TRANSPORT_POLICY=relay
```

The `/api/watch-together/ice-servers` route fetches the credential's ICE list and sends it only to an authenticated room member. It never exposes the Metered secret key.

### Your own coturn relay

Configure coturn with `--use-auth-secret` and `--static-auth-secret=<secret>`, then add:

```text
WATCH_TOGETHER_TURN_URLS=turn:turn.example.com:80,turn:turn.example.com:80?transport=tcp,turns:turn.example.com:443?transport=tcp
WATCH_TOGETHER_TURN_SHARED_SECRET=the-same-coturn-static-auth-secret
```

The server creates a per-user HMAC-SHA1 credential that expires after two hours.

## 3. Browser-compatible Drive playback

Google Drive can preview MKV/HEVC files using Google-owned player code, but a website cannot control or synchronize that cross-origin preview. The app now handles this in two ways:

- Shared MP4 or WebM Drive files are used directly in the synchronized HTML video player.
- An unsupported Drive file can be converted by the room creator into an H.264/AAC MP4 through Cloudinary.

Add these server-only variables for conversion:

```text
CLOUDINARY_CLOUD_NAME=your-cloud-name
CLOUDINARY_API_KEY=your-api-key
CLOUDINARY_API_SECRET=your-api-secret
```

If Cloudinary has restricted remote fetch domains enabled, allow `drive.usercontent.google.com`. The Drive file must be shared with the room before Cloudinary can retrieve it. Large files must fit the limits of the selected Cloudinary plan; no web application can safely force a multi-gigabyte MKV to transcode inside a Vercel function.

For already-created rooms that show the Drive preview warning, the room creator can use **Make synchronized copy** in that warning. New unsupported Drive files are prepared before the room is created.

## 4. Direct multi-gigabyte uploads with Cloudflare R2

The **Direct upload** source sends video parts from the browser directly to Cloudflare R2. The application server only creates short-lived upload permissions and completes the upload, so it does not need to receive a 2–3 GB file.

Create an R2 bucket and an S3 API token limited to that bucket, then add these server-side environment variables in the `hotcorner-server` Vercel project:

```text
R2_ACCOUNT_ID=your-cloudflare-account-id
R2_ACCESS_KEY_ID=your-r2-access-key-id
R2_SECRET_ACCESS_KEY=your-r2-secret-access-key
R2_BUCKET=hot-corner-watch-together
WATCH_TOGETHER_R2_MAX_FILE_SIZE_GB=10
```

The default application guard is 10 GB and can be increased deliberately. The current R2 multipart API supports much larger objects, but there is no genuinely unrestricted storage service: your bucket storage and account limits still apply.

In the R2 bucket **Settings > CORS Policy**, add the frontend origins you use. Include production and local development only when you use both:

```json
[
  {
    "AllowedOrigins": [
      "https://hot-corner.vercel.app",
      "http://localhost:5174"
    ],
    "AllowedMethods": ["GET", "HEAD", "PUT"],
    "AllowedHeaders": ["*"],
    "ExposeHeaders": ["ETag", "Content-Length", "Content-Range", "Accept-Ranges"],
    "MaxAgeSeconds": 3600
  }
]
```

Do not add these values to the client or name them with `VITE_`; the browser receives only short-lived signed URLs. Keep the bucket private. The application creates a signed playback URL after upload, which room members can use without making the bucket public.

For storage cleanup, add an R2 lifecycle rule to delete the `watch-together/` prefix after the longest room lifetime you want to support, such as 8 days. The browser still requires a compatible video: use H.264/AAC MP4, WebM, or Ogg. Storage alone cannot make MKV/HEVC play in every browser.
