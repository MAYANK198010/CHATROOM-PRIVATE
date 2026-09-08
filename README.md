# ChatRoom — Ephemeral, Privacy-First Chat

A temporary, privacy-first communication platform engineered with zero accounts, disposable identities, role-based moderation (Owner, Moderator, Member), join approvals, rate limiting, and room auto-expiration.

## Features

- **Zero Accounts**: No phone numbers, emails, or personal tracking.
- **Role-Based Access Control**:
  - **Owner**: Full room management, slow mode configuration, join authorization, role assignment.
  - **Moderator**: Member kicks, bans, room lockdown, soft-deletion of messages.
  - **Member**: Disposable messaging, emoji reactions, typing indicators.
- **Three Join Modes**: Open, Password-Protected, and Host Approval Queue.
- **Cross-Tab Synchronization**: Real-time message streaming and state syncing across tabs and browser windows.
- **Interactive Security Suite**: In-app test suite to verify XSS sanitization, flood rate-limiting, unauthorized privilege escalations, and expired room rejection.

---

## Getting Started

### Prerequisites
- Node.js 18.x or higher
- npm 9.x or higher (or pnpm / bun / yarn)

### 1. Installation
Clone the repository and install all required dependencies:

```bash
git clone https://github.com/<your-username>/<your-repo-name>.git
cd <your-repo-name>
npm install
```

### 2. Development Mode
Start the local development server:

```bash
npm run dev
```

Open your browser and navigate to `http://localhost:3000`.

### 3. Production Build
To create a production-ready optimized build:

```bash
npm run build
```

The compiled static assets will be output to the `dist/` directory.

### 4. Preview Production Build
Preview the production build locally:

```bash
npm run preview
```

---

## Deploying to Hosting Platforms

### Vercel
1. Push your repository to GitHub.
2. Go to [Vercel](https://vercel.com) and import the repository.
3. Framework Preset: **Vite** (detected automatically).
4. Build Command: `npm run build`
5. Output Directory: `dist`
6. Click **Deploy**.

### Netlify
1. Connect your GitHub repository to [Netlify](https://netlify.com).
2. Build command: `npm run build`
3. Publish directory: `dist`
4. Click **Deploy Site**.

### Cloudflare Pages
1. In Cloudflare Dashboard, navigate to **Workers & Pages** > **Create application** > **Pages** > **Connect to Git**.
2. Build command: `npm run build`
3. Build output directory: `dist`
4. Deploy!

### GitHub Pages
1. Go to your GitHub repository: **Settings** > **Pages**.
2. Under **Build and deployment** > **Source**, select **GitHub Actions**.
3. Push your code to the `main` branch. The automated workflow `.github/workflows/deploy.yml` will automatically build the Vite app and deploy the compiled `dist` directory.

---

## Project Scripts

| Script | Description |
|---|---|
| `npm run dev` | Runs Vite dev server at port 3000 |
| `npm run build` | Compiles TypeScript and builds production bundles into `dist/` |
| `npm run preview` | Runs a local web server to test the production build |
| `npm run lint` | Runs TypeScript type checking (`tsc --noEmit`) |
| `npm run clean` | Cleans dist and build artifacts |

---

## License
Apache-2.0
