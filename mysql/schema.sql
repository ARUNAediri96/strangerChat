CREATE DATABASE IF NOT EXISTS stranger_chat
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE stranger_chat;

CREATE TABLE IF NOT EXISTS waiting_pool (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  session_id VARCHAR(64) NOT NULL UNIQUE,
  filters JSON NOT NULL,
  public_key TEXT NOT NULL,
  mode ENUM('chat', 'video') NOT NULL DEFAULT 'chat',
  gender ENUM('male', 'female') NOT NULL DEFAULT 'male',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_waiting_pool_created_at (created_at),
  INDEX idx_waiting_pool_mode_gender_created (mode, gender, created_at)
);

CREATE TABLE IF NOT EXISTS active_chats (
  id CHAR(36) NOT NULL PRIMARY KEY,
  user_a_session VARCHAR(64) NOT NULL,
  user_b_session VARCHAR(64) NOT NULL,
  user_a_public_key TEXT NOT NULL,
  user_b_public_key TEXT NOT NULL,
  matched_filters JSON NOT NULL,
  mode ENUM('chat', 'video') NOT NULL DEFAULT 'chat',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMP NOT NULL,
  INDEX idx_active_chats_user_a (user_a_session),
  INDEX idx_active_chats_user_b (user_b_session),
  INDEX idx_active_chats_expires_at (expires_at)
);

CREATE TABLE IF NOT EXISTS chat_reports (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  chat_id CHAR(36) NOT NULL,
  reporter_session VARCHAR(64) NOT NULL,
  reason TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_chat_reports_chat_id (chat_id)
);

CREATE TABLE IF NOT EXISTS chat_events (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  chat_id CHAR(36) NOT NULL,
  session_id VARCHAR(64) NOT NULL,
  event_name VARCHAR(32) NOT NULL,
  payload JSON NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_chat_events_chat_id_id (chat_id, id),
  INDEX idx_chat_events_created_at (created_at)
);
