# Tamkko API

Tamkko is a creator-economy backend platform built for mobile-first communities. It enables creators to monetise content through tipping, gated VIP rooms, and subscriptions, while providing fans with a rich social experience — real-time chat, direct messaging, a personalised video feed, and a referral programme — all running on a single Node.js service backed by MongoDB, Redis, and Cloudflare Stream.

## Tech Stack

- **Runtime** — Node.js 20, TypeScript
- **Framework** — Express
- **Database** — MongoDB via Mongoose
- **Queue / Cache** — Redis via BullMQ & ioredis
- **Real-time** — Socket.IO
- **Video** — Cloudflare Stream
- **Payments** — Paystack
- **Push notifications** — Expo Server SDK
- **Email** — SendGrid
- **SMS** — Africa's Talking
- **Container** — Docker + Nginx

## Features

1. JWT authentication — register, login, refresh token
2. Referral system — unique codes, pending → completed on first payment, GHS bonus to referrer
3. Ambassador programme — apply, admin approve/reject
4. Video upload via Cloudflare Stream with webhook processing
5. Video feed — general (cursor-based) and personalised (follows-filtered, page-based)
6. Tipping and wallet — Paystack charge, creator earnings credit, withdrawal via bank transfer
7. VIP rooms — campus-code gating, membership, monthly subscription via Paystack
8. VIP room posts — scoped content for room members
9. Multi-channel notifications — push (Expo), email (SendGrid), SMS (Africa's Talking), persisted to DB, emitted via Socket.IO
10. Likes and dislikes — polymorphic (Video / VIPPost), real-time count broadcast to creator
11. Comments with threaded replies — polymorphic, soft-delete cascades to children
12. Follow / unfollow — with follower/following counts on profile, real-time `new_follower` event
13. Direct messaging — conversation list with unread counts, read receipts via Socket.IO
14. VIP room real-time chat — membership-gated Socket.IO messages
15. Admin panel — ambassador status management

## Environment Variables

| Variable | Description | Required |
|---|---|---|
| `NODE_ENV` | `development` \| `production` \| `test` | Optional (default: `development`) |
| `PORT` | HTTP port | Optional (default: `5000`) |
| `BASE_URL` | Public API base URL | Optional |
| `CLIENT_URL` | Frontend origin for CORS / Socket.IO | Optional |
| `MONGODB_URI` | MongoDB connection string | Optional (default: `mongodb://mongo:27017/tamkko`) |
| `REDIS_URL` | Redis connection string | Optional (default: `redis://redis:6379`) |
| `JWT_SECRET` | Access token signing secret (≥ 32 chars) | Required in production |
| `JWT_EXPIRES_IN` | Access token TTL | Optional (default: `7d`) |
| `JWT_REFRESH_SECRET` | Refresh token signing secret (≥ 32 chars) | Required in production |
| `JWT_REFRESH_EXPIRES_IN` | Refresh token TTL | Optional (default: `30d`) |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare Stream account ID | Required |
| `CLOUDFLARE_API_TOKEN` | Cloudflare Stream API token | Required |
| `PAYSTACK_SECRET_KEY` | Paystack secret key (webhook HMAC + API calls) | Optional |
| `PAYSTACK_PUBLIC_KEY` | Paystack public key | Optional |
| `HUBTEL_CLIENT_ID` | Hubtel client ID | Optional |
| `HUBTEL_CLIENT_SECRET` | Hubtel client secret | Optional |
| `HUBTEL_MERCHANT_NUMBER` | Hubtel merchant number | Optional |
| `EXPO_ACCESS_TOKEN` | Expo push notification access token | Optional |
| `SENDGRID_API_KEY` | SendGrid API key for email | Optional |
| `FROM_EMAIL` | Sender address for emails | Optional (default: `noreply@tamkko.app`) |
| `AFRICAS_TALKING_API_KEY` | Africa's Talking API key for SMS | Optional |
| `AFRICAS_TALKING_USERNAME` | Africa's Talking username | Optional |
| `REFERRAL_BONUS_GHS` | GHS amount credited to referrer on first tip | Optional (default: `5`) |
| `RATE_LIMIT_WINDOW_MS` | Rate limit window in milliseconds | Optional (default: `900000`) |
| `RATE_LIMIT_MAX_REQUESTS` | Max requests per window | Optional (default: `100`) |
| `BCRYPT_ROUNDS` | bcrypt cost factor | Optional (default: `12`) |

## Development Setup

```bash
# 1. Install dependencies
npm install

# 2. Copy environment file and fill in values
cp .env.example .env

# 3. Start in dev mode (hot-reload via ts-node-dev)
npm run dev
```

The server starts on `http://localhost:5000`. MongoDB and Redis must be reachable at the URLs in your `.env`.

## Production Deployment

```bash
# From the project root (directory containing docker-compose.yml)

# 1. Copy and configure the app environment file
cp tamkko/.env.example tamkko/.env
# Edit tamkko/.env with production secrets

# 2. Place TLS certificates
#    ./nginx/certs/fullchain.pem
#    ./nginx/certs/privkey.pem

# 3. Build and start all services
docker compose up -d --build

# 4. View logs
docker compose logs -f api
```

Services started:
- `tamkko_api` — Node.js API on port 5000 (internal)
- `tamkko_mongo` — MongoDB (internal only)
- `tamkko_redis` — Redis (internal only)
- `tamkko_nginx` — Nginx reverse proxy on ports 80 and 443

## API Base URL

```
https://your-domain.com/api/v1
```

Health check: `GET /health`

## WebSocket Events

Clients authenticate by passing a JWT in the Socket.IO handshake auth object: `{ auth: { token: '<jwt>' } }`. On connect, each socket automatically joins `user_<userId>`.

### Client → Server

| Event | Payload | Description |
|---|---|---|
| `join_vip_room` | `{ roomId: string }` | Join a VIP room's real-time channel (membership checked server-side) |
| `leave_vip_room` | `{ roomId: string }` | Leave a VIP room's channel |
| `vip_new_post` | `{ roomId: string, post: object }` | Broadcast a new post to VIP room members |
| `send_dm` | `{ recipientId: string, content: string }` | Send a direct message |
| `send_vip_message` | `{ roomId: string, content: string }` | Send a message to a VIP room chat |
| `mark_dm_read` | `{ otherUserId: string }` | Mark a DM thread as read and notify the other user |

### Server → Client

| Event | Delivered to | Payload | Description |
|---|---|---|---|
| `new_notification` | `user_<userId>` | Notification object | General notification (comment, tip, system, etc.) |
| `video_reaction_updated` | `user_<creatorId>` | `{ videoId, likes, dislikes }` | Sent when a like/dislike is toggled on a creator's video |
| `video_new_comment` | `video_<videoId>` | `{ comment }` | New comment broadcast to video room |
| `vip_new_comment` | `vip_room_<roomId>` | `{ comment, postId }` | New comment on a VIP post |
| `vip_post_received` | `vip_room_<roomId>` | Post object | New post broadcast to VIP room |
| `new_follower` | `user_<targetUserId>` | `{ follower }` | Someone followed the user |
| `new_dm` | `user_<recipientId>` | `{ message }` | Incoming direct message |
| `dm_sent` | sender socket | `{ message }` | Acknowledgment that the DM was delivered |
| `dm_read` | `user_<senderId>` | `{ readBy }` | Read receipt — recipient opened the thread |
| `new_vip_message` | `vip_room_<roomId>` | `{ message }` | New chat message in a VIP room |
| `error` | sender socket | `{ message }` | Socket-level error (auth, membership, bad payload) |
