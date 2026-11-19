-- =========================================================
-- VibeMate 2.0 - database/schema.sql
-- Creates the database and the tables for saving chats
-- =========================================================

CREATE DATABASE IF NOT EXISTS vibemate
    CHARACTER SET utf8mb4
    COLLATE utf8mb4_unicode_ci;

USE vibemate;

-- ---------------------------------------------------------
-- Table 1: conversations (one row for each chat)
-- ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS conversations (
    id          INT UNSIGNED NOT NULL AUTO_INCREMENT,
    title       VARCHAR(120) NOT NULL DEFAULT 'New chat',
    mode        VARCHAR(20)  NOT NULL DEFAULT 'chat',
    created_at  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP
                             ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------
-- Table 2: messages (every message inside a chat)
-- ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS messages (
    id               BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    conversation_id  INT UNSIGNED    NOT NULL,
    role             ENUM('user', 'bot') NOT NULL,
    content          MEDIUMTEXT      NOT NULL,
    has_image        TINYINT(1)      NOT NULL DEFAULT 0,
    created_at       TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    INDEX idx_messages_conversation (conversation_id, created_at),
    CONSTRAINT fk_messages_conversation
        FOREIGN KEY (conversation_id) REFERENCES conversations (id)
        ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Show the tables we created
SHOW TABLES;