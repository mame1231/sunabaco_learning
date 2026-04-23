import { NextRequest, NextResponse } from 'next/server'
import Groq from 'groq-sdk'

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY })

const TOMO_APPEARANCE_RATE = 0.4

type BranchInfo = { to: string; question: string }
type SenseiParsed = { response: string; branch?: BranchInfo }

function parseSenseiResponse(content: string): SenseiParsed {
  try {
    const jsonMatch = content.match(/\{[\s\S]*\}/)
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0])
      if (typeof parsed.response === 'string') return parsed as SenseiParsed
    }
  } catch {}
  return { response: content }
}

export async function POST(request: NextRequest) {
  const { messages, grade, subject } = await request.json()

  const lastMessage =
    messages.filter((m: { role: string }) => m.role === 'child').at(-1)?.content ?? ''

  const history = messages.slice(-8).map((m: { role: string; content: string }) => ({
    role: m.role === 'child' ? ('user' as const) : ('assistant' as const),
    content: m.content,
  }))

  const senseiSystem = `あなたは「Sensei」というBRANCH LEARNING AIです。小学${grade}年生の子供と「${subject}」について一緒に考えています。

BRANCH LEARNINGは「横道設計型学習」です。人間の知識は脳のセマンティックネットワークとして蓄積され、異なる教科・分野を繋ぐ「ブランチ（接続点）」を発見するたびに思考の豊かさが増します。

ルール：
- 子供の発言に対して2〜3文で答える（小学${grade}年生にわかる言葉で）
- 答えをそのまま教えず「どう思う？」「なぜだろう？」と問いで返す
- 必ず「${subject}」から別の教科・分野への自然なブランチを1つ発見して繋ぐ（例：「算数といえば、実は料理の分量にも使われてるよ！」）
- 明るく、親しみやすいトーンで

必ず以下のJSON形式のみで返答（マークダウン不要）：
{"response":"メインの返答（2〜3文）","branch":{"to":"接続する分野名（例：歴史、算数、料理、スポーツなど）","question":"横道に誘う一文（例：「なぜ〜なんだろう？」）"}}`

  const tomoSystem = `あなたは「Tomo」という小学${grade}年生の友達キャラクターです。
- 少し天然でおっちょこちょい、でも一緒に考えようとする
- 「わたしは〜だと思う！」「ねえねえ〜」みたいなフレンドリーな口調
- 必ずしも正しくなくていい、一緒に考える感じで
- 1〜2文で短く
- 日本語のみで返答する`

  try {
    const showTomo = Math.random() < TOMO_APPEARANCE_RATE

    const [senseiRes, tomoRes] = await Promise.all([
      groq.chat.completions.create({
        model: 'llama-3.3-70b-versatile',
        messages: [{ role: 'system', content: senseiSystem }, ...history],
        max_tokens: 350,
      }),
      showTomo
        ? groq.chat.completions.create({
            model: 'llama-3.3-70b-versatile',
            messages: [
              { role: 'system', content: tomoSystem },
              { role: 'user', content: lastMessage },
            ],
            max_tokens: 100,
          })
        : Promise.resolve(null),
    ])

    const rawContent = senseiRes.choices[0].message.content ?? ''
    const parsed = parseSenseiResponse(rawContent)
    const tomo = tomoRes ? (tomoRes.choices[0].message.content ?? null) : null

    return NextResponse.json({ sensei: parsed.response, branch: parsed.branch ?? null, tomo })
  } catch (e) {
    console.error('Groq API error:', e)
    return NextResponse.json(
      { sensei: 'ごめんね、うまく考えられなかった。もう一度話しかけてみて！', branch: null, tomo: null },
      { status: 500 }
    )
  }
}
