
<img width="1504" height="900" alt="Screenshot 2026-03-03 at 11 44 53 AM" src="https://github.com/user-attachments/assets/e728c88b-925f-4aa5-aba7-c625450a43a2" />


Here is the README file I created for your project:
code
Markdown
# Deterministic Architecture Builder

A high-fidelity system design tool that uses a strict 18-step intake protocol to produce auditable, deterministic architecture specifications. Built with React 19, TypeScript, and Google's Gemini Multimodal Live API for a hands-free, voice-driven experience.

## Features

- **Voice-to-Voice Interface**: Hands-free interaction using Gemini's Live API.
- **18-Step Protocol**: Rigorous intake process ensures no requirement is missed.
- **Deterministic Output**: Generates structured, auditable JSON architecture specifications.
- **Real-time Preview**: Visual feedback as you build your system design.
- **HubSpot Integration**: Seamlessly syncs project specs.

## Tech Stack

- **Frontend**: React 19, Vite, Tailwind CSS
- **Language**: TypeScript
- **AI**: Google GenAI SDK (Gemini Multimodal Live API)
- **State**: React Hooks + Local Storage persistence

## Getting Started

### Prerequisites

- Node.js (v20+)
- Google Gemini API Key

### Installation

1. Clone the repository.
2. Install dependencies:
   ```bash
   npm install
Create a .env file (or set environment variables) with your API key:
code
Env
GEMINI_API_KEY=your_key_here
Start the development server:
code
Bash
npm run dev
Usage
Open the application in your browser.
Grant microphone permissions when prompted.
Speak naturally to the assistant to begin the architecture intake process.
The assistant will guide you through the 18 steps, from high-level goals to specific failure modes.
License
MIT
code
Code
Checkpoint
