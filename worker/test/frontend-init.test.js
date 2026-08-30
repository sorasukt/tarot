import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const repositoryRoot = new URL("../../", import.meta.url);

function fakeElement() {
  return {
    hidden: false,
    value: "",
    textContent: "",
    innerHTML: "",
    classList: { add() {}, remove() {} },
    addEventListener() {},
    focus() {},
    querySelector() { return fakeElement(); }
  };
}

function browserContext(member = null) {
  const elements = new Map();
  const ready = [];
  const document = {
    querySelector(selector) {
      if (!elements.has(selector)) elements.set(selector, fakeElement());
      return elements.get(selector);
    },
    getElementById(id) {
      const selector = `#${id}`;
      if (!elements.has(selector)) elements.set(selector, fakeElement());
      return elements.get(selector);
    },
    body: { classList: { add() {}, remove() {} } },
    addEventListener() {}
  };
  const context = {
    addEventListener(type, handler) { if (type === "DOMContentLoaded") ready.push(handler); },
    clearTimeout,
    console,
    Date,
    document,
    Intl,
    location: { assign() {}, href: "https://sorasukt.com/tarot/me/", origin: "https://sorasukt.com" },
    requestAnimationFrame(handler) { handler(); },
    setTimeout,
    window: {
      TarotPortal: {
        api: async () => new Response("{}", { status: 200 }),
        clearMemberCache() {},
        getMember: async () => member
      }
    }
  };
  return { context, elements, ready };
}

async function loadScript(path, context) {
  const source = await readFile(new URL(path, repositoryRoot), "utf8");
  vm.runInNewContext(source, context, { filename: path });
}

test("My Account script initializes and renders member data", async () => {
  const fixture = browserContext({
    success: true,
    user: { name: "Sorasuk", email: "member@example.com" },
    profile: { birth_date: "2000-01-02", birth_time: "09:30" },
    completion: { hasBirthDate: true, hasBirthTime: true, hasBirthPlace: false }
  });
  await loadScript("me/me.js", fixture.context);
  assert.equal(fixture.ready.length, 1);
  assert.doesNotThrow(() => fixture.ready[0]());
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(fixture.elements.get("#accountName").textContent, "Sorasuk");
  assert.equal(fixture.elements.get("#accountEmail").textContent, "member@example.com");
  assert.equal(fixture.elements.get("#birthDate").value, "2000-01-02");
  assert.equal(fixture.elements.get("#profileStatus").textContent, "ข้อมูลของคุณพร้อมใช้งาน");
});

test("Astrology script binds its form without a selector error", async () => {
  const fixture = browserContext(null);
  await assert.doesNotReject(loadScript("astrology/astrology.js", fixture.context));
  assert.equal(fixture.ready.length, 1);
});

test("Zodiac form hydrates a signed-in member birth date", async () => {
  const fixture = browserContext({success:true,profile:{birth_date:"1991-08-12"}});
  await loadScript("zodiac/zodiac.js", fixture.context);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(fixture.elements.get("#zodiacBirthDate").value,"1991-08-12");
});

test("Home uses member context to hydrate saved birth data", async () => {
  const fixture = browserContext({success:true,profile:{birth_date:"1991-08-12",birth_time:"07:45"}});
  await loadScript("home.js", fixture.context);
  assert.equal(fixture.ready.length,1);
  fixture.ready[0]();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(fixture.elements.get("#quickBirthDate").value,"1991-08-12");
  assert.equal(fixture.elements.get("#modalBirthTime").value,"07:45");
});

test("Tarot reading shuffles before enabling card selection", async () => {
  const [html,script,styles]=await Promise.all([
    readFile(new URL("reading/index.html",repositoryRoot),"utf8"),
    readFile(new URL("app.js",repositoryRoot),"utf8"),
    readFile(new URL("shuffle.css",repositoryRoot),"utf8")
  ]);
  assert.match(html,/id="shuffleStage"[^>]+aria-live="polite"/);
  assert.match(html,/id="deck"[^>]+hidden/);
  assert.match(script,/async function beginShuffle\(\)/);
  assert.ok(script.indexOf("await new Promise")<script.indexOf("renderDeck();els.shuffleStage.hidden=true"));
  assert.match(script,/setAttribute\("inert",""\)/);
  assert.match(styles,/@keyframes shuffle-card/);
  assert.match(styles,/@media \(prefers-reduced-motion: reduce\)/);
});

test("all Tarot pages share the reading-page visual language",async()=>{
  const pages=["index.html","reading/index.html","astrology/index.html","zodiac/index.html","colors/index.html","numbers/index.html","naming/index.html","me/index.html","membership/index.html","support/index.html","about/index.html","billing/success/index.html"];
  const [styles,...documents]=await Promise.all([readFile(new URL("experience.css",repositoryRoot),"utf8"),...pages.map(path=>readFile(new URL(path,repositoryRoot),"utf8"))]);
  assert.match(styles,/font-family:Georgia,"IBM Plex Sans Thai",serif/);
  assert.match(styles,/font-size:clamp\(48px,7vw,92px\)/);
  assert.match(styles,/--experience-width:1180px/);
  documents.forEach((html,index)=>assert.match(html,/experience\.css\?v=20260829-reading1/,pages[index]));
  ["อ่านจังหวะของคุณ<br>ผ่านดวงดาว","วันเกิดของคุณ<br>บอกอะไรได้บ้าง","เลือกวันที่<br>แล้วค้นหาสีของคุณ","มองความหมาย<br>ผ่านตัวเลขของคุณ","เริ่มจากความหมาย<br>แล้วค้นหาชื่อที่ใช่","ทุกอย่างของคุณ<br>อยู่ที่นี่"].forEach(heading=>assert.ok(documents.some(html=>html.includes(heading)),heading));
});

