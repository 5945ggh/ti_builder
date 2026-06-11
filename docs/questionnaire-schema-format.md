# Questionnaire Schema Format Guide

TI Builder 的问卷草稿是一个 JSON 对象。站内 AI 可以帮你生成，但你也可以把这份格式说明发给外部协作者或其他 AI，让对方按同一格式产出草稿。

## Top-Level Shape

```json
{
  "title": "问卷标题",
  "description": "这份问卷测什么、适合什么场景",
  "scenario": "简短场景标签",
  "dimensions": [],
  "questions": [],
  "resultDebugPrompt": "生成结果解释时特别需要注意的说明"
}
```

Required fields:

- `title`: string
- `description`: string
- `scenario`: string
- `dimensions`: array
- `questions`: array
- `resultDebugPrompt`: string

## Dimensions

维度是最后向量的坐标。每个选项或开放题评分只能给已声明的维度加减分。

```json
{
  "id": "focus",
  "name": "专注执行",
  "description": "面对复杂任务时保持推进和收束的倾向",
  "lowLabel": "容易分散",
  "highLabel": "持续推进",
  "examples": ["能把模糊任务拆成下一步", "能在干扰下维持节奏"]
}
```

Rules:

- `id` 使用小写英文、数字、下划线，例如 `focus`, `risk_awareness`。
- `id` 必须唯一。
- `lowLabel`, `highLabel`, `examples` 可省略。

## Single Choice

```json
{
  "id": "q_focus_start",
  "type": "single_choice",
  "title": "面对一项模糊任务，你通常会先做什么？",
  "required": true,
  "options": [
    {
      "id": "map_first",
      "label": "先列出目标、约束和下一步",
      "deltaVector": {
        "focus": 2,
        "risk_awareness": 1
      },
      "formula": null
    },
    {
      "id": "jump_in",
      "label": "先开始做，边做边调整",
      "deltaVector": {
        "initiative": 2
      },
      "formula": null
    }
  ]
}
```

Rules:

- `type` must be `"single_choice"`.
- `options[].id` 在当前题内唯一。
- `deltaVector` 的 key 必须是 `dimensions[].id` 中声明过的维度。
- `formula` 只能是 `null` 或省略，不能写可执行表达式。

## Multiple Choice

```json
{
  "id": "q_work_support",
  "type": "multiple_choice",
  "title": "哪些信息会明显帮助你做决定？",
  "required": false,
  "options": [
    {
      "id": "examples",
      "label": "具体案例",
      "deltaVector": {
        "clarity": 1
      },
      "formula": null
    },
    {
      "id": "tradeoffs",
      "label": "利弊权衡",
      "deltaVector": {
        "risk_awareness": 2
      },
      "formula": null
    }
  ]
}
```

Multiple choice 与 single choice 的结构相同，只是作答时可以选择多个 option。多个 option 的 `deltaVector` 会相加。

## Open Text

```json
{
  "id": "q_reflection",
  "type": "open_text",
  "title": "请描述一次你把混乱问题推进到可执行状态的经历。",
  "required": true,
  "scoreRange": {
    "min": -2,
    "max": 2
  },
  "scoringPrompt": "根据回答中是否体现拆解问题、识别风险、形成下一步计划，为 focus、clarity、risk_awareness 给出 -2 到 2 的 deltaVector。只输出 JSON：{\"deltaVector\": {...}, \"confidence\": 0-1, \"rationale\": \"...\"}。不要做心理诊断或确定性升学/职业建议。"
}
```

Rules:

- `type` must be `"open_text"`.
- `scoreRange.min` 和 `scoreRange.max` 是 AI 评分时每个维度允许的分数范围。
- `scoringPrompt` 必须要求输出 JSON，形状为：

```json
{
  "deltaVector": {
    "focus": 1
  },
  "confidence": 0.75,
  "rationale": "简短说明"
}
```

## Minimal Complete Example

```json
{
  "title": "学习决策风格小测",
  "description": "用于内部测试学生在信息收集、风险判断和行动推进上的倾向。",
  "scenario": "高考专业选择",
  "dimensions": [
    {
      "id": "clarity",
      "name": "清晰化",
      "description": "把模糊问题转成可理解结构的倾向"
    },
    {
      "id": "initiative",
      "name": "主动推进",
      "description": "主动采取下一步行动的倾向"
    },
    {
      "id": "risk_awareness",
      "name": "风险意识",
      "description": "识别限制、代价和不确定性的倾向"
    }
  ],
  "questions": [
    {
      "id": "q_first_step",
      "type": "single_choice",
      "title": "遇到重要选择时，你通常先做什么？",
      "required": true,
      "options": [
        {
          "id": "collect_info",
          "label": "先收集关键信息",
          "deltaVector": {
            "clarity": 2
          },
          "formula": null
        },
        {
          "id": "try_action",
          "label": "先试一个可执行的小步骤",
          "deltaVector": {
            "initiative": 2
          },
          "formula": null
        }
      ]
    },
    {
      "id": "q_reflect",
      "type": "open_text",
      "title": "请描述一个你做选择时权衡信息和风险的例子。",
      "required": false,
      "scoreRange": {
        "min": -2,
        "max": 2
      },
      "scoringPrompt": "只输出 JSON：{\"deltaVector\": {\"clarity\": number, \"risk_awareness\": number}, \"confidence\": 0-1, \"rationale\": \"...\"}。分数必须在 -2 到 2 之间。不要做心理诊断或确定性升学/职业建议。"
    }
  ],
  "resultDebugPrompt": "解释时说明哪些维度较高、哪些维度证据不足，并提醒这是内部探索性结果，不是定论。"
}
```

## External Help Prompt

你可以把下面这段发给外部 AI 或协作者：

```text
请帮我把以下测评构思整理成 TI Builder questionnaire schema JSON。

要求：
- 只输出 JSON，不要 markdown。
- 顶层字段必须是 title, description, scenario, dimensions, questions, resultDebugPrompt。
- dimensions 使用小写英文 id，每个 id 唯一。
- questions 支持 single_choice, multiple_choice, open_text。
- choice option 的 deltaVector key 必须来自 dimensions id。
- formula 只能是 null 或省略，不能写表达式。
- open_text 的 scoringPrompt 必须要求后续评分 AI 只输出 JSON：{"deltaVector": {...}, "confidence": 0-1, "rationale": "..."}。
- 不要写心理诊断、医学判断、确定性的学校/专业/职业建议。

我的构思：
<把素材粘贴在这里>
```

## Review Checklist

- 所有 JSON 字符串都使用双引号。
- 没有尾随逗号。
- 每个 `id` 在自己的范围内唯一。
- 每个 `deltaVector` key 都能在 `dimensions` 里找到。
- 每个 choice option 的 `formula` 是 `null` 或不存在。
- 开放题评分 prompt 明确要求 JSON 输出。
- 问卷整体不承诺科学诊断或确定性建议。
