# Tarot API (Cloudflare Worker + Gemini)

API สำหรับ `/tarot` โดย Cloudflare Worker ที่ `https://api.sorasukt.com` ทำหน้าที่ทั้ง member API, Auth0 server-side callback, Stripe billing/webhook, Open-Meteo public geocoding proxy และ AI API proxy

## Auth0 — Regular Web Application

`/tarot` ไม่ใช้ Auth0 SPA SDK และไม่ถือ Client Secret หรือ Auth0 token ใน browser

Flow:

1. Browser ไป `GET https://api.sorasukt.com/auth/login`
2. Worker redirect ไป Auth0 Universal Login
3. Auth0 callback กลับ `https://api.sorasukt.com/auth/callback`
4. Worker แลก authorization code ที่ `/oauth/token` ด้วย `AUTH0_CLIENT_ID` + `AUTH0_CLIENT_SECRET`
5. Worker verify ID token ด้วย Auth0 JWKS/RS256 พร้อมตรวจ issuer, audience, expiry, state และ nonce
6. Worker สร้าง signed HttpOnly session cookie
7. Browser กลับ `https://sorasukt.com/tarot/`
8. Member APIs ใช้ session cookie โดย frontend เรียกด้วย `credentials: include`

## Cloudflare secrets

```bash
cd worker
npx wrangler secret put AUTH0_CLIENT_SECRET
npx wrangler secret put GEMINI_API_KEY
npx wrangler secret put STRIPE_SECRET_KEY
npx wrangler secret put STRIPE_WEBHOOK_SECRET
```

Secret ทั้งสี่ถูกประกาศเป็น required ใน `wrangler.json` และต้องตั้งบน Worker โดยไม่ใส่ค่าไว้ใน repository หรือ JavaScript ฝั่งผู้ใช้

การค้นหาสถานที่ใช้ Open-Meteo Geocoding API ผ่าน Worker โดยไม่ต้องตั้ง API key ข้อมูลที่ได้ประกอบด้วยรหัสสถานที่ ชื่อ พิกัด และ IANA timezone การใช้งาน free endpoint ต้องเป็นไปตามเงื่อนไข non-commercial, quota และ CC BY 4.0 ของ Open-Meteo หากบริการเปลี่ยนเป็นเชิงพาณิชย์ให้ตั้ง `GEOCODING_API_BASE` ไปยัง endpoint ตามแผนที่รองรับ

สำหรับ local development ใช้ `.dev.vars`:

```env
AUTH0_CLIENT_SECRET=your_auth0_client_secret
GEMINI_API_KEY=your_gemini_key
STRIPE_SECRET_KEY=sk_test_or_live_key
STRIPE_WEBHOOK_SECRET=whsec_endpoint_secret
```

## Member & Places routes

```text
GET /auth/login
GET /auth/callback
GET /auth/logout
GET /api/member/me
GET /api/member/context
GET /api/member/profile
POST /api/member/profile
GET /api/member/daily
GET /api/member/astrology
GET /api/member/places/autocomplete?q=...
```

## Stripe billing

สร้าง Product/Price สำหรับ `Tarot for your daily` ใน Stripe Dashboard แล้วตั้ง GitHub Actions variables ต่อไปนี้เป็น Price IDs (`price_...`):

```text
STRIPE_PRICE_SUB_WEEKLY
STRIPE_PRICE_SUB_MONTHLY
STRIPE_PRICE_SUB_YEARLY
STRIPE_PRICE_ONETIME_WEEKLY
STRIPE_PRICE_ONETIME_MONTHLY
STRIPE_PRICE_ONETIME_YEARLY
```

ราคาที่กำหนดใน Stripe ต้องเป็นสกุลเงินบาทตามตารางนี้:

| รูปแบบ | รายสัปดาห์ | รายเดือน | รายปี |
| --- | ---: | ---: | ---: |
| Subscription | ฿59 | ฿199 | ฿1,690 |
| Pay as you go | ฿79 | ฿259 | ฿1,790 |

Price กลุ่ม `SUB` ต้องเป็น recurring prices รอบละ 1 สัปดาห์/เดือน/ปี และกลุ่ม `ONETIME` ต้องเป็น one-time prices Worker ตรวจ Price ID, จำนวนเงิน, สกุลเงิน ประเภท Price และรอบต่ออายุกับ Stripe ก่อนสร้าง Checkout หากตั้งค่าผิด แผนนั้นจะไม่เปิดรับชำระเงิน

