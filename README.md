# Yokai 👻

> **Human Intent Compiler** — Bridging human intent to coding agents via a verifiable, deterministic Specification.

Yokai is not a coding assistant or a chatbot. It is a strict **compiler** that takes your raw, ambiguous intent and refines it through an interactive Q&A process. The final output is an **Executable Specification**—a formal contract that can be executed by coding agents (Codex, Claude, Gemini) and verified deterministically.

## Architecture & Philosophy

> **LLM proposes. Yokai validates. User decides. Specification records. Agent executes.**

1. **Specification as Source of Truth:** The `specification.yaml` is the canonical record. It belongs in version control alongside your code.
2. **Deterministic State Machine:** Yokai enforces strict lifecycle rules. Requirements move from `ASSUMED` to `CONFIRMED`. Specifications move from `DRAFT` to `ACCEPTED`. LLMs cannot arbitrarily modify the state without passing validation.
3. **Pluggable LLMs:** LLMs (Gemini, OpenAI) are merely "providers" that propose JSON updates. If an LLM hallucinates, Yokai rejects the proposal and rolls back the state.

## Installation

Requires Node.js 18+.

```bash
# Clone the repository
git clone https://github.com/DongNQ247/yokai.git
cd yokai

# Install dependencies and build
npm install
npm run build

# Link globally for the `yokai` CLI command
npm link
```

## Getting Started

### 1. Initialize Yokai
Navigate to any project directory and initialize Yokai. This will set up the `.yokai/` folder, configure your preferred Model Provider (OpenAI or Gemini), and update your `.gitignore`.

```bash
cd my-project
yokai init
```

### 2. State Your Intent
Pass your raw, ambiguous idea to Yokai. It will inspect your codebase to detect the tech stack, call the LLM, and generate a draft specification with assumed requirements and blocking questions.

```bash
yokai "Add user authentication with email and password"
```

### 3. Refine (Interactive Q&A)
Yokai will ask you high-impact questions to clarify ambiguities. Your answers are sent back to the LLM to modify the specification and turn `ASSUMED` requirements into `CONFIRMED` requirements.

```bash
yokai refine
```
*(Press `Ctrl+C` at any time to pause. Yokai saves all state locally).*

### 4. Review the Specification
View the current state of your specification, including the full history of decisions and requirements.

```bash
yokai spec --verbose
yokai spec --yaml
```

### 5. Approve
Once all `[BLOCKING]` questions are resolved, you can accept the specification. It is now ready to be handed off to an Execution Agent.

```bash
yokai approve
```

## Supported Providers
Yokai currently supports the following model providers for Intent Analysis:
- **OpenAI** (`gpt-4o`, `gpt-4o-mini`, `o3-mini`, `gpt-4.1`)
- **Gemini** (`gemini-3.5-flash`, `gemini-3.6-flash`, `gemini-3.1-pro`)
- **Mock** (Local deterministic testing provider)

## Future Roadmap
- **Phase 3:** Execution Providers (`yokai run`) — Hands the approved specification to a coding agent (e.g. Codex or Claude) to implement the code.
- **Phase 4:** Verification (`yokai verify`) — Deterministically checks the implementation against the Acceptance Criteria defined in the specification.

## License
MIT
