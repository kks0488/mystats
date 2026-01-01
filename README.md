<p align="center">
  <img src="public/logo.svg" width="80" alt="MyStats Logo" />
</p>

<h1 align="center">🧠 MyStats</h1>

<p align="center">
  <strong>AI-Powered Self-Discovery & Career Strategy Engine</strong>
</p>

<p align="center">
  <em>Transform your scattered thoughts into actionable intelligence.<br/>Powered by Google Gemini, built for thinkers who refuse to settle.</em>
</p>

<p align="center">
  <a href="#features"><strong>Features</strong></a> ·
  <a href="#demo"><strong>Demo</strong></a> ·
  <a href="#quick-start"><strong>Quick Start</strong></a> ·
  <a href="#tech-stack"><strong>Tech Stack</strong></a> ·
  <a href="#contributing"><strong>Contributing</strong></a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/React-19-61DAFB?style=flat-square&logo=react" alt="React 19" />
  <img src="https://img.shields.io/badge/TypeScript-5.9-3178C6?style=flat-square&logo=typescript" alt="TypeScript" />
  <img src="https://img.shields.io/badge/Gemini%20AI-Powered-4285F4?style=flat-square&logo=google" alt="Gemini AI" />
  <img src="https://img.shields.io/badge/Vite-7-646CFF?style=flat-square&logo=vite" alt="Vite" />
  <img src="https://img.shields.io/badge/License-MIT-green?style=flat-square" alt="MIT License" />
</p>

<p align="center">
  <a href="https://github.com/kks0488/mystats/stargazers">
    <img src="https://img.shields.io/github/stars/kks0488/mystats?style=social" alt="GitHub Stars" />
  </a>
  <a href="https://github.com/kks0488/mystats/network/members">
    <img src="https://img.shields.io/github/forks/kks0488/mystats?style=social" alt="GitHub Forks" />
  </a>
</p>

---

## ✨ Why MyStats?

> **"Most productivity apps ask what you did. MyStats decodes who you are."**

We don't just track your activities — we **uncover your hidden patterns**, identify your **psychological archetypes**, and generate **personalized strategies** that leverage your unique strengths.

```
📓 Journal Entry → 🧠 AI Analysis → 👤 Deep Profile → ⚡ Custom Strategy
```

---

## 🎯 Features

### 🧬 **Neural Memory Journal**
Write freely. Our AI doesn't just save — it **decodes**. Every entry is analyzed for:
- Skills (Hard & Soft)
- Personality Traits & Patterns
- Hidden Archetypes (e.g., "The Architect of Systems" 시스템의 설계자)
- Critical Questions you should be asking yourself

### 🪞 **Deep Intelligence Profile**
Your cumulative psychological map — built from every journal entry. See:
- Existential Archetypes
- Hidden Behavioral Patterns  
- Critical Life Questions
- Skill & Interest Radar

### ⚡ **Neural Strategy Engine**
Describe a problem. Get a **ruthlessly personalized solution**:
- Unfair Advantage Analysis (What makes YOU uniquely positioned?)
- Mental Model Application (First Principles, 80/20, Inversion...)
- Concrete Action Plans
- Personal Blind Spot Warnings

---

## 🎬 Demo

<p align="center">
  <img src="docs/demo.gif" width="800" alt="MyStats Demo" />
</p>

> **🎮 Try it now:** [https://mystats-eta.vercel.app](https://mystats-eta.vercel.app)

---

## 🚀 Quick Start

### Prerequisites
- Node.js 18+
- [Google AI Studio API Key](https://aistudio.google.com/app/apikey) (Free)

### Installation

```bash
# Clone the repository
git clone https://github.com/kks0488/mystats.git
cd mystats

# Install dependencies
npm install

# Start dev server
npm run dev
```

### Setup
1. Open the app in your browser (`http://localhost:5173`)
2. Go to Settings (gear icon)
3. Enter your Gemini API Key
4. Start journaling!

---

## 🛠 Tech Stack

| Category | Technology |
|----------|------------|
| **Framework** | React 19 + Vite 7 |
| **Language** | TypeScript 5.9 (Strict Mode) |
| **Styling** | Tailwind CSS + shadcn/ui |
| **Animation** | Framer Motion |
| **AI Engine** | Google Gemini (gemini-3-flash-preview) |
| **Database** | IndexedDB (via idb) |
| **Validation** | Zod |
| **Icons** | Lucide React |

---

## 📂 Project Structure

```
mystats/
├── src/
│   ├── components/
│   │   ├── layout/      # Shell, Navigation
│   │   └── ui/          # shadcn/ui components
│   ├── db/              # IndexedDB operations
│   ├── hooks/           # Custom React hooks
│   ├── lib/             # Gemini AI, utilities
│   ├── pages/           # Home, Journal, Profile, Strategy
│   └── App.tsx
├── public/
└── package.json
```

---

## 🌍 Internationalization

MyStats supports:
- 🇺🇸 **English**
- 🇰🇷 **한국어 (Korean)**

Toggle language in the header.

---

## 🔒 Privacy First

- **100% Local Storage**: All data stored in IndexedDB on your device
- **No Server**: No backend, no tracking, no data collection
- **Your API Key**: Direct connection to Google AI (we never see it)
- **Export Anytime**: Download your data as JSON

---

## 🤝 Contributing

We love contributions! Please see our [Contributing Guide](CONTRIBUTING.md).

```bash
# Fork & Clone
git clone https://github.com/kks0488/mystats.git

# Create feature branch
git checkout -b feature/amazing-feature

# Commit changes
git commit -m "feat: add amazing feature"

# Push & create PR
git push origin feature/amazing-feature
```

---

## 📜 License

MIT License - see [LICENSE](LICENSE) for details.

---

## 🙏 Acknowledgements

- [Google Gemini AI](https://ai.google.dev/) for the intelligence engine
- [shadcn/ui](https://ui.shadcn.com/) for the beautiful components
- [Framer Motion](https://www.framer.com/motion/) for smooth animations
- All the open-source contributors who made this possible

---

<p align="center">
  <strong>⭐ If this helped you, give it a star!</strong>
</p>

<p align="center">
  <sub>Built with 🧠 + ☕ by <a href="https://github.com/kks0488">@kks0488</a></sub>
</p>
