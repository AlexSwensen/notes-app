CREATE TABLE IF NOT EXISTS `meta` (
	`key` text PRIMARY KEY,
	`value` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `notes` (
	`id` text PRIMARY KEY,
	`user_id` text NOT NULL,
	`parent_id` text,
	`title` text DEFAULT '' NOT NULL,
	`icon` text DEFAULT '' NOT NULL,
	`content` text DEFAULT 'null' NOT NULL,
	`text` text DEFAULT '' NOT NULL,
	`favorite` integer DEFAULT false NOT NULL,
	`sort` real DEFAULT 0 NOT NULL,
	`trashed` integer DEFAULT false NOT NULL,
	`purged` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`seq` integer NOT NULL,
	CONSTRAINT `fk_notes_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `users` (
	`id` text PRIMARY KEY,
	`email` text COLLATE NOCASE NOT NULL UNIQUE,
	`password_hash` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `notes_user_seq` ON `notes` (`user_id`,`seq`);
--> statement-breakpoint
INSERT OR IGNORE INTO `meta` (`key`, `value`) VALUES ('seq', '0');