import { NextRequest, NextResponse } from 'next/server'


const senseiMocks = [
  'どうしてそう思ったの？もう少し教えてくれるかな？',
  'いいところに気がついたね！じゃあ、もし10個あったらどうなるかな？',
  'うーん、それはどういう意味かな？自分の言葉で説明してみて！',
  'すごい！じゃあ「たす」ってどういうことだと思う？',
  'そうかもしれないね。でも、なんでそうなるんだろう？',
  'いい質問だね！まず、1と2を合わせるとどうなるか考えてみて。',
  'じゃあ、おやつが3つあって、1つ食べたら何個残るかな？',
  'もう少しだよ！どうやって考えたか教えてくれる？',
]

const tomoMocks = [
  'え〜！わたしは答えが100だと思う！ちがうかな〜？',
  'ねえねえ、計算って全部むずかしくない？わたしはいつも指で数えてるよ！',
  'うーん、数字って何個あるの？無限にあるの？！',
  'わたし、2たす2は5だと思ってたんだけど、ちがう？',
  '算数ってなんで勉強するの？買い物のとき以外いらなくない？笑',
  'ねえ、0ってなんで「ゼロ」って読むの？なんかふしぎ〜！',
  'わたし指が10本しかないから、10より大きい数はどうすればいいの？！',
  'え、たし算とひき算ってどうちがうの？おなじじゃない？',
]

function getRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]
}

const TOMO_APPEARANCE_RATE = 0.35 // 35%の確率でTomoが登場

export async function POST(request: NextRequest) {
  await request.json()

  const tomo = Math.random() < TOMO_APPEARANCE_RATE ? getRandom(tomoMocks) : null

  return NextResponse.json({
    sensei: getRandom(senseiMocks),
    tomo,
  })
}
