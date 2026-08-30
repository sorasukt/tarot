(() => {
  const API = "https://api.sorasukt.com";
  const RETURN_TO = `${window.location.origin}/tarot/`;
  const $ = id => document.getElementById(id);

  function login() { window.location.assign(`${API}/auth/login?returnTo=${encodeURIComponent(RETURN_TO)}`); }
  function logout() { window.location.assign(`${API}/auth/logout?returnTo=${encodeURIComponent(RETURN_TO)}`); }

  async function api(path, options = {}) {
    return fetch(`${API}${path}`, { ...options, credentials: "include" });
  }

  async function updateAuthUI() {
    const response = await api("/api/member/me");
    const authenticated = response.ok;
    $("signInButton").hidden = authenticated;
    $("logoutButton").hidden = !authenticated;
    $("userButton").hidden = !authenticated;
    $("memberPanel").hidden = !authenticated;
    if (!authenticated) return false;
    const data = await response.json();
    const user = data.user || {};
    $("userName").textContent = user.name || user.nickname || user.email || "บัญชี";
    if (user.picture) {
      $("userAvatar").src = user.picture;
      $("userAvatar").alt = $("userName").textContent;
      $("userAvatar").hidden = false;
    }
    return true;
  }

  async function init() {
    const params = new URLSearchParams(window.location.search);
    if (params.has("auth_error")) {
      const message = params.get("auth_error") || "Authentication failed";
      window.history.replaceState({}, document.title, "/tarot/");
      setStatus(`ไม่สามารถลงชื่อเข้าใช้ได้: ${message}`);
    }
    const authenticated = await updateAuthUI();
    if (authenticated) await loadProfileAndDaily();
  }

  async function loadProfileAndDaily() {
    setStatus("กำลังโหลดข้อมูลสมาชิก...");
    const response = await api("/api/member/profile");
    const data = await response.json();
    if (!response.ok) throw new Error(data?.error?.message || "โหลดโปรไฟล์ไม่สำเร็จ");
    if (!data.profile) {
      $("profileForm").hidden = false;
      $("dailyContent").hidden = true;
      setStatus("ระบุวันเดือนปีเกิดเพื่อเปิดใช้งานดวงประจำวัน");
      return;
    }
    $("birthDate").value = data.profile.birth_date || "";
    $("birthTime").value = data.profile.birth_time || "";
    $("profileForm").hidden = true;
    await loadDaily();
  }

  async function loadDaily() {
    $("dailyContent").hidden = true;
    setStatus("กำลังเปิดดวงประจำวันของคุณ...");
    let response = await api("/api/member/daily");
    if (response.status === 202) {
      await new Promise(resolve => setTimeout(resolve, 1800));
      response = await api("/api/member/daily");
    }
    const data = await response.json();
    if (response.status === 409 && data?.error?.code === "PROFILE_REQUIRED") {
      $("profileForm").hidden = false;
      setStatus(data.error.message);
      return;
    }
    if (!response.ok) {
      setStatus(data?.error?.message || "ไม่สามารถโหลดดวงประจำวันได้");
      return;
    }
    $("dailyDate").textContent = data.date;
    $("dailyCard").textContent = data.card?.name || "";
    $("dailyTitle").textContent = data.horoscope?.title || "ดวงประจำวัน";
    $("dailySummary").textContent = data.horoscope?.summary || "";
    $("dailyEnergy").textContent = data.horoscope?.energy || "";
    $("dailyFocus").textContent = data.horoscope?.focus || "";
    $("dailyAvoid").textContent = data.horoscope?.avoid || "";
    $("dailyAdvice").textContent = data.horoscope?.advice || "";
    $("dailyContent").hidden = false;
    setStatus(data.cached ? "ดวงวันนี้พร้อมให้คุณอ่านแล้ว" : "เตรียมดวงวันนี้เรียบร้อยแล้ว");
  }

  async function saveProfile(event) {
    event.preventDefault();
    const birthDate = $("birthDate").value;
    const birthTime = $("birthTime").value;
    if (!birthDate) { setStatus("กรุณาระบุวันเดือนปีเกิด"); return; }
    $("saveProfile").disabled = true;
    setStatus("กำลังบันทึกข้อมูล...");
    try {
      const response = await api("/api/member/profile", {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=UTF-8" },
        body: JSON.stringify({ birthDate, birthTime })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error?.message || "บันทึกข้อมูลไม่สำเร็จ");
      $("profileForm").hidden = true;
      await loadDaily();
    } catch (error) {
      console.error("Profile save failed", error);
      setStatus(error?.message === "Load failed" ? "ยังเปิดข้อมูลสมาชิกไม่ได้ กรุณาลองอีกครั้ง" : (error?.message || "บันทึกข้อมูลไม่สำเร็จ"));
    } finally {
      $("saveProfile").disabled = false;
    }
  }

  function setStatus(text) { $("memberStatus").textContent = text || ""; }

  window.addEventListener("DOMContentLoaded", () => {
    $("signInButton").addEventListener("click", login);
    $("logoutButton").addEventListener("click", logout);
    $("profileForm").addEventListener("submit", saveProfile);
    $("editProfile").addEventListener("click", () => { $("profileForm").hidden = false; });
    init().catch(error => {
      console.error("Member initialization failed", error);
      setStatus(error?.message||"ยังเปิดข้อมูลสมาชิกไม่ได้ กรุณาลองอีกครั้ง");
    });
  });
})();
