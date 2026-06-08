// Edge Function "notify"
//
// Recebe o payload de um Database Webhook disparado em INSERT nas tabelas
// `confirmacoes_presenca` e `reservas_presentes`, e envia um e-mail ao
// organizador via Resend (https://resend.com).
//
// Configuração necessária (secrets da function, nunca no front-end):
//   RESEND_API_KEY     -- chave da API da Resend
//   NOTIFY_EMAIL_TO    -- e-mail do organizador que vai receber os avisos
//   NOTIFY_EMAIL_FROM  -- remetente verificado na Resend (ex. avisos@seudominio.com)

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY")!;
const NOTIFY_EMAIL_TO = Deno.env.get("NOTIFY_EMAIL_TO")!;
const NOTIFY_EMAIL_FROM = Deno.env.get("NOTIFY_EMAIL_FROM")!;

interface WebhookPayload {
  type: "INSERT";
  table: "confirmacoes_presenca" | "reservas_presentes";
  record: Record<string, unknown>;
}

function montarEmail(payload: WebhookPayload): { subject: string; html: string } {
  const { table, record } = payload;

  if (table === "confirmacoes_presenca") {
    return {
      subject: `Nova confirmação de presença: ${record.nome}`,
      html: `
        <p><strong>${record.nome}</strong> respondeu ao RSVP.</p>
        <ul>
          <li>Telefone: ${record.telefone}</li>
          <li>E-mail: ${record.email}</li>
          <li>Vai comparecer: ${record.presenca === "sim" ? "Sim" : "Não"}</li>
          ${record.mensagem ? `<li>Mensagem: ${record.mensagem}</li>` : ""}
        </ul>
      `,
    };
  }

  return {
    subject: `Novo presente reservado por ${record.nome}`,
    html: `
      <p><strong>${record.nome}</strong> confirmou que vai presentear.</p>
      <ul>
        <li>Telefone: ${record.telefone}</li>
        <li>ID do presente: ${record.presente_id}</li>
      </ul>
    `,
  };
}

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const payload: WebhookPayload = await req.json();
  const { subject, html } = montarEmail(payload);

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: NOTIFY_EMAIL_FROM,
      to: NOTIFY_EMAIL_TO,
      subject,
      html,
    }),
  });

  if (!res.ok) {
    const erro = await res.text();
    return new Response(`Falha ao enviar e-mail: ${erro}`, { status: 502 });
  }

  return new Response("ok", { status: 200 });
});
