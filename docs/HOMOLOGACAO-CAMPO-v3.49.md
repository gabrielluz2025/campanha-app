# Homologação E2E — Visitas de Campo (`campovisitas`)

**Versão alvo:** 3.42.0 → **3.49.0**  
**Data do roteiro:** 2026  
**Módulo:** Visitas de Campo · Torre · Despacho

---

## Pré-requisitos

| Item | Detalhe |
|------|--------|
| Perfis | Admin **owner** (desktop): Despacho, Equipe hoje, mapa. Agente com rota do dia (mobile). |
| Dados | Membro com `whatsapp` ou `telefone` (WhatsApp). Igrejas com `lat/lng` para raio/OSRM. |
| DevTools | Network (Offline, bloqueio `osrm_route` / `api.php`). Application → Local Storage. |
| Versão UI | Sidebar **3.49.0** |

**Legenda de registro:** `[ ]` pendente · `[x]` OK · `[!]` NOK (descrever evidência)

---

## Suíte 1 — Despacho & gestão de rotas (Admin desktop)

- [ ] **Criar rota diária:** Despacho → membro → 3+ igrejas. Após ~280 ms, rota em `rotas_diarias` + mensagem “Rota atualizada.”
- [ ] **Drag & drop (v3.47):** `GripVertical` → card `opacity-40`, destino `border-t-2 border-indigo-500`, ordem 1, 2, 3…
- [ ] **Reordenação acessível:** Botões ↑ / ↓ (ChevronUp/Down) renumeram e persistem.
- [ ] **Exclusão:** “Excluir rota do dia” + confirm → removido localmente; id em `rotas_diarias_removidos`.
- [ ] **WhatsApp (v3.46):** “Enviar rota via WhatsApp” → `wa.me/55…?text=` (ou `wa.me/?text=` sem telefone); data, nome, lista, URL do app.

**Observações / NOK:**

---

## Suíte 2 — Agente mobile (Aba “Minhas hoje”)

- [ ] **Boot instantâneo (v3.43):** Cache `localStorage` renderiza sem bloqueio total (`loading && churches.length === 0`).
- [ ] **Navegação externa:** “Navegar até o local” → Google Maps `dir/?api=1&destination=LAT,LNG`.
- [ ] **Check-in otimista:** Foto + GPS → Confirmar → modal fecha na hora; parada Concluída; foto `dataURL` no feed; upload em background.
- [ ] **Fila retry (v3.44):** Offline no upload → item em `campo_foto_upload_queue` → online esvazia fila e URL remota.

**Observações / NOK:**

---

## Suíte 3 — Geocodificação & geofencing (200 m)

- [ ] **CEP/endereço (v3.45):** Igreja sem coords → CEP válido → `lat/lng` (ViaCEP/Nominatim).
- [ ] **Dentro do raio (≤ 200 m):** Check-in sem justificativa obrigatória.
- [ ] **Fora do raio (> 200 m):** Alerta + justificativa obrigatória para confirmar.
- [ ] **Igreja sem coords:** Sem bloqueio de raio (`distMetros` null).

**Observações / NOK:**

---

## Suíte 4 — Torre: mapa, OSRM, dashboard (Admin desktop)

- [ ] **Mapa global (v3.46.1):** ~600 pins, fluidez com `preferCanvas`.
- [ ] **Trajeto OSRM:** Linha sólida índigo na malha viária.
- [ ] **Fallback (v3.46.1):** Bloquear OSRM → `Polyline` tracejada `dashArray: 8, 6`.
- [ ] **fitBounds (v3.44):** Trocar membro A/B → zoom recentraliza.
- [ ] **KPIs (v3.46):** 4 cards + tabela agentes coerentes (com filtros, métricas seguem feed filtrado).
- [ ] **Smart polling pausável:** Equipe hoje + data hoje → com aba browser oculta, sem sync a cada 25 s.

**Observações / NOK:**

---

## Suíte 5 — Filtros v3.48 & alertas v3.49

- [ ] **Data histórica:** Badge “Exibindo histórico de DD/MM/AAAA”; polling 25 s **desligado**.
- [ ] **Status + setor:** “Fora do raio” + setor → KPIs/feed/mapa; pins filtrados `fillOpacity: 0.12`.
- [ ] **Destaque inconformidade (v3.49):** Feed `border-l-4 border-l-amber-500`, badge ⚠️, justificativa; tabela `AlertTriangle` + contagem.
- [ ] **Som tempo real (v3.49):** Torre hoje, som ativo; **clique prévio** nos filtros/volume; outro device check-in fora do raio → bi-beep ~25 s.
- [ ] **Banner (v3.49):** Toast topo-direita; fecha em 8 s ou X; só check-ins **novos** no diff.
- [ ] **Mute persistente:** `VolumeX` → reload → `campo_torre_som_ativo = 0`.

**Observações / NOK:**

---

## Checklist de release (ops)

- [ ] `npm run build` sem erro
- [ ] Deploy FTP raiz (`deploy-ftp-live-root.cjs`)
- [ ] Smoke: abrir app produção, versão 3.49.0, aba Equipe hoje carrega mapa (admin desktop)

**Responsável homologação:** _______________  
**Data conclusão:** _______________  
**Aprovado para produção:** Sim / Não
