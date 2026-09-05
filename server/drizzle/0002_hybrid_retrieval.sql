-- M4: 混合检索 (pgvector + 全文 + 时序衰减 + RRF)
-- 目标：让 L5 Retrieved 层能从海量记忆中召回真正相关的那几条

-- 1. 启用 pgvector 扩展（Supabase 默认开启；若已存在会跳过）
CREATE EXTENSION IF NOT EXISTS vector;

-- 2. embedding 列（向量维度 1536 = text-embedding-3-small）
--    null 合法：旧记忆暂未回填，新记忆由 extraction 异步写入
ALTER TABLE memories ADD COLUMN IF NOT EXISTS embedding vector(1536);

-- 3. tsvector 生成列（PostgreSQL 12+ GENERATED ... STORED）
--    全文检索列不能用 trigger 或应用层写入——生成列最稳，自动跟随 content 变化
--    用 'simple' 配置：中文不需要英文 stemming；如要更智能可改 'english'+ zhparser
ALTER TABLE memories ADD COLUMN IF NOT EXISTS content_tsv tsvector
  GENERATED ALWAYS AS (to_tsvector('simple', coalesce(content, ''))) STORED;

-- 4. 向量索引（HNSW：无训练开销，对小数据集也高效；Supabase 推荐）
--    vector_cosine_ops = 余弦相似度（OpenAI embedding 默认就是余弦）
CREATE INDEX IF NOT EXISTS memories_embedding_hns
  ON memories USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

-- 5. 全文索引（GIN 是 tsvector 的标准搭档）
CREATE INDEX IF NOT EXISTS memories_content_tsv_gin
  ON memories USING GIN (content_tsv);

-- 6. 时序字段索引（用于时序衰减权重计算的高效排序）
CREATE INDEX IF NOT EXISTS memories_created_at_idx
  ON memories (conversation_id, created_at DESC);