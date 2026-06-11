import Link from "next/link";

const minimalExample = `{
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
      "scoringPrompt": "只输出 JSON：{\\"deltaVector\\": {\\"clarity\\": number}, \\"confidence\\": 0-1, \\"rationale\\": \\"...\\"}。分数必须在 -2 到 2 之间。不要做心理诊断或确定性升学/职业建议。"
    }
  ],
  "resultDebugPrompt": "解释时说明哪些维度较高、哪些维度证据不足，并提醒这是内部探索性结果，不是定论。"
}`;

const externalHelpPrompt = `请帮我把以下测评构思整理成 TI Builder questionnaire schema JSON。

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
<把素材粘贴在这里>`;

export default function QuestionnaireFormatGuidePage() {
  return (
    <main className="workspace wide">
      <header className="topbar">
        <div>
          <p className="eyebrow">Questionnaire Schema</p>
          <h1>问卷 JSON 格式说明</h1>
        </div>
        <div className="topbar-actions">
          <Link className="button ghost" href="/admin/questionnaires">
            返回问卷列表
          </Link>
          <Link className="button ghost" href="/admin">
            后台首页
          </Link>
        </div>
      </header>

      <section className="panel stack">
        <div>
          <div className="kicker">Purpose</div>
          <h2>给人和外部 AI 看的基础格式</h2>
          <p className="lead compact">
            站内 AI 可以生成 schema，但问卷本身就是一份普通 JSON。你可以把下面的格式和 prompt 发给外部协作者，
            让对方按同一结构整理素材，再粘贴回编辑器校验。
          </p>
        </div>
      </section>

      <section className="panel stack">
        <div>
          <div className="kicker">Shape</div>
          <h2>顶层字段</h2>
        </div>
        <div className="table guide-table" aria-label="顶层字段">
          <div className="row head">
            <span>字段</span>
            <span>类型</span>
            <span>说明</span>
          </div>
          <div className="row">
            <span>title</span>
            <span>string</span>
            <span>问卷标题</span>
          </div>
          <div className="row">
            <span>description</span>
            <span>string</span>
            <span>问卷用途和适用场景</span>
          </div>
          <div className="row">
            <span>scenario</span>
            <span>string</span>
            <span>简短场景标签</span>
          </div>
          <div className="row">
            <span>dimensions</span>
            <span>array</span>
            <span>最终向量的坐标，选项和开放题评分只能引用这里声明过的 id</span>
          </div>
          <div className="row">
            <span>questions</span>
            <span>array</span>
            <span>支持 single_choice、multiple_choice、open_text</span>
          </div>
          <div className="row">
            <span>resultDebugPrompt</span>
            <span>string</span>
            <span>生成内部结果解释时的额外说明</span>
          </div>
        </div>
      </section>

      <section className="panel stack">
        <div>
          <div className="kicker">Example</div>
          <h2>最小完整模板</h2>
        </div>
        <pre className="code-sample">{minimalExample}</pre>
      </section>

      <section className="panel stack">
        <div>
          <div className="kicker">External Help</div>
          <h2>外部求助 prompt</h2>
        </div>
        <pre className="code-sample">{externalHelpPrompt}</pre>
      </section>

      <section className="panel stack">
        <div>
          <div className="kicker">Checklist</div>
          <h2>粘贴前检查</h2>
        </div>
        <ul className="check-list">
          <li>所有 JSON 字符串都使用双引号，没有尾随逗号。</li>
          <li>每个 id 在自己的范围内唯一。</li>
          <li>每个 deltaVector key 都能在 dimensions 中找到。</li>
          <li>choice option 的 formula 是 null 或不存在。</li>
          <li>开放题 scoringPrompt 明确要求后续评分 AI 只输出 JSON。</li>
          <li>问卷整体不承诺科学诊断或确定性学校、专业、职业建议。</li>
        </ul>
      </section>
    </main>
  );
}
