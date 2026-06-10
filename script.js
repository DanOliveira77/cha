(function () {
  // Máscara e validação de telefone
  const TELEFONE_REGEX = /^\(\d{2}\)\s\d{4,5}-\d{4}$/;

  function formatarTelefone(valor) {
    const d = valor.replace(/\D/g, "").slice(0, 11);
    if (d.length === 0) return "";
    if (d.length <= 2) return `(${d}`;
    if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
    if (d.length <= 10)
      return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
    return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  }

  function aplicarMascaraTelefone(input) {
    input.addEventListener("input", () => {
      const pos = input.selectionStart;
      const antes = input.value;
      const novo = formatarTelefone(antes);
      input.value = novo;
      input.setSelectionRange(
        Math.min(pos, novo.length),
        Math.min(pos, novo.length),
      );
    });
  }

  // Supabase
  const SUPABASE_URL = "https://lxtryaaqahpmeznimfgf.supabase.co";
  const SUPABASE_ANON_KEY = "sb_publishable_cckol6qJIP_9xWUc_VP6lw_Xqfbpf6x";
  const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  // Mobile menu
  const menuToggle = document.getElementById("menuToggle");
  const navLinks = document.getElementById("navLinks");
  menuToggle.addEventListener("click", () =>
    navLinks.classList.toggle("open"),
  );

  // Smooth scroll para botões com data-target
  document.querySelectorAll("[data-target]").forEach((el) => {
    el.addEventListener("click", () => {
      const target = document.querySelector(el.getAttribute("data-target"));
      if (target)
        target.scrollIntoView({ behavior: "smooth", block: "start" });
      if (el.matches("#navLinks button[data-target]")) {
        navLinks
          .querySelectorAll("button[data-target]")
          .forEach((b) => b.classList.remove("active"));
        el.classList.add("active");
      }
      navLinks.classList.remove("open");
    });
  });

  // Countdown
  const eventDate = new Date("2026-05-25T15:00:00-03:00").getTime();
  function updateCountdown() {
    const now = Date.now();
    let diff = eventDate - now;
    if (diff < 0) diff = 0;
    const d = Math.floor(diff / (1000 * 60 * 60 * 24));
    const h = Math.floor((diff / (1000 * 60 * 60)) % 24);
    const m = Math.floor((diff / (1000 * 60)) % 60);
    const s = Math.floor((diff / 1000) % 60);
    document.getElementById("cd-days").textContent = String(d).padStart(2, "0");
    document.getElementById("cd-hours").textContent = String(h).padStart(2, "0");
    document.getElementById("cd-min").textContent = String(m).padStart(2, "0");
    document.getElementById("cd-sec").textContent = String(s).padStart(2, "0");
  }
  updateCountdown();
  setInterval(updateCountdown, 1000);

  // RSVP form
  const rsvpForm = document.getElementById("rsvpForm");
  const formMsg = document.getElementById("formMsg");
  aplicarMascaraTelefone(document.getElementById("telefone"));

  rsvpForm.addEventListener("submit", async function (e) {
    e.preventDefault();
    const { error } = await supabase.from("confirmacoes_presenca").insert({
      nome: document.getElementById("nome").value.trim(),
      telefone: document.getElementById("telefone").value.trim(),
      email: document.getElementById("email").value.trim(),
      presenca: document.getElementById("presenca").value,
      mensagem: document.getElementById("mensagem").value.trim() || null,
    });

    if (error) {
      formMsg.textContent =
        "Não foi possível confirmar agora. Tente novamente em instantes.";
      formMsg.classList.add("show");
      setTimeout(() => formMsg.classList.remove("show"), 6000);
      return;
    }

    formMsg.textContent =
      "Presença confirmada com carinho! Estamos animados para celebrar com você. ♡";
    formMsg.classList.add("show");
    rsvpForm.reset();
    setTimeout(() => formMsg.classList.remove("show"), 6000);
  });

  // Gift list — carregada do Supabase (tabela `presentes`)
  let gifts = [];

  async function loadGifts() {
    const { data, error } = await supabase
      .from("presentes")
      .select(
        "id, nome, preco, categoria, imagem_url, icone, quantidade_maxima, quantidade_reservada, apenas_pix",
      );

    if (error) {
      console.error("Erro ao carregar presentes:", error);
      gifts = [];
      return;
    }

    gifts = data.map((p) => ({
      id: p.id,
      name: p.nome,
      price: p.preco,
      cat: p.categoria,
      img: p.imagem_url,
      icon: p.icone,
      reserved: p.quantidade_reservada >= p.quantidade_maxima,
      qty: p.quantidade_reservada,
      max: p.quantidade_maxima,
      pixOnly: p.apenas_pix,
    }));
  }

  const grid = document.getElementById("giftsGrid");
  const filtersEl = document.getElementById("filters");
  let activeCat = "todos";

  function fmtPrice(v) {
    return "R$ " + v.toFixed(2).replace(".", ",");
  }

  function renderGifts() {
    grid.innerHTML = "";
    const filtered = gifts.filter(
      (g) => activeCat === "todos" || g.cat === activeCat,
    );
    filtered.forEach((g) => {
      const card = document.createElement("div");
      card.className = "gift-card";
      const pct = Math.min(100, Math.round((g.qty / g.max) * 100));
      const media = g.icon
        ? `<div class="img-wrap icon-wrap"><span class="gift-icon">${g.icon}</span></div>`
        : `<div class="img-wrap"><img src="${g.img}" alt="${g.name}" loading="lazy"></div>`;
      const actions = g.pixOnly
        ? `<div class="gift-actions">
             <button class="btn btn-primary" data-action="pix" data-id="${g.id}">Contribuir via PIX</button>
           </div>`
        : `<div class="gift-actions">
             <button class="btn btn-primary" data-action="comprar" data-id="${g.id}">Comprar</button>
             <button class="btn btn-outline" data-action="pix" data-id="${g.id}">PIX</button>
           </div>`;
      card.innerHTML = `
        ${media}
        <div class="info">
          <h4>${g.name}</h4>
          <div class="price">${fmtPrice(g.price)}</div>
          <div class="progress-row">
            <div class="progress"><div class="bar" style="width:${pct}%"></div></div>
            <span class="count">${g.qty}/${g.max}</span>
          </div>
          ${g.reserved ? `<div class="reserved-badge">✓ Já reservado</div>` : actions}
        </div>`;
      grid.appendChild(card);
    });

    // Card de contribuição livre — aparece em "Todos" e "Outros"
    if (activeCat === "todos" || activeCat === "outros") {
      const contribCard = document.createElement("div");
      contribCard.className = "gift-card contribute";
      contribCard.innerHTML = `
        <div class="info">
          <div class="heart-ico">♡</div>
          <h4>Contribuição em Dinheiro</h4>
          <p style="font-size:13px;color:var(--text-light);">(qualquer valor)<br>Faça um PIX com amor!</p>
          <button class="btn btn-primary" data-action="pix-livre">PIX</button>
        </div>`;
      grid.appendChild(contribCard);
    }

    grid.querySelectorAll("[data-action]").forEach((btn) => {
      btn.addEventListener("click", () =>
        handleGiftAction(btn.dataset.action, btn.dataset.id),
      );
    });
  }

  filtersEl.addEventListener("click", (e) => {
    const btn = e.target.closest(".filter-btn");
    if (!btn) return;
    filtersEl
      .querySelectorAll(".filter-btn")
      .forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    activeCat = btn.dataset.cat;
    renderGifts();
  });

  loadGifts().then(renderGifts);

  // Modal
  const overlay = document.getElementById("modalOverlay");
  const modalTitle = document.getElementById("modalTitle");
  const modalText = document.getElementById("modalText");
  const modalImg = document.getElementById("modalImg");
  const modalAction = document.getElementById("modalAction");
  const modalClose = document.getElementById("modalClose");
  const modalForm = document.getElementById("modalForm");
  const presenteNome = document.getElementById("presenteNome");
  const presenteTelefone = document.getElementById("presenteTelefone");
  aplicarMascaraTelefone(presenteTelefone);

  function handleGiftAction(action, id) {
    const gift = gifts.find((g) => g.id == id);
    modalForm.classList.remove("show");
    presenteNome.value = "";
    presenteTelefone.value = "";

    if (action === "pix-livre") {
      modalTitle.textContent = "Contribuição via PIX";
      modalImg.style.display = "none";
      modalText.textContent =
        "Use a chave PIX abaixo para fazer sua contribuição com qualquer valor. Toda ajuda é uma bênção para o nosso novo lar! Chave: cha-de-casa-nova@email.com";
      modalAction.textContent = "Copiar chave PIX";
      modalAction.onclick = () => {
        navigator.clipboard?.writeText("cha-de-casa-nova@email.com");
        modalAction.textContent = "Chave copiada! ♡";
      };
    } else if (action === "pix") {
      modalTitle.textContent = `PIX para "${gift.name}"`;
      modalImg.style.display = "block";
      modalImg.src = gift.img;
      modalText.textContent = `Contribua com o valor de ${fmtPrice(gift.price)} via PIX. Chave: cha-de-casa-nova@email.com`;
      modalAction.textContent = "Copiar chave PIX";
      modalAction.onclick = () => {
        navigator.clipboard?.writeText("cha-de-casa-nova@email.com");
        modalAction.textContent = "Chave copiada! ♡";
      };
    } else {
      modalTitle.textContent = `Comprar "${gift.name}"`;
      modalImg.style.display = "block";
      modalImg.src = gift.img;
      modalText.textContent = `Fique à vontade para escolher a loja de sua preferência e comprar este item. Para que ninguém mais escolha o mesmo presente, pedimos que confirme abaixo. É rapidinho!`;
      modalForm.classList.add("show");
      modalAction.textContent = "Confirmar que vou presentear";
      modalAction.onclick = async () => {
        const nome = presenteNome.value.trim();
        const telefone = presenteTelefone.value.trim();
        if (!nome) { presenteNome.focus(); return; }
        if (!telefone) { presenteTelefone.focus(); return; }
        if (!TELEFONE_REGEX.test(telefone)) {
          presenteTelefone.focus();
          presenteTelefone.reportValidity();
          return;
        }

        modalAction.disabled = true;
        const { error } = await supabase.from("reservas_presentes").insert({
          presente_id: gift.id,
          nome,
          telefone,
        });
        modalAction.disabled = false;

        if (error) {
          await loadGifts();
          renderGifts();
          modalForm.classList.remove("show");
          modalImg.style.display = "none";
          modalTitle.textContent = "Ops!";
          modalText.textContent =
            "Esse presente já foi escolhido por outra pessoa. Que tal escolher outro item da lista?";
          modalAction.textContent = "Fechar";
          modalAction.onclick = () => overlay.classList.remove("show");
          return;
        }

        await loadGifts();
        renderGifts();
        modalForm.classList.remove("show");
        modalImg.style.display = "none";
        modalTitle.textContent = "Combinado! ♡";
        modalText.textContent = `Muito obrigado, ${nome}! Anotamos aqui que você vai presentear com "${gift.name}". Mal podemos esperar para celebrar com você.`;
        modalAction.textContent = "Fechar";
        modalAction.onclick = () => overlay.classList.remove("show");
      };
    }
    overlay.classList.add("show");
  }

  modalClose.addEventListener("click", () =>
    overlay.classList.remove("show"),
  );
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) overlay.classList.remove("show");
  });
})();
