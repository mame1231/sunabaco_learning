import { NextRequest, NextResponse } from 'next/server'
import Groq from 'groq-sdk'

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY })

const TOMO_APPEARANCE_RATE = 0.35

export async function POST(request: NextRequest) {
  const { messages, grade } = await request.json()

  const lastMessage = messages.filter((m: { role: string }) => m.role === 'child').at(-1)?.content ?? ''

  const senseiSystem = `あなたは「Sensei」という名前の、小学${grade}年生向けの学習サポートAIです。
子どもの質問や発言に対して、以下のルールで返答してください：
- 小学${grade}年生にわかる言葉を使う
- 答えをそのまま教えず、「どう思う？」「なぜだろう？」と考えを引き出す
- 明るく、親しみやすいトーンで
- 返答は2〜3文で短くまとめる
- 日本語で返答する`

  const tomoSystem = `あなたは「Tomo」という名前の、小学${grade}年生の友達キャラクターAIです。
Senseiとは別に、子どもと一緒に考えるクラスメートとして返答してください：
- 少し天然でおっちょこちょい、でも一緒に考えようとする
- 「わたしは〜だと思う！」「ねえねえ〜」みたいなフレンドリーな口調
- 必ずしも正しくなくていい、むしろ間違えて一緒に考える感じで
- 1〜2文で短く
- 日本語で返答する`

  try {
    const showTomo = Math.random() < TOMO_APPEARANCE_RATE

    const [senseiRes, tomoRes] = await Promise.all([
      groq.chat.completions.create({
        model: 'llama-3.3-70b-versatile',
        messages: [
          { role: 'system', content: senseiSystem },
          { role: 'user', content: lastMessage },
        ],
        max_tokens: 200,
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

    const sensei = senseiRes.choices[0].message.content ?? ''
    const tomo = tomoRes ? tomoRes.choices[0].message.content ?? null : null

    return NextResponse.json({ sensei, tomo })
  } catch (e) {
    console.error('Groq API error:', e)
    return NextResponse.json(
      { sensei: 'ごめんね、うまく考えられなかった。もう一度話しかけてみて！', tomo: null },
      { status: 500 }
    )
  }
}
