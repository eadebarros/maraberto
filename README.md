# Mar Aberto — 20/11

Landing page com um busto 3D feito de pontos (WebGL/Three.js), céu estrelado e formulário de cadastro que grava numa planilha do Google.

## Rodar

```bash
npm install
cp .env.example .env   # preencha os dois links
npm run dev
```

## Variáveis (`.env`)

- `VITE_SHEETS_URL` — URL `/exec` do Web App do Apps Script (`google-apps-script/Code.gs`).
- `VITE_WHATSAPP_GROUP_URL` — link de convite do grupo do WhatsApp.

## Planilha

Na planilha: Extensões → Apps Script → cole `google-apps-script/Code.gs` → Implantar → App da Web (Executar como: Eu; Acesso: Qualquer pessoa).

## Nuvem de pontos

`public/points.bin` já está pronto. Para gerar de novo a partir de um `.glb`:

```bash
npm run bake
```

## Build

```bash
npm run build   # gera dist/ com index.html e termos.html
npm start       # serve dist/ em $PORT (padrão 3000)
```

## Deploy (Railway)

O Railway usa `railway.json`: build com `npm run build` e start com `npm start`.
Cadastre `VITE_SHEETS_URL` e `VITE_WHATSAPP_GROUP_URL` em **Variables** do serviço. Elas entram no build, então qualquer mudança exige um novo deploy.
