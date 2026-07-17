-- FILE: yc/db/schema.sql
-- VERSION: 1.0.0
-- START_MODULE_CONTRACT
--   PURPOSE: Database schema definition for YDB.
--   SCOPE: Defines tables for users, templates, submit logs, and resolved community IDs.
--   DEPENDS: none
--   LINKS: M-YC-DB
--   ROLE: CONFIG
--   MAP_MODE: NONE
-- END_MODULE_CONTRACT

-- START_CHANGE_SUMMARY
--   LAST_CHANGE: [v1.0.0 - Initial schema definition with tables and secondary indexes]
-- END_CHANGE_SUMMARY

CREATE TABLE users (
  hashedVkId UTF8,
  PRIMARY KEY (hashedVkId)
);

CREATE TABLE templates (
  id UINT64,
  vkUserId UINT64,
  name UTF8,
  text UTF8,
  createdAt UINT64,
  updatedAt UINT64,
  PRIMARY KEY (id),
  INDEX index_templates_vkUserId GLOBAL ON (vkUserId)
);

CREATE TABLE submit_logs (
  id UINT64,
  vkUserId UINT64,
  communityId UINT64,
  postId UINT64,
  status UTF8,
  errorCode UINT64,
  createdAt UINT64,
  PRIMARY KEY (id),
  INDEX index_submit_logs_vkUserId_communityId GLOBAL ON (vkUserId, communityId)
);

CREATE TABLE community_ids (
  screenName UTF8,
  numericId UINT64,
  avatarUrl UTF8,
  resolvedAt UINT64,
  PRIMARY KEY (screenName)
);
