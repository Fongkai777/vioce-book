import { integer, primaryKey, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const appUsers = sqliteTable("app_users", {
  userId: text("user_id").primaryKey(),
  email: text("email").notNull(),
  displayName: text("display_name").notNull(),
  createdAt: text("created_at").notNull(),
  lastSeenAt: text("last_seen_at").notNull(),
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
  speechCharacters: integer("speech_characters").notNull().default(0),
  updatedAt: text("updated_at").notNull(),
}, (table) => [primaryKey({ columns: [table.userId, table.usageDate] })]);
