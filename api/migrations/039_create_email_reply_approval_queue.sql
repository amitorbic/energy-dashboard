-- Migration 039: Email-reply approval queue.
--
-- Supports the Outlook extractor / email-assistant pipeline (a separate
-- Python project) writing one row per incoming customer query it processes:
-- either a drafted reply (draft_status = DRAFTED) or an abstention when it
-- found no good match (draft_status = NO_MATCH_NEEDS_MANUAL_REPLY, with
-- draft_reply left NULL). Every row lands in status = PENDING for a human
-- to approve/deny/edit before anything is sent -- modeled directly on the
-- collections_approval_queue / collections_timeline pattern in
-- api/models/collections.py, which has no corresponding migration file of
-- its own (its tables were created outside this numbered-migration flow).
--
-- is_archived / archived_at are an informational staleness flag only -- the
-- application layer must not use them to block approve/deny/send actions on
-- old rows; enforced in code, not by a DB constraint.
--
-- category is a fixed 7-value set from the email pipeline's taxonomy
-- (billing, payment, pricing, commission, collections,
-- cancellation_closure, other) -- lowercase to match the pipeline's own
-- values, unlike the UPPERCASE status/type enums elsewhere in this
-- migration, which follow this project's existing SAEnum convention.
--
-- Not executed against any database -- for review and manual run only,
-- same pattern as every other migration in this project.

CREATE TABLE `email_reply_approval_queue` (
  `id`                 INT           NOT NULL AUTO_INCREMENT,
  `query_text`         TEXT          NOT NULL,
  `retrieved_context`  JSON          DEFAULT NULL,
  `category`           ENUM(
                          'billing',
                          'payment',
                          'pricing',
                          'commission',
                          'collections',
                          'cancellation_closure',
                          'other'
                        )             NOT NULL,
  `confidence_score`   FLOAT         DEFAULT NULL,
  `draft_status`       ENUM('DRAFTED','NO_MATCH_NEEDS_MANUAL_REPLY') NOT NULL,
  `draft_reply`        TEXT          DEFAULT NULL,
  `status`             ENUM('PENDING','APPROVED','DENIED','AUTO_SENT')
                        NOT NULL DEFAULT 'PENDING',
  `human_reviewed`     TINYINT(1)    NOT NULL DEFAULT 0,
  `reviewed_by`        VARCHAR(100)  DEFAULT NULL,
  `reviewed_at`        DATETIME      DEFAULT NULL,
  `reviewer_notes`     TEXT          DEFAULT NULL,
  `sent_reply`         TEXT          DEFAULT NULL,
  `is_archived`        TINYINT(1)    NOT NULL DEFAULT 0,
  `archived_at`        DATETIME      DEFAULT NULL,
  `created_by`         VARCHAR(100)  NOT NULL DEFAULT 'llm_agent',
  `created_at`         DATETIME      DEFAULT CURRENT_TIMESTAMP,
  `updated_at`         DATETIME      DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  INDEX `idx_erq_category` (`category`),
  INDEX `idx_erq_draft_status` (`draft_status`),
  INDEX `idx_erq_status` (`status`),
  INDEX `idx_erq_created_at` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE `email_reply_timeline` (
  `id`               INT           NOT NULL AUTO_INCREMENT,
  `queue_item_id`    INT           NOT NULL,
  `actor_type`       ENUM('HUMAN','LLM_AGENT','SYSTEM') NOT NULL,
  `actor_name`       VARCHAR(100)  NOT NULL,
  `event_type`       ENUM(
                        'DRAFT_CREATED',
                        'NO_MATCH_ABSTAINED',
                        'APPROVED',
                        'DENIED',
                        'EDITED',
                        'AUTO_SENT',
                        'ARCHIVED',
                        'NOTE_ADDED'
                      )               NOT NULL,
  `subject`          VARCHAR(500)  DEFAULT NULL,
  `body`             TEXT          DEFAULT NULL,
  `event_metadata`   JSON          DEFAULT NULL,
  `created_at`       DATETIME      DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  INDEX `idx_ert_queue_item_id` (`queue_item_id`),
  INDEX `idx_ert_event_type` (`event_type`),
  INDEX `idx_ert_created_at` (`created_at`),
  CONSTRAINT `fk_ert_queue_item`
    FOREIGN KEY (`queue_item_id`) REFERENCES `email_reply_approval_queue` (`id`)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
