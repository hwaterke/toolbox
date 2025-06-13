CREATE TABLE `exif` (
	`file_id` text(24) PRIMARY KEY NOT NULL,
	`make` text,
	`model` text,
	`width` integer,
	`height` integer,
	`exif_date` text,
	`live_photo_source` text,
	`live_photo_target` text,
	`latitude` real,
	`longitude` real,
	`created_at` integer DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`file_id`) REFERENCES `file`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `hash` (
	`file_id` text(24) NOT NULL,
	`algorithm` text NOT NULL,
	`version` text NOT NULL,
	`value` text NOT NULL,
	`validated_at` integer NOT NULL,
	`created_at` integer DEFAULT (datetime('now')) NOT NULL,
	PRIMARY KEY(`algorithm`, `version`, `file_id`),
	FOREIGN KEY (`file_id`) REFERENCES `file`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `file_id_idx` ON `hash` (`file_id`);--> statement-breakpoint
CREATE INDEX `algorithm_idx` ON `hash` (`algorithm`);--> statement-breakpoint
CREATE TABLE `file` (
	`id` text(24) PRIMARY KEY NOT NULL,
	`path` text NOT NULL,
	`size` integer NOT NULL,
	`mtime` integer NOT NULL,
	`basename` text NOT NULL,
	`extension` text,
	`validated_at` integer NOT NULL,
	`created_at` integer DEFAULT (datetime('now')) NOT NULL,
	`updated_at` integer DEFAULT (datetime('now')) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `file_path_unique` ON `file` (`path`);--> statement-breakpoint
CREATE INDEX `extension_idx` ON `file` (`extension`);