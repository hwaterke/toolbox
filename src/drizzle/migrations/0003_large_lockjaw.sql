CREATE TABLE `exif`
(
    `file_id`           text(24) PRIMARY KEY              NOT NULL,
    `make`              text,
    `model`             text,
    `width`             integer,
    `height`            integer,
    `exif_date`         text,
    `live_photo_source` text,
    `live_photo_target` text,
    `latitude`          real,
    `longitude`         real,
    `created_at`        integer DEFAULT (datetime('now')) NOT NULL,
    FOREIGN KEY (`file_id`) REFERENCES `file` (`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint

-- Migrate data to the new exif table
INSERT INTO `exif`(`file_id`, `make`, `model`, `width`, `height`, `exif_date`, `live_photo_source`, `live_photo_target`,
                   `latitude`, `longitude`)
SELECT `id`,
       `make`,
       `model`,
       `width`,
       `height`,
       `exif_date`,
       `live_photo_source`,
       `live_photo_target`,
       `latitude`,
       `longitude`
FROM `file`;

ALTER TABLE `file`
    DROP COLUMN `make`;--> statement-breakpoint
ALTER TABLE `file`
    DROP COLUMN `model`;--> statement-breakpoint
ALTER TABLE `file`
    DROP COLUMN `width`;--> statement-breakpoint
ALTER TABLE `file`
    DROP COLUMN `height`;--> statement-breakpoint
ALTER TABLE `file`
    DROP COLUMN `exif_date`;--> statement-breakpoint
ALTER TABLE `file`
    DROP COLUMN `live_photo_source`;--> statement-breakpoint
ALTER TABLE `file`
    DROP COLUMN `live_photo_target`;--> statement-breakpoint
ALTER TABLE `file`
    DROP COLUMN `latitude`;--> statement-breakpoint
ALTER TABLE `file`
    DROP COLUMN `longitude`;--> statement-breakpoint
ALTER TABLE `file`
    DROP COLUMN `exif_validated_at`;--> statement-breakpoint
