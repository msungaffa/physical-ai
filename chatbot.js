// 홈페이지 안내 챗봇 위젯 (Supabase Edge Function "chat" 호출)
// index.html에서 window.CHATBOT_ENDPOINT 를 먼저 설정한 뒤 이 파일을 불러온다.
(function () {
  const ENDPOINT = window.CHATBOT_ENDPOINT;
  const history = [];

  const style = document.createElement("style");
  style.textContent = `
    .cb-toggle {
      position: fixed; right: 24px; bottom: 24px; z-index: 50;
      width: 60px; height: 60px; border: 0; border-radius: 50%;
      background: var(--accent, #0284C7); color: #fff; cursor: pointer;
      box-shadow: 0 8px 24px rgba(19, 27, 46, 0.25);
      display: grid; place-items: center;
    }
    .cb-toggle:hover { background: var(--accent-dark, #006194); }
    .cb-panel {
      position: fixed; right: 24px; bottom: 96px; z-index: 50;
      width: 380px; max-width: calc(100vw - 32px);
      height: 540px; max-height: calc(100vh - 120px);
      display: none; flex-direction: column;
      background: var(--surface, #fff); color: var(--ink, #131B2E);
      border: 1px solid var(--line, #DCE3EE); border-radius: 16px;
      box-shadow: 0 16px 48px rgba(19, 27, 46, 0.2); overflow: hidden;
    }
    .cb-panel.open { display: flex; }
    .cb-head {
      padding: 14px 18px; background: var(--dark, #131B2E); color: #fff;
      font-weight: 700; display: flex; justify-content: space-between; align-items: center;
    }
    .cb-head small { display: block; font-weight: 400; opacity: 0.7; font-size: 0.78rem; }
    .cb-close { background: none; border: 0; color: #fff; font-size: 1.4rem; cursor: pointer; line-height: 1; }
    .cb-log { flex: 1; overflow-y: auto; padding: 16px; display: flex; flex-direction: column; gap: 10px; background: var(--bg, #F7F9FC); }
    .cb-msg { max-width: 85%; padding: 10px 14px; border-radius: 14px; font-size: 0.93rem; line-height: 1.6; white-space: pre-wrap; }
    .cb-msg.user { align-self: flex-end; background: var(--accent, #0284C7); color: #fff; border-bottom-right-radius: 4px; }
    .cb-msg.bot { align-self: flex-start; background: var(--surface, #fff); border: 1px solid var(--line, #DCE3EE); border-bottom-left-radius: 4px; }
    .cb-msg.bot.error { border-color: var(--lv4, #D62839); color: var(--lv4, #D62839); }
    .cb-chips { display: flex; flex-wrap: wrap; gap: 6px; }
    .cb-chips-label { width: 100%; font-size: 0.75rem; color: var(--muted, #55606E); }
    .cb-chip {
      border: 1px solid var(--accent, #0284C7); color: var(--accent-dark, #006194); background: var(--accent-soft, #E3F2FB);
      border-radius: 999px; padding: 5px 12px; font: inherit; font-size: 0.82rem; cursor: pointer;
    }
    .cb-form { display: flex; gap: 8px; padding: 12px; border-top: 1px solid var(--line, #DCE3EE); background: var(--surface, #fff); }
    .cb-input { flex: 1; border: 1px solid var(--line, #DCE3EE); border-radius: 10px; padding: 10px 12px; font: inherit; font-size: 0.93rem; }
    .cb-input:focus { outline: 2px solid var(--accent, #0284C7); border-color: transparent; }
    .cb-send { border: 0; border-radius: 10px; padding: 0 16px; background: var(--accent, #0284C7); color: #fff; font: inherit; font-weight: 700; cursor: pointer; }
    .cb-send:disabled { opacity: 0.5; cursor: default; }
    @media (max-width: 480px) {
      .cb-panel { right: 16px; bottom: 88px; }
      .cb-toggle { right: 16px; bottom: 16px; }
    }
  `;
  document.head.appendChild(style);

  const toggle = document.createElement("button");
  toggle.className = "cb-toggle";
  toggle.setAttribute("aria-label", "안내 챗봇 열기");
  toggle.innerHTML = `<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>`;

  const panel = document.createElement("div");
  panel.className = "cb-panel";
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-label", "안내 챗봇");
  panel.innerHTML = `
    <div class="cb-head">
      <div>안전관리 시스템 안내 챗봇<small>홈페이지·기획 문서를 바탕으로 답합니다</small></div>
      <button class="cb-close" aria-label="닫기">×</button>
    </div>
    <div class="cb-log" aria-live="polite"></div>
    <form class="cb-form">
      <input class="cb-input" type="text" maxlength="500" placeholder="궁금한 점을 물어보세요" aria-label="질문 입력">
      <button class="cb-send" type="submit">전송</button>
    </form>`;

  document.body.append(toggle, panel);
  const log = panel.querySelector(".cb-log");
  const form = panel.querySelector(".cb-form");
  const input = panel.querySelector(".cb-input");
  const send = panel.querySelector(".cb-send");

  // 출처는 화면에 표시하지 않고 서버(site_chat_logs)에만 기록한다
  function addMsg(role, text) {
    const el = document.createElement("div");
    el.className = `cb-msg ${role}`;
    el.textContent = text;
    log.appendChild(el);
    log.scrollTop = log.scrollHeight;
    return el;
  }

  // 질문 버튼: 처음엔 추천 질문, 답변 뒤엔 서버가 고른 연관 질문을 대화 맨 아래에 보여준다
  const SUGGESTIONS = ["어떤 위험을 감지하나요?", "어떤 AI 모델을 쓰나요?", "투자비 회수 기간은?"];
  const asked = new Set();
  let chips = null;
  function showChips(questions, label) {
    if (!questions.length) return;
    chips = document.createElement("div");
    chips.className = "cb-chips";
    const l = document.createElement("div");
    l.className = "cb-chips-label";
    l.textContent = label;
    chips.appendChild(l);
    questions.forEach((q) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "cb-chip";
      b.textContent = q;
      b.addEventListener("click", () => ask(q));
      chips.appendChild(b);
    });
    log.appendChild(chips);
    log.scrollTop = log.scrollHeight;
  }

  addMsg("bot", "안녕하세요! AI 작업장 안전관리 시스템에 대해 궁금한 점을 물어보세요.");
  showChips(SUGGESTIONS, "이런 걸 물어볼 수 있어요");

  async function ask(question) {
    if (chips) chips.remove();
    asked.add(question);
    let related = [];
    addMsg("user", question);
    const pending = addMsg("bot", "답변을 찾는 중…");
    send.disabled = true;
    try {
      if (!ENDPOINT) throw new Error("CHATBOT_ENDPOINT가 설정되지 않았습니다.");
      const res = await fetch(ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question, history }),
        signal: AbortSignal.timeout(60000),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      pending.remove();
      addMsg("bot", data.answer);
      related = Array.isArray(data.related) ? data.related : [];
      history.push({ role: "user", text: question }, { role: "assistant", text: data.answer });
    } catch (e) {
      pending.className = "cb-msg bot error";
      pending.textContent = e.name === "TimeoutError"
        ? "응답이 너무 오래 걸려 중단했어요. 잠시 후 다시 질문해 주세요."
        : "죄송해요, 답변을 가져오지 못했습니다. (" + e.message + ")";
    } finally {
      send.disabled = false;
      if (related.length) showChips(related, "이어서 물어보기");
      else showChips(SUGGESTIONS.filter((q) => !asked.has(q)), "이런 걸 물어볼 수 있어요");
      input.focus();
    }
  }

  function setOpen(open) {
    panel.classList.toggle("open", open);
    toggle.setAttribute("aria-label", open ? "안내 챗봇 닫기" : "안내 챗봇 열기");
    if (open) input.focus();
  }
  toggle.addEventListener("click", () => setOpen(!panel.classList.contains("open")));
  panel.querySelector(".cb-close").addEventListener("click", () => setOpen(false));
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") setOpen(false); });

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const q = input.value.trim();
    if (!q || send.disabled) return;
    input.value = "";
    ask(q);
  });
})();
