/**
 * Repository Inspector — builds context from the codebase to support
 * REPOSITORY_INFERENCE provenance in the Specification Engine.
 *
 * The inspector scans the project root for signals that the LLM can use
 * to infer existing tech stack, patterns, and constraints — so Yokai
 * avoids asking questions it can answer itself.
 *
 * Output is a structured context string passed to the ModelProvider.
 */
import fs from "fs";
import path from "path";

export interface RepoContext {
  /** One-line tech stack summary for use in prompts. */
  summary: string;
  /** Full structured context string passed to the ModelProvider. */
  full: string;
  /** Individual signals extracted from the repo. */
  signals: RepoSignal[];
}

export interface RepoSignal {
  type:
    | "language"
    | "framework"
    | "dependency"
    | "config_file"
    | "database"
    | "auth"
    | "testing"
    | "ci";
  value: string;
  source: string; // file path
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function readJsonFile(filePath: string): Record<string, unknown> | null {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf-8")) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function fileExists(root: string, ...segments: string[]): boolean {
  return fs.existsSync(path.join(root, ...segments));
}

// ---------------------------------------------------------------------------
// Signal extractors
// ---------------------------------------------------------------------------

function extractFromPackageJson(root: string, signals: RepoSignal[]): void {
  const filePath = path.join(root, "package.json");
  const pkg = readJsonFile(filePath);
  if (!pkg) return;

  const deps = {
    ...(pkg["dependencies"] as Record<string, unknown> | undefined ?? {}),
    ...(pkg["devDependencies"] as Record<string, unknown> | undefined ?? {}),
  };

  const FRAMEWORK_MAP: Record<string, string> = {
    next: "Next.js",
    "react": "React",
    "vue": "Vue.js",
    "nuxt": "Nuxt.js",
    "@angular/core": "Angular",
    "svelte": "Svelte",
    "express": "Express.js",
    "fastify": "Fastify",
    "hono": "Hono",
    "koa": "Koa",
    "nestjs": "NestJS",
    "@nestjs/core": "NestJS",
    "remix": "Remix",
    "gatsby": "Gatsby",
    "astro": "Astro",
  };

  const AUTH_MAP: Record<string, string> = {
    "next-auth": "NextAuth.js",
    "@auth/core": "Auth.js",
    "passport": "Passport.js",
    "supabase": "Supabase Auth",
    "@supabase/supabase-js": "Supabase",
    "@clerk/nextjs": "Clerk",
    "firebase": "Firebase Auth",
    "auth0": "Auth0",
  };

  const DB_MAP: Record<string, string> = {
    "prisma": "Prisma ORM",
    "@prisma/client": "Prisma ORM",
    "drizzle-orm": "Drizzle ORM",
    "typeorm": "TypeORM",
    "mongoose": "Mongoose (MongoDB)",
    "pg": "PostgreSQL (pg)",
    "mysql2": "MySQL",
    "better-sqlite3": "SQLite",
    "@supabase/supabase-js": "Supabase (Postgres)",
    "redis": "Redis",
    "ioredis": "Redis (ioredis)",
  };

  const PAYMENT_MAP: Record<string, string> = {
    "stripe": "Stripe",
    "@stripe/stripe-js": "Stripe",
    "paypal": "PayPal",
    "braintree": "Braintree",
  };

  const TEST_MAP: Record<string, string> = {
    "vitest": "Vitest",
    "jest": "Jest",
    "mocha": "Mocha",
    "@playwright/test": "Playwright",
    "cypress": "Cypress",
  };

  for (const [dep] of Object.entries(deps)) {
    const fw = FRAMEWORK_MAP[dep];
    if (fw) signals.push({ type: "framework", value: fw, source: "package.json" });

    const auth = AUTH_MAP[dep];
    if (auth) signals.push({ type: "auth", value: auth, source: "package.json" });

    const db = DB_MAP[dep];
    if (db) signals.push({ type: "database", value: db, source: "package.json" });

    const payment = PAYMENT_MAP[dep];
    if (payment) signals.push({ type: "dependency", value: `Payment: ${payment}`, source: "package.json" });

    const test = TEST_MAP[dep];
    if (test) signals.push({ type: "testing", value: test, source: "package.json" });
  }

  // Language detection from devDependencies
  if (deps["typescript"]) {
    signals.push({ type: "language", value: "TypeScript", source: "package.json" });
  }
}

function extractFromConfigFiles(root: string, signals: RepoSignal[]): void {
  const CONFIG_SIGNALS: Array<{ file: string; signal: RepoSignal }> = [
    { file: "tailwind.config.js", signal: { type: "framework", value: "Tailwind CSS", source: "tailwind.config.js" } },
    { file: "tailwind.config.ts", signal: { type: "framework", value: "Tailwind CSS", source: "tailwind.config.ts" } },
    { file: "prisma/schema.prisma", signal: { type: "database", value: "Prisma schema present", source: "prisma/schema.prisma" } },
    { file: "drizzle.config.ts", signal: { type: "database", value: "Drizzle ORM config", source: "drizzle.config.ts" } },
    { file: ".env", signal: { type: "config_file", value: ".env file present", source: ".env" } },
    { file: "docker-compose.yml", signal: { type: "config_file", value: "Docker Compose", source: "docker-compose.yml" } },
    { file: ".github/workflows", signal: { type: "ci", value: "GitHub Actions CI", source: ".github/workflows/" } },
    { file: "Dockerfile", signal: { type: "config_file", value: "Dockerfile", source: "Dockerfile" } },
    { file: "next.config.js", signal: { type: "framework", value: "Next.js config", source: "next.config.js" } },
    { file: "next.config.ts", signal: { type: "framework", value: "Next.js config", source: "next.config.ts" } },
    { file: "vite.config.ts", signal: { type: "framework", value: "Vite", source: "vite.config.ts" } },
    { file: "go.mod", signal: { type: "language", value: "Go", source: "go.mod" } },
    { file: "requirements.txt", signal: { type: "language", value: "Python", source: "requirements.txt" } },
    { file: "pyproject.toml", signal: { type: "language", value: "Python", source: "pyproject.toml" } },
    { file: "Cargo.toml", signal: { type: "language", value: "Rust", source: "Cargo.toml" } },
    { file: "pom.xml", signal: { type: "language", value: "Java (Maven)", source: "pom.xml" } },
  ];

  for (const { file, signal } of CONFIG_SIGNALS) {
    if (fileExists(root, file)) {
      signals.push(signal);
    }
  }
}

function extractEnvKeys(root: string, signals: RepoSignal[]): void {
  // Read .env.example or .env.local.example to infer integrations without leaking secrets
  const envFiles = [".env.example", ".env.local.example", ".env.sample"];
  for (const envFile of envFiles) {
    const filePath = path.join(root, envFile);
    if (!fs.existsSync(filePath)) continue;
    const content = fs.readFileSync(filePath, "utf-8");
    const keys = content.split("\n")
      .filter((l) => l.includes("="))
      .map((l) => l.split("=")[0]?.trim())
      .filter(Boolean);

    const AUTH_KEYS = ["NEXTAUTH", "AUTH_SECRET", "CLERK", "SUPABASE_ANON", "FIREBASE"];
    const PAYMENT_KEYS = ["STRIPE", "PAYPAL", "BRAINTREE"];
    const DB_KEYS = ["DATABASE_URL", "POSTGRES_URL", "MYSQL_URL", "MONGO_URI", "REDIS_URL"];

    for (const key of keys) {
      if (!key) continue;
      if (AUTH_KEYS.some((k) => key.includes(k))) {
        signals.push({ type: "auth", value: `Auth env: ${key}`, source: envFile });
      }
      if (PAYMENT_KEYS.some((k) => key.includes(k))) {
        signals.push({ type: "dependency", value: `Payment env: ${key}`, source: envFile });
      }
      if (DB_KEYS.some((k) => key.includes(k))) {
        signals.push({ type: "database", value: `DB env: ${key}`, source: envFile });
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

/**
 * Inspects the repository at `root` and returns a RepoContext
 * suitable for use as `repository_context` in ModelProvider calls.
 */
export function inspectRepository(root: string = process.cwd()): RepoContext {
  const signals: RepoSignal[] = [];

  try { extractFromPackageJson(root, signals); } catch { /* non-fatal */ }
  try { extractFromConfigFiles(root, signals); } catch { /* non-fatal */ }
  try { extractEnvKeys(root, signals); } catch { /* non-fatal */ }

  // Deduplicate by value
  const seen = new Set<string>();
  const unique = signals.filter((s) => {
    if (seen.has(s.value)) return false;
    seen.add(s.value);
    return true;
  });

  const grouped = {
    languages: unique.filter((s) => s.type === "language").map((s) => s.value),
    frameworks: unique.filter((s) => s.type === "framework").map((s) => s.value),
    databases: unique.filter((s) => s.type === "database").map((s) => s.value),
    auth: unique.filter((s) => s.type === "auth").map((s) => s.value),
    dependencies: unique.filter((s) => s.type === "dependency").map((s) => s.value),
    testing: unique.filter((s) => s.type === "testing").map((s) => s.value),
    ci: unique.filter((s) => s.type === "ci").map((s) => s.value),
  };

  const parts: string[] = [];
  if (grouped.languages.length) parts.push(`Languages: ${grouped.languages.join(", ")}`);
  if (grouped.frameworks.length) parts.push(`Frameworks/Libraries: ${grouped.frameworks.join(", ")}`);
  if (grouped.databases.length) parts.push(`Databases/ORMs: ${grouped.databases.join(", ")}`);
  if (grouped.auth.length) parts.push(`Auth: ${grouped.auth.join(", ")}`);
  if (grouped.dependencies.length) parts.push(`Other integrations: ${grouped.dependencies.join(", ")}`);
  if (grouped.testing.length) parts.push(`Testing: ${grouped.testing.join(", ")}`);
  if (grouped.ci.length) parts.push(`CI: ${grouped.ci.join(", ")}`);

  const summary = parts.length
    ? parts.join(" | ")
    : "No significant signals detected (possibly a new project)";

  const full = parts.length
    ? [
        "## Repository Context",
        "",
        "The following signals were detected by inspecting the repository:",
        "",
        ...parts.map((p) => `- ${p}`),
        "",
        "Use this context to make informed assumptions and avoid asking unnecessary questions.",
        "All inferences from repository context should be marked as REPOSITORY_INFERENCE provenance.",
      ].join("\n")
    : "## Repository Context\n\nNo existing codebase signals detected. This appears to be a new project.";

  return { summary, full, signals: unique };
}
