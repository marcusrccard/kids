# 🚀 Missão Família — GitHub Pages

PWA estático (HTML/CSS/JS puro) para gamificação de tarefas domésticas com Supabase.

## Publicar no GitHub Pages

1. Crie um repositório no GitHub (por exemplo, `missao-familia`).
2. Envie **todos os arquivos desta pasta**, mantendo `index.html` na raiz.
3. No GitHub, abra **Settings → Pages**.
4. Em **Build and deployment**, selecione:
   - **Source:** Deploy from a branch
   - **Branch:** `main`
   - **Folder:** `/ (root)`
5. Salve e aguarde a publicação.
6. O endereço será semelhante a `https://SEU-USUARIO.github.io/missao-familia/`.

O arquivo `.nojekyll` já está incluído para que o GitHub Pages publique os arquivos estáticos diretamente.

## Supabase

O frontend já contém a URL e a chave **publishable** do projeto Supabase configurado no `app.js`.

Execute `supabase-schema.sql` no **SQL Editor** do Supabase antes do primeiro uso.

> Importante: a chave publishable/anon pode aparecer no frontend. **Nunca** coloque uma `service_role`/chave secreta no `app.js`.

> Este ZIP mantém as políticas permissivas do MVP original. Antes de disponibilizar para famílias desconhecidas, corrija o RLS e a validação dos PINs no backend.

## PWA / ícones

A estrutura foi preparada para GitHub Pages:

```text
.
├── index.html
├── app.js
├── styles.css
├── manifest.json
├── sw.js
├── .nojekyll
├── icons/
│   ├── icon-192.png
│   ├── icon-512.png
│   ├── icon-maskable-192.png
│   └── icon-maskable-512.png
└── supabase-schema.sql
```

Os caminhos do manifest e do service worker são relativos, portanto funcionam também quando o site é publicado em um subcaminho como `/missao-familia/`.

## Rodar localmente

```bash
python3 -m http.server 8080
```

Abra `http://localhost:8080`.

## Estrutura funcional

- Responsável e criança
- Modo de dois aparelhos ou aparelho único
- Missões/tarefas
- Aprovação
- Pontos e níveis
- Streak
- Loja e resgate de prêmios
- Supabase Realtime
- PWA com cache do shell
