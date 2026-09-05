-- M5: 情感特化层（关系状态机 + 情绪坐标 + 情感事件流）
-- 目标：让"亲密度/信任度/冲突度"变成可追踪的、可视化的、可干预的关系系统
--
-- 三层设计：
--   relationship_states     当前关系快照（每会话一行，三维坐标 + 阶段）
--   emotional_events        情感事件流（每次「关系大事」记一笔，delta 影响三维）
--   memories.emotional_*    单条记忆的情感标签（valence/arousal/intensity/dimension）

-- 1. 关系状态表（每会话一份）
CREATE TABLE IF NOT EXISTS relationship_states (
  conversation_id uuid PRIMARY KEY REFERENCES conversations(id) ON DELETE CASCADE,
  intimacy double precision NOT NULL DEFAULT 0.5,
  trust double precision NOT NULL DEFAULT 0.5,
  conflict double precision NOT NULL DEFAULT 0.0,
  phase text NOT NULL DEFAULT 'initial',
  version integer NOT NULL DEFAULT 0,
  last_event_at timestamp with time zone,
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- 2. 情感事件流（关系发展史）
CREATE TABLE IF NOT EXISTS emotional_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  memory_id uuid REFERENCES memories(id) ON DELETE SET NULL,
  dimension text NOT NULL,
  valence double precision,
  arousal double precision,
  intensity double precision NOT NULL DEFAULT 0.5,
  trigger_kind text NOT NULL,
  delta jsonb NOT NULL DEFAULT '{}'::jsonb,
  confidence double precision NOT NULL DEFAULT 0.7,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS emotional_events_conv_idx
  ON emotional_events (conversation_id, created_at DESC);

CREATE INDEX IF NOT EXISTS emotional_events_dimension_idx
  ON emotional_events (conversation_id, dimension);

-- 3. memories 情感字段（让单条记忆带情感标签，影响检索权重）
ALTER TABLE memories
  ADD COLUMN IF NOT EXISTS valence double precision,
  ADD COLUMN IF NOT EXISTS arousal double precision,
  ADD COLUMN IF NOT EXISTS emotional_intensity double precision NOT NULL DEFAULT 0.5,
  ADD COLUMN IF NOT EXISTS emotional_dimension text;

-- 4. 让记忆面板能按维度过滤（M7 用）
CREATE INDEX IF NOT EXISTS memories_dimension_idx
  ON memories (conversation_id, emotional_dimension);