Checkout ใช้วิธีชำระเงินที่เปิดใช้งานใน Stripe Dashboard และให้ Stripe กรองตามประเทศ สกุลเงิน อุปกรณ์ และรูปแบบรายการโดยอัตโนมัติ สำหรับบัญชีประเทศไทย บัตร Visa และ Mastercard ใช้ได้กับแผนสมาชิก รวมถึง Apple Pay และ Google Pay เมื่ออุปกรณ์และเบราว์เซอร์เข้าเกณฑ์ ส่วน PromptPay ใช้ได้เฉพาะรายการเงินบาทแบบชำระครั้งเดียว จึงถูกกันออกจาก Subscription แต่เปิดให้ Pay as you go และรายการสนับสนุน Checkout ของแผนสมาชิกทั้งสองรูปแบบเปิดให้ผู้ใช้กรอก Promotion Code ที่สร้างและเปิดใช้งานไว้ใน Stripe Dashboard ส่วนรายการสนับสนุนไม่รับส่วนลดเพราะผู้ใช้กำหนดยอดชำระเอง

Checkout ใช้ `locale=auto` เพื่อแสดงภาษาตามการตั้งค่าเบราว์เซอร์หรืออุปกรณ์ของผู้ใช้ แทนการบังคับภาษาไทย

ตั้ง Stripe webhook endpoint เป็น:

```text
https://api.sorasukt.com/api/stripe/webhook
```