test("lucky-color pages expose an accessible member result and selected-date tool",async()=>{
  const [home,page,script]=await Promise.all([
    readFile(new URL("index.html",repositoryRoot),"utf8"),
    readFile(new URL("colors/index.html",repositoryRoot),"utf8"),
    readFile(new URL("colors/colors.js",repositoryRoot),"utf8")
  ]);
  assert.match(home,/สำหรับคุณเท่านั้น/);
  assert.match(home,/id="dailyLuckyColor"/);
  assert.match(page,/id="colorDate"[^>]+required/);
  assert.match(page,/id="colorResult"[^>]+aria-live="polite"/);
  assert.match(script,/TarotPortal\.setLoading/);
  assert.ok(script.includes("^#[0-9A-Fa-f]{6}$"));
});

test("billing pages use simple provider-neutral copy and keep membership management in My Account",async()=>{
  const [membership,support,success,account,membershipScript,supportScript,successScript,accountScript,billingStyles]=await Promise.all([
    readFile(new URL("membership/index.html",repositoryRoot),"utf8"),
    readFile(new URL("support/index.html",repositoryRoot),"utf8"),
    readFile(new URL("billing/success/index.html",repositoryRoot),"utf8"),
    readFile(new URL("me/index.html",repositoryRoot),"utf8"),
    readFile(new URL("membership/membership.js",repositoryRoot),"utf8"),
    readFile(new URL("support/support.js",repositoryRoot),"utf8"),
    readFile(new URL("billing/success/success.js",repositoryRoot),"utf8"),
    readFile(new URL("me/me.js",repositoryRoot),"utf8"),
    readFile(new URL("billing.css",repositoryRoot),"utf8")
  ]);
  assert.match(membership,/<strong>Subscription<\/strong><em>ต่ออายุอัตโนมัติ<\/em>/);
  assert.match(membership,/<strong>Pay as you go<\/strong><em>ชำระครั้งเดียว<\/em>/);
  assert.match(membership,/เลือกรูปแบบที่เหมาะกับคุณ/);
  assert.match(membership,/เลือกช่วงเวลาที่พอดี/);
  assert.match(membership,/เปรียบเทียบแผน Subscription/);
  assert.match(membership,/id="priceComparisonBody"/);
  assert.match(membership,/aria-label="รองรับ Visa, Mastercard, Apple Pay และ Google Pay"/);
  assert.match(membership,/aria-label="รองรับ Visa, Mastercard, Apple Pay, Google Pay และ PromptPay"/);
  assert.match(membership,/logo-visa/);assert.match(membership,/logo-mastercard/);assert.match(membership,/logo-apple-pay/);assert.match(membership,/logo-google-pay/);assert.match(membership,/logo-promptpay/);
  ["visa-brandmark.png","ma_symbol.svg","Apple_Pay_logo.svg.png","Google_Pay_Logo.svg.png","PromptPay-logo.png"].forEach(asset=>assert.match(membership,new RegExp(`assets/payments/${asset.replace(".","\\.")}`)));
  assert.match(billingStyles,/\.logo-mastercard/);assert.match(billingStyles,/\.logo-apple-pay/);assert.match(billingStyles,/\.logo-google-pay/);assert.match(billingStyles,/\.logo-promptpay/);
  assert.match(billingStyles,/\.payment-logo img/);
  assert.match(support,/PromptPay/);assert.match(support,/ที่อยู่จัดส่ง/);
  assert.match(support,/id="supportButton"[^>]*>ดำเนินต่อ</);
  assert.match(success,/aria-live="polite"/);
  assert.doesNotMatch(membership,/Stripe|Customer Portal|Promotion Code/);
  assert.doesNotMatch(support,/Stripe|Customer Portal/);
  assert.doesNotMatch(success,/Stripe|Customer Portal/);
  assert.doesNotMatch(membershipScript,/\/api\/billing\/portal|กำลังเปิด Stripe|Customer Portal/);
  assert.match(membershipScript,/ลงชื่อใช้งานเพื่อสมัคร/);
  assert.match(membershipScript,/ประหยัด/);
  assert.match(membershipScript,/ภายใน.*เท่านั้น/);
  assert.match(membershipScript,/แผนรายเดือนของวิธีเดียวกัน/);
  assert.match(supportScript,/checkout\/support/);
  assert.doesNotMatch(supportScript,/กำลังเปิด Stripe|บน Stripe/);
  assert.match(successScript,/ดูใบเสร็จ/);
  assert.match(successScript,/href="\.\.\/\.\.\/me\/"/);
  assert.doesNotMatch(successScript,/\/api\/billing\/portal|Customer Portal/);
  assert.match(account,/id="accountPortalButton"[^>]*>เปลี่ยนแพ็กเกจหรือยกเลิกสมาชิก</);
  assert.match(accountScript,/\/api\/billing\/portal/);
  assert.match(accountScript,/\/api\/billing\/status\?refresh=1/);
  assert.match(accountScript,/cancelAtPeriodEnd/);
  assert.doesNotMatch(account+accountScript,/Customer Portal/);
});
