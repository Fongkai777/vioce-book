import { integer, primaryKey, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const operationsSettings = sqliteTable("operations_settings", {
  id: integer("id").primaryKey(),
  dailyBudgetMicros: integer("daily_budget_micros").notNull().default(5_000_000),
  enabled: integer("enabled").notNull().default(1),
  maxConcurrent: integer("max_concurrent").notNull().default(4),
  updatedAt: text("updated_at").notNull(),
});
export const operationsUsage = sqliteTable("operations_usage", {
  date: text("date").primaryKey(),
  reservedMicros: integer("reserved_micros").notNull().default(0),
  requests: integer("requests").notNull().default(0),
});
export const operationsLeases = sqliteTable("operations_leases", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  expiresAt: integer("expires_at").notNull(),
});
export const operationsMetrics = sqliteTable("operations_metrics", {
  date: text("date").notNull(),
  route: text("route").notNull(),
  status: integer("status").notNull(),
  count: integer("count").notNull().default(0),
  totalMs: integer("total_ms").notNull().default(0),
  maxMs: integer("max_ms").notNull().default(0),
  lastAt: text("last_at").notNull(),
}, table => [primaryKey({ columns: [table.date, table.route, table.status] })]);
export const operationsAudit = sqliteTable("operations_audit", {
  id: text("id").primaryKey(),
  actor: text("actor").notNull(),
  action: text("action").notNull(),
  createdAt: text("created_at").notNull(),
});

export const readerPreferences = sqliteTable("reader_preferences", {
  userId: text("user_id").primaryKey(),
  settings: text("settings").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const answerFeedback = sqliteTable("answer_feedback", {
  userId: text("user_id").notNull(),
  exchangeId: text("exchange_id").notNull(),
  bookName: text("book_name").notNull(),
  question: text("question").notNull(),
  answer: text("answer").notNull(),
  rating: text("rating").notNull(),
  tags: text("tags").notNull(),
  comment: text("comment").notNull(),
  updatedAt: text("updated_at").notNull(),
}, table => [primaryKey({ columns: [table.userId, table.exchangeId] })]);

export const appUsers = sqliteTable("app_users", {
  userId: text("user_id").primaryKey(),
  email: text("email").notNull(),
  displayName: text("display_name").notNull(),
  createdAt: text("created_at").notNull(),
  lastSeenAt: text("last_seen_at").notNull(),
  username: text("username"),
  passwordHash: text("password_hash"),
  role: text("role").notNull().default("user"),
  active: integer("active").notNull().default(1),
}, (table) => [uniqueIndex("app_users_username_unique").on(table.username)]);

export const authSessions = sqliteTable("auth_sessions", {
  tokenHash: text("token_hash").primaryKey(),
  userId: text("user_id").notNull().references(() => appUsers.userId, { onDelete: "cascade" }),
  createdAt: text("created_at").notNull(),
  expiresAt: text("expires_at").notNull(),
});

export const authLoginAttempts = sqliteTable("auth_login_attempts", {
  attemptKey: text("attempt_key").primaryKey(),
  windowStartedAt: text("window_started_at").notNull(),
  attempts: integer("attempts").notNull().default(0),
});

export const quotaOverrides = sqliteTable("quota_overrides", {
  userId: text("user_id").primaryKey().references(() => appUsers.userId, { onDelete: "cascade" }),
  questionLimit: integer("question_limit").notNull().default(20),
  voiceSecondsLimit: integer("voice_seconds_limit").notNull().default(600),
  updatedAt: text("updated_at").notNull(),
});

export const dailyUsage = sqliteTable("daily_usage", {
  userId: text("user_id").notNull().references(() => appUsers.userId, { onDelete: "cascade" }),
  usageDate: text("usage_date").notNull(),
  questionCount: integer("question_count").notNull().default(0),
  voiceSeconds: integer("voice_seconds").notNull().default(0),
  embeddingCharacters: integer("embedding_characters").notNull().default(0),
  queryEmbeddingCount: integer("query_embedding_count").notNull().default(0),
  historySummaryCharacters: integer("history_summary_characters").notNull().default(0),
  speechCharacters: integer("speech_characters").notNull().default(0),
  updatedAt: text("updated_at").notNull(),
}, (table) => [primaryKey({ columns: [table.userId, table.usageDate] })]);
