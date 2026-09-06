-- M12: 记忆来源落库（origin 列）+ 存量回填
--
-- 背景：M12 的写入闸门（resolveWriteGate）依赖提取层输出的 origin(user/assistant)，
-- 但此前 origin 只存在于提取过程中、未持久化——闸门生效（unverified 状态可见），
-- 但事后无法审计"这条记忆为什么是 unverified"。
--
-- 迁移内容：
--   1. memories 新增 origin 列（user | assistant，可空——M12 之前的存量无此信息）
--   2. 回填：status='unverified' 的记忆即 assistant 原创内容 → origin='assistant'
--      （unverified 是 M12 专为 assistant 原创内容设的状态，回填安全）

ALTER TABLE memories ADD COLUMN IF NOT EXISTS origin text
  CHECK (origin IN ('user', 'assistant'));

UPDATE memories SET origin = 'assistant' WHERE status = 'unverified' AND origin IS NULL;
