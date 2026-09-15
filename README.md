# 🚀 Missão Família

App PWA (HTML/CSS/JS puro, sem build) de gameficação para tarefas domésticas:
responsáveis criam missões, crianças cumprem e ganham pontos, pontos trocam
por prêmios. Funciona em **dois aparelhos** (responsável + criança, cada um
no seu celular) ou em **um aparelho só** (revezado entre a família).

## 1. Configurar o banco de dados (Supabase)

1. Abra o projeto em https://supabase.com/dashboard (o projeto já configurado
   no app é `mnkpfnofxbotmsmhcody`).
2. Vá em **SQL Editor → New query**, cole o conteúdo de `supabase-schema.sql`
   e clique em **Run**. Isso cria as tabelas `families`, `profiles`, `tasks`,
   `task_logs`, `rewards`, `redemptions` e as políticas de acesso (RLS).
3. Em **Authentication → Providers**, deixe **Email** ativado (é usado só
   para o login do responsável).
4. (Opcional, recomendado para testar rápido) Em **Authentication → Settings**
   desative "Confirm email", assim o cadastro do responsável já entra direto
   sem precisar clicar em link de confirmação.

A chave usada no app (`app.js`) é a chave **publishable** (pública), então não
há segredo exposto. As crianças **não** fazem login por e-mail — elas entram
pelo código da família + uma senha de 4 números cadastrada pelo responsável.

> ⚠️ Nota de segurança: para simplificar o fluxo sem login de e-mail para
> crianças, as políticas RLS deste MVP são permissivas dentro do projeto
> Supabase. Isso é adequado para uso familiar/privado. Para publicar como
> produto para várias famílias desconhecidas, o recomendado é migrar as
> crianças para "Supabase Auth anônimo" e restringir as políticas por
> `family_id`, além de mover a validação do PIN para uma Edge Function.
> Esse caminho de evolução está documentado nos comentários do `.sql`.

## 2. Rodar localmente

Não precisa de build. Basta servir os arquivos estáticos:

```bash
cd family-quest
python3 -m http.server 8080
# abra http://localhost:8080 no navegador (ou no celular, na mesma rede,
# usando o IP do computador)
```

PWA (ícone na tela inicial, tela cheia, funciona com conexão instável) exige
HTTPS em produção — funciona sem HTTPS apenas em `localhost` para testes.

## 3. Publicar (ex: Vercel, Netlify, GitHub Pages, Cloudflare Pages)

É uma pasta 100% estática — é só subir os arquivos (`index.html`,
`styles.css`, `app.js`, `manifest.json`, `sw.js`, `icons/`) em qualquer
serviço de hospedagem estática com HTTPS. Não precisa de servidor próprio.

## 4. Como usar

### Primeiro acesso do responsável
1. Escolha o modo de uso (dois aparelhos ou um aparelho só).
2. Crie a conta com e-mail e senha.
3. Cadastre uma **senha de aprovação de 4 números** — ela será pedida sempre
   que o responsável for aprovar uma missão, reprovar, marcar uma entrega ou
   (no modo "um aparelho só") voltar do modo criança para o modo responsável.
   Isso evita que a criança aprove as próprias missões escondido.
4. Na aba **Família**, copie o código de 6 letras (ou mostre o QR code) e
   cadastre cada filho(a) com nome, avatar e uma senha de 4 números própria
   da criança.

### Modo dois aparelhos
- No celular da criança: escolha "Dois aparelhos" → "Sou a criança" → digite
  o código da família → toque no seu avatar → digite sua senha de 4 números.
- O aparelho "lembra" a criança automaticamente nas próximas vezes.

### Modo um aparelho só
- O responsável fica sempre logado no app.
- Na aba **Família**, tocar no nome de uma criança abre o painel dela
  (modo criança). Para voltar ao responsável, o botão de saída no painel da
  criança pede a senha de aprovação.

### Fluxo de uma missão
1. Responsável cria a missão (título, ícone, pontos, para qual criança).
2. Criança vê a missão no painel dela e toca para marcar como feita → vai
   para "esperando aprovação".
3. Responsável vê em **Aprovações**, toca em ✔️ ou ✋, confirma com a senha
   de 4 números → se aprovado, os pontos caem na conta da criança na hora
   (com efeito sonoro e, se estiver no mesmo aparelho/tempo real, confete).

### Prêmios
1. Responsável cadastra prêmios na aba **Loja** (nome, ícone, custo em pontos).
2. Criança troca pontos por um prêmio na loja dela → confete + som.
3. O pedido aparece para o responsável em **Entregas**; ao entregar o prêmio
   fisicamente, o responsável confirma com a senha e marca como entregue.

### Sequência (streak) e níveis
- 🌱 **Início** (0–2 dias seguidos): multiplicador de pontos x1,00
- 🔥 **Dedicado(a)** (3–4 dias seguidos): multiplicador x1,05
- ⭐ **Lendário(a)** (5+ dias seguidos, nível máximo): multiplicador x1,10

Um "dia válido" conta quando **todas** as missões daquele dia foram
aprovadas. Sábados e domingos são "de folga": não quebram a sequência se a
criança não cumprir tudo, e também não fazem a sequência avançar — mas as
missões feitas no fim de semana continuam dando pontos normalmente (com o
multiplicador do nível atual).

Se um dia de semana (segunda a sexta) passar sem todas as missões aprovadas:
- Se estava no nível **Lendário(a)**, cai para **Dedicado(a)** (não zera tudo).
- Se estava em **Dedicado(a)** ou **Início**, volta para **Início** (0 dias).

Essa checagem roda automaticamente sempre que o responsável ou a criança
abre o app.

## 5. Estrutura de arquivos

```
family-quest/
├── index.html          # todas as telas do app
├── styles.css           # visual (tema "céu noturno" + roxo/rosa/dourado)
├── app.js                # toda a lógica (Supabase, streak, sons, confete)
├── manifest.json         # PWA
├── sw.js                 # service worker (cache do "shell" do app)
├── supabase-schema.sql   # tabelas + políticas do banco
└── icons/                 # ícones do PWA (gerados: estrela em fundo gradiente)
```

## 6. Limitações conhecidas do MVP (próximos passos sugeridos)

- Tarefas são sempre diárias (não há ainda "só terça e quinta", por exemplo).
- PIN das crianças e do responsável ficam em texto simples no banco — ok
  para uso familiar privado, mas trocar por hash antes de publicar amplamente.
- Sem recuperação de senha por PIN esquecido — o responsável pode redefinir
  editando a criança (funcionalidade de "editar criança" pode ser adicionada
  facilmente reaproveitando o sheet de cadastro).
- Sons são gerados por Web Audio API (bipes/acordes), sem arquivos de áudio
  externos — leve e funciona offline, mas é mais simples que efeitos gravados.