เลือก event อย่างน้อย `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed`, `checkout.session.expired`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`, `customer.subscription.paused`, `customer.subscription.resumed`, `invoice.paid`, `invoice.payment_action_required`, `invoice.payment_failed`, `charge.succeeded` และ `charge.updated` จากนั้นนำ endpoint signing secret ไปตั้งเป็น `STRIPE_WEBHOOK_SECRET`

เปิด PromptPay และ Card ใน Stripe payment-method settings และตั้ง Customer Portal ดังนี้:

1. เปิด `Switch plan` แล้วเพิ่ม recurring Price รายสัปดาห์ รายเดือน และรายปีของ `Tarot for your daily` เป็นแพ็กเกจที่เลือกเปลี่ยนได้
2. เปิด `Cancel subscription`, การแก้ไขวิธีชำระเงิน และประวัติใบแจ้งหนี้
3. กำหนดว่าจะคิดส่วนต่างทันทีหรือเมื่อจบรอบบิลให้ตรงกับนโยบายธุรกิจ โดยแนะนำให้การลดแพ็กเกจมีผลเมื่อจบรอบ เพื่อไม่ตัดสิทธิ์ที่ผู้ใช้จ่ายแล้ว

Worker จะใช้ Customer Portal configuration เริ่มต้นของบัญชี Stripe โดยอัตโนมัติ จึงไม่ต้องตั้ง Configuration ID ใน GitHub Actions

เมื่อผู้ใช้เปลี่ยนแพ็กเกจ ต่ออายุ หยุด ยกเลิก หรือชำระไม่สำเร็จ Webhook จะอัปเดตสถานะ รอบแพ็กเกจ วันสิ้นสุด และการยกเลิกใน D1 เมื่อกลับจากหน้าจัดการ หน้า “ฉัน” จะตรวจสถานะล่าสุดกับผู้ให้บริการอีกครั้งเพื่อครอบคลุมกรณี Webhook ยังมาถึงไม่ทัน ระบบสนับสนุนใช้ THB และขอ billing/shipping address ในประเทศไทยผ่าน Stripe Checkout

Billing routes:

```text
GET  /api/billing/plans
GET  /api/billing/status
GET  /api/billing/session?session_id=...
POST /api/billing/checkout/membership
POST /api/billing/checkout/support
POST /api/billing/portal
POST /api/stripe/webhook
```

ใช้ `GET /api/billing/status?refresh=1` เฉพาะเมื่อผู้ใช้กลับจากหน้าจัดการสมาชิก เพื่อดึง Subscription ล่าสุดและบันทึกลง D1 โดยไม่เรียกผู้ให้บริการซ้ำทุกครั้งที่เปิดหน้า

สิทธิ์สมาชิกเปลี่ยนจาก webhook ที่ตรวจ HMAC-SHA256 ของ `Stripe-Signature` แล้วเท่านั้น หน้า success ใช้สำหรับแสดงผลและใบเสร็จ ไม่ใช่หลักฐานเปิดสิทธิ์ D1 ไม่เก็บเลขบัตร, CVC หรือที่อยู่จัดส่งฉบับเต็ม

เมื่อผู้ใช้เลือกสถานที่เกิด Worker จะ resolve Open-Meteo location ID เป็นชื่อสถานที่ พิกัด latitude/longitude และ timezone แล้วเก็บลง D1 โดยไม่เชื่อถือพิกัดที่ส่งมาจาก browser

`/api/member/context` ส่งข้อมูลบัญชี โปรไฟล์วันเกิด/เวลา/สถานที่ และสถานะความครบถ้วนกลับในคำขอเดียว หน้าเว็บที่เกี่ยวข้องจึงเติมข้อมูลเดิมให้สมาชิกที่ล็อกอินได้โดยไม่ต้องขอข้อมูลซ้ำหลาย endpoint

ผลลัพธ์จาก Tarot, Astrology, Zodiac, Numbers และ Naming ของสมาชิกจะเก็บใน D1 โดยมีอายุใช้งานไม่เกิน 60 วัน ใช้ SHA-256 ของ input, โปรไฟล์ และรุ่นโมเดลเป็น cache key ตารางนี้ไม่เก็บ input ดิบซ้ำ หากข้อมูลที่ใช้คำนวณเหมือนเดิม API จะคืนผลเดิมพร้อม `cached: true` โดยไม่สร้างผลใหม่ ผู้ใช้ทั่วไปที่ไม่ได้ล็อกอินจะไม่ถูกเก็บใน cache นี้

ก่อนใช้งานครั้งแรก หน้าเว็บขอให้ผู้ใช้ยอมรับ Terms และ Privacy Policy เวอร์ชันปัจจุบัน สมาชิกบันทึกหลักฐานการยอมรับใน D1 ผ่าน `POST /api/member/consent` ส่วน `POST /api/usage` เก็บเฉพาะเหตุการณ์ใช้งานที่ผ่าน allowlist โดยไม่เก็บคำถามหรือข้อมูลที่กรอกซ้ำ ข้อมูลการใช้งาน ผลประจำวันที่หมดอายุ และ cache จะถูกลบทุกวันตาม cron และเก็บไม่เกิน 60 วัน

Worker จะสลับโมเดลภายในคำขอเดียวโดยอัตโนมัติตามลำดับ `GEMINI_MODEL` → `gemini-2.5-flash` → `gemini-2.5-flash-lite` → `gemini-3.5-flash` → `gemini-3.1-flash-lite` → `gemini-3.5-flash-lite` เมื่อพบ 429, โมเดลไม่มีอยู่, upstream 5xx, network error, timeout ต่อโมเดล หรือผลลัพธ์ไม่สมบูรณ์ แต่ละโมเดลมีเวลารอสูงสุด 10 วินาทีและคำขอรวมสูงสุด 60 วินาที ผู้ใช้จึงไม่ต้องกดใหม่เพื่อเปลี่ยนโมเดล หากทุกโมเดลใช้ไม่ได้ API จะตอบ `503` พร้อมรหัส `AI_CAPACITY_EXHAUSTED` และลิงก์สนับสนุนจาก `SUPPORT_URL`

Session cookie เป็น `HttpOnly`, `Secure`, `SameSite=Lax` และ signed ฝั่ง Worker

## Abuse protection and validation

- คำขอที่เรียก Gemini ถูกจำกัดรวม 20 ครั้งต่อนาทีต่อสมาชิก หรือ per-IP สำหรับผู้ใช้ทั่วไป ผ่าน `AI_RATE_LIMITER`
- Request body ถูกอ่านแบบ bounded stream: 12 KB สำหรับ AI routes และ 4 KB สำหรับ member profile
- ผลลัพธ์จาก Gemini จำกัด output token และ daily reading ที่ค้าง `pending` เกินหนึ่งนาทีสามารถเริ่มใหม่ได้
- D1 query ใช้ prepared statements และผูก cache ทุกแถวกับ Auth0 `user_sub` เพื่อไม่ให้ผลของสมาชิกหนึ่งถูกส่งให้อีกสมาชิก
- รัน `npm run check` เพื่อตรวจ syntax และชุดทดสอบด้วย Node.js test runner

## Security notes

- OAuth code exchange เกิดเฉพาะใน Worker
- ใช้ `state` และ OIDC `nonce`
- ID token ตรวจ RS256 signature ผ่าน Auth0 JWKS
- session cookie อ่านจาก JavaScript ไม่ได้
- CORS จำกัด `https://sorasukt.com` และ `https://www.sorasukt.com`
- Auth0, Gemini และ Stripe secrets ไม่ถูกส่งกลับ client ส่วน public geocoding เรียกผ่าน Worker และไม่ต้องใช้ secret
