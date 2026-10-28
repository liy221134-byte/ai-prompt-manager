/**
 * 学习目标行的主键生成。
 *
 * 为什么要单独一个函数：learning_goals.id 是 text 主键且没有数据库默认值，
 * 前端必须自己给出。最初的写法是 `goal-${topicId}`，在单用户下看不出问题，
 * 但第二个人把同一个主题设为主攻时，会撞上第一个人那行的主键——
 * 撞的是主键，不是 (user_id, topic_id) 唯一约束，所以报的错跟「重复启用」无关，
 * 排查时极容易误判。
 *
 * 加上 user_id 之后：同一人同一主题恒等于同一个 id（upsert 天然幂等），
 * 不同人互不干扰。
 */
export function goalId(userId: string, topicId: string): string {
  return `goal-${userId}-${topicId}`;
}
