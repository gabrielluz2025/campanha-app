# Configuração da Nuvem (Supabase) — passo a passo

O sistema agora pode sincronizar todos os dados na nuvem, com login por e-mail/senha.
Cada conta tem seus próprios dados, acessíveis de qualquer dispositivo.

> Enquanto você **não** configurar o Supabase, o sistema continua funcionando
> normalmente, 100% local (sem login), como antes.

---

## 1. Criar o projeto no Supabase (grátis)

1. Acesse https://supabase.com e crie uma conta.
2. Clique em **New project**, escolha um nome e uma senha de banco, e crie.
3. Aguarde alguns minutos até o projeto ficar pronto.

## 2. Pegar as credenciais

No painel do projeto, vá em **Project Settings → API** e copie:

- **Project URL** (ex.: `https://abcd1234.supabase.co`)
- **anon public** key (uma chave longa)

## 3. Configurar o app

1. Na pasta `campanha-app`, copie o arquivo `.env.example` para um novo arquivo chamado `.env`.
2. Preencha:

   ```
   VITE_SUPABASE_URL=https://SEU-PROJETO.supabase.co
   VITE_SUPABASE_ANON_KEY=sua-chave-anon-publica
   ```

3. **Reinicie o servidor** (`npm run dev`) — variáveis `.env` só são lidas ao iniciar.

## 4. Criar a tabela de dados

No painel do Supabase, vá em **SQL Editor** e rode este script:

```sql
-- Tabela de estado do app (um registro por chave de dados, por usuário)
create table if not exists public.app_state (
  user_id    uuid not null references auth.users(id) on delete cascade,
  key        text not null,
  value      text,
  updated_at timestamptz not null default now(),
  primary key (user_id, key)
);

-- Segurança: cada usuário só enxerga e altera os próprios dados
alter table public.app_state enable row level security;

create policy "usuario_le_proprios_dados"
  on public.app_state for select
  using (auth.uid() = user_id);

create policy "usuario_insere_proprios_dados"
  on public.app_state for insert
  with check (auth.uid() = user_id);

create policy "usuario_atualiza_proprios_dados"
  on public.app_state for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "usuario_apaga_proprios_dados"
  on public.app_state for delete
  using (auth.uid() = user_id);
```

## 5. (Opcional) Desativar confirmação de e-mail

Para entrar imediatamente após criar a conta (sem precisar confirmar e-mail):

- **Authentication → Providers → Email** → desligue **Confirm email**.

> Em produção, o recomendado é manter a confirmação de e-mail ativada.

---

## Pronto!

1. Abra o sistema — agora aparece a tela de **login**.
2. Crie sua conta e entre.
3. Na primeira vez, os dados que já estavam neste navegador são enviados para a nuvem.
4. A partir daí, tudo é sincronizado automaticamente. Em outro dispositivo, basta
   entrar com a mesma conta.

O botão **Sair** fica no rodapé do menu lateral (junto ao perfil).
