'use client'

import { useState, useRef, useEffect } from 'react'
import { createClient } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import type { User } from '@supabase/supabase-js'
import { CharacterAvatar } from '@/components/CharacterAvatar'

declare global {
  interface Window {
    SpeechRecognition: new () => SpeechRecognition
    webkitSpeechRecognition: new () => SpeechRecognition
  }
  interface SpeechRecognition extends EventTarget {
    lang: string
    interimResults: boolean
    continuous: boolean
    start(): void
    stop(): void
    onresult: ((e: SpeechRecognitionEvent) => void) | null
    onend: (() => void) | null
    onerror: ((e: SpeechRecognitionErrorEvent) => void) | null
  }
  interface SpeechRecognitionEvent extends Event {
    readonly results: SpeechRecognitionResultList
  }
  interface SpeechRecognitionErrorEvent extends Event {
    readonly error: string
  }
}

type Phase = 'grade' | 'subject' | 'chat'
type Role = 'child' | 'sensei' | 'tomo'
type BranchInfo = { to: string; question: string }

type Message = {
  id: string
  role: Role
  content: string
  branch?: BranchInfo
}

type Profile = {
  nickname: string | null
  avatar_url: string | null
}

const GRADE_LABELS = ['1年生', '2年生', '3年生', '4年生', '5年生', '6年生']

const SUBJECTS = [
  { id: '国語', emoji: '📖' },
  { id: '算数', emoji: '🔢' },
  { id: '理科', emoji: '🔬' },
  { id: '社会', emoji: '🗺️' },
  { id: '英語', emoji: '🌍' },
  { id: '図工', emoji: '🎨' },
  { id: '音楽', emoji: '🎵' },
  { id: '体育', emoji: '⚽' },
  { id: 'なんでも', emoji: '✨' },
]

function speakText(text: string, character: 'sensei' | 'tomo'): Promise<void> {
  return new Promise((resolve) => {
    window.speechSynthesis.cancel()
    const utterance = new SpeechSynthesisUtterance(text)
    utterance.lang = 'ja-JP'
    utterance.pitch = character === 'sensei' ? 1.0 : 1.4
    utterance.rate = 1.1
    utterance.onend = () => resolve()
    utterance.onerror = () => resolve()
    window.speechSynthesis.speak(utterance)
  })
}

export default function Home() {
  const [user, setUser] = useState<User | null>(null)
  const [profile, setProfile] = useState<Profile>({ nickname: null, avatar_url: null })
  const [phase, setPhase] = useState<Phase>('grade')
  const [grade, setGrade] = useState<number | null>(null)
  const [subject, setSubject] = useState<string | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [branchCount, setBranchCount] = useState(0)
  const [conversationId, setConversationId] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [recording, setRecording] = useState(false)
  const [speaking, setSpeaking] = useState(false)
  const [talkingChar, setTalkingChar] = useState<'sensei' | 'tomo' | null>(null)
  const [interimText, setInterimText] = useState('')
  const [textInput, setTextInput] = useState('')
  const bottomRef = useRef<HTMLDivElement>(null)
  const recognitionRef = useRef<SpeechRecognition | null>(null)
  const speechUnlockedRef = useRef(false)

  // iOSはユーザージェスチャーからspeakを呼ばないとブロックされる
  // 最初のタップ時に空発話でアンロックしておく
  function unlockSpeech() {
    if (speechUnlockedRef.current || typeof window === 'undefined') return
    speechUnlockedRef.current = true
    const u = new SpeechSynthesisUtterance('')
    window.speechSynthesis.speak(u)
  }
  const interimTextRef = useRef('')
  const router = useRouter()

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      setUser(user)
      if (!user) return
      const { data } = await supabase
        .from('profiles')
        .select('nickname, avatar_url')
        .eq('id', user.id)
        .single()
      if (data) setProfile({ nickname: data.nickname, avatar_url: data.avatar_url })
    })
  }, [])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, interimText])

  function handleGradeSelect(g: number) {
    setGrade(g)
    setPhase('subject')
  }

  async function handleSubjectSelect(s: string) {
    unlockSpeech() // 科目タップ＝ユーザージェスチャーのタイミングでiOS TTSをアンロック
    setSubject(s)
    setBranchCount(0)

    const subjectEmoji = SUBJECTS.find((sub) => sub.id === s)?.emoji ?? ''
    const introMessages: Message[] = [
      {
        id: 'intro-sensei',
        role: 'sensei',
        content: `${subjectEmoji} ${s}について一緒に考えよう！今日はどんなことが気になってる？何でも話しかけてみて！`,
      },
      {
        id: 'intro-tomo',
        role: 'tomo',
        content: `やっほー！${s}か〜！わたしも一緒に考えるね！`,
      },
    ]
    setMessages(introMessages)
    setPhase('chat')

    if (user) {
      try {
        const supabase = createClient()
        const { data } = await supabase
          .from('conversations')
          .insert({ user_id: user.id, grade, subject: s, messages: introMessages })
          .select('id')
          .single()
        setConversationId(data?.id ?? null)
      } catch {
        setConversationId(null)
      }
    }
  }

  async function saveMessages(msgs: Message[]) {
    if (!conversationId) return
    const supabase = createClient()
    await supabase
      .from('conversations')
      .update({ messages: msgs, updated_at: new Date().toISOString() })
      .eq('id', conversationId)
  }

  async function handleSend(text: string) {
    if (!text.trim() || loading || grade === null || subject === null) return

    const childMessage: Message = { id: Date.now().toString(), role: 'child', content: text.trim() }
    const newMessages = [...messages, childMessage]
    setMessages(newMessages)
    setLoading(true)
    setTextInput('')

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: newMessages, grade, subject }),
      })
      const data = await res.json()

      const senseiMsg: Message = {
        id: Date.now().toString() + '-sensei',
        role: 'sensei',
        content: data.sensei,
        branch: data.branch ?? undefined,
      }

      if (data.branch) setBranchCount((c) => c + 1)

      const updatedMessages: Message[] = data.tomo
        ? [
            ...newMessages,
            senseiMsg,
            { id: Date.now().toString() + '-tomo', role: 'tomo' as Role, content: data.tomo },
          ]
        : [...newMessages, senseiMsg]

      setMessages(updatedMessages)
      setLoading(false)
      await saveMessages(updatedMessages)

      setSpeaking(true)
      try {
        setTalkingChar('sensei')
        await speakText(data.sensei, 'sensei')
        setTalkingChar(null)
        if (data.tomo) {
          setTalkingChar('tomo')
          await speakText(data.tomo, 'tomo')
          setTalkingChar(null)
        }
      } finally {
        setSpeaking(false)
      }
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          id: Date.now().toString() + '-error',
          role: 'sensei',
          content: 'エラーが発生しました。もう一度試してね。',
        },
      ])
      setLoading(false)
    }
  }

  function startRecording() {
    // HTTPS（またはlocalhost）でないと音声APIは使えない
    if (!window.isSecureContext) {
      alert('音声入力はHTTPS接続が必要です。\nVercelなどのHTTPS環境でお試しください。')
      return
    }

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SpeechRecognition) {
      alert('音声入力に対応していません。\niPhone/iPadはSafari、AndroidはChromeをお使いください。')
      return
    }

    const recognition = new SpeechRecognition()
    recognition.lang = 'ja-JP'
    recognition.interimResults = true
    recognition.continuous = false

    let gotResult = false

    recognition.onresult = (e: SpeechRecognitionEvent) => {
      gotResult = true
      const result = e.results[e.results.length - 1]
      const text = result[0].transcript
      if (result.isFinal) {
        interimTextRef.current = ''
        setInterimText('')
        setRecording(false)
        handleSend(text)
      } else {
        interimTextRef.current = text
        setInterimText(text)
      }
    }

    recognition.onend = () => {
      setRecording(false)
      const text = interimTextRef.current
      interimTextRef.current = ''
      setInterimText('')
      if (text.trim()) {
        handleSend(text.trim())
      } else if (!gotResult) {
        // 結果ゼロで終了 → iOSの音声入力設定が原因の可能性
        alert('音声が認識されませんでした。\n\niPhoneの場合：\n設定 → 一般 → キーボード → 音声入力 をオン\n設定 → プライバシー → 音声認識 → Safari をオン')
      }
    }

    recognition.onerror = (e: SpeechRecognitionErrorEvent) => {
      setRecording(false)
      interimTextRef.current = ''
      setInterimText('')
      const messages: Record<string, string> = {
        'not-allowed': 'マイクの使用が許可されていません。\nブラウザの設定でマイクを許可してください。',
        'no-speech': '声が聞こえませんでした。もう一度試してね！',
        'network': 'ネットワークエラーです。\nインターネット接続を確認してください。',
        'audio-capture': 'マイクが使えません。接続を確認してください。',
        'service-not-allowed': 'iOSの設定でマイクが許可されていません。\n設定 → Safari → マイク → 許可\nまたは設定 → プライバシー → マイク → Safari をオンにしてください。',
      }
      // 未知のエラーも表示して原因を把握できるようにする
      alert(messages[e.error] ?? `音声認識エラー: ${e.error}`)
    }

    recognitionRef.current = recognition
    try {
      window.speechSynthesis.cancel() // 音声セッションを解放してからマイク起動
      recognition.start()
      setRecording(true)
    } catch {
      alert('音声認識の起動に失敗しました。ページを再読み込みして試してください。')
    }
  }

  function stopRecording() {
    recognitionRef.current?.stop()
    setRecording(false)
    setInterimText('')
  }

  async function handleLogout() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  const micDisabled = loading || speaking

  // ── 学年選択 ──────────────────────────────────────────────────────
  if (phase === 'grade') {
    return (
      <div className="min-h-screen bg-gradient-to-b from-green-50 to-amber-50 flex flex-col items-center justify-center p-4 sm:p-8">
        <div className="absolute top-4 right-4 flex items-center gap-3">
          {user?.email === process.env.NEXT_PUBLIC_ADMIN_EMAIL && (
            <button
              onClick={() => router.push('/admin')}
              className="text-xs text-green-600 hover:underline"
            >
              管理者
            </button>
          )}
          <button
            onClick={handleLogout}
            className="text-xs text-gray-400 hover:text-gray-600"
          >
            ログアウト
          </button>
        </div>

        <div className="absolute top-4 left-4">
          <button
            onClick={() => router.push('/profile')}
            className="flex items-center gap-2 bg-white rounded-full pl-1 pr-3 py-1 shadow text-sm text-gray-600 hover:shadow-md transition-all"
          >
            <div className="w-8 h-8 rounded-full overflow-hidden bg-green-100 flex items-center justify-center">
              {profile.avatar_url ? (
                <img src={profile.avatar_url} alt="avatar" className="w-full h-full object-cover" />
              ) : (
                <span className="text-lg">👤</span>
              )}
            </div>
            <span className="font-medium max-w-[80px] sm:max-w-none truncate">{profile.nickname ?? 'プロフィール'}</span>
          </button>
        </div>

        <div className="flex items-center gap-2 sm:gap-3 mb-1">
          <span className="text-4xl sm:text-5xl">🌿</span>
          <h1 className="text-3xl sm:text-4xl font-bold text-green-800">BRANCH LEARNING</h1>
        </div>
        <p className="text-green-600 mb-6 sm:mb-8 text-sm sm:text-base">知識のネットワークを広げよう</p>

        <div className="flex gap-6 sm:gap-10 mb-6 sm:mb-10">
          <div className="flex flex-col items-center gap-2">
            <CharacterAvatar character="sensei" size={68} />
            <span className="text-sm font-bold text-green-700">Sensei</span>
          </div>
          <div className="flex flex-col items-center gap-2">
            <CharacterAvatar character="tomo" size={68} />
            <span className="text-sm font-bold text-orange-500">Tomo</span>
          </div>
        </div>

        <p className="text-gray-700 text-lg sm:text-xl mb-4 sm:mb-6 font-medium">何年生ですか？</p>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 sm:gap-4 w-full max-w-xs sm:max-w-none">
          {GRADE_LABELS.map((label, i) => (
            <button
              key={i}
              onClick={() => handleGradeSelect(i + 1)}
              className="bg-white border-2 border-green-400 text-green-800 font-bold text-base sm:text-lg px-4 sm:px-8 py-4 sm:py-6 rounded-2xl hover:bg-green-500 hover:text-white hover:border-green-500 transition-all shadow-md active:scale-95"
            >
              {label}
            </button>
          ))}
        </div>
      </div>
    )
  }

  // ── 科目選択 ──────────────────────────────────────────────────────
  if (phase === 'subject') {
    return (
      <div className="min-h-screen bg-gradient-to-b from-green-50 to-amber-50 flex flex-col items-center justify-center p-4 sm:p-8">
        <button
          onClick={() => setPhase('grade')}
          className="absolute top-5 left-5 text-green-600 hover:text-green-800 flex items-center gap-1 text-sm font-medium"
        >
          ← 小学{grade}年生
        </button>

        <div className="flex items-center gap-2 mb-1">
          <span className="text-3xl">🌿</span>
          <h1 className="text-2xl sm:text-3xl font-bold text-green-800">BRANCH LEARNING</h1>
        </div>
        <p className="text-green-600 mb-6 sm:mb-8 text-sm sm:text-base">今日は何を学ぶ？</p>

        <div className="grid grid-cols-3 gap-2 sm:gap-3 w-full max-w-xs sm:max-w-sm">
          {SUBJECTS.map((s) => (
            <button
              key={s.id}
              onClick={() => handleSubjectSelect(s.id)}
              className="bg-white border-2 border-green-200 text-gray-700 font-bold py-3 sm:py-5 rounded-2xl hover:border-green-400 hover:bg-green-50 transition-all shadow-sm flex flex-col items-center gap-1 sm:gap-2 active:scale-95"
            >
              <span className="text-2xl sm:text-3xl">{s.emoji}</span>
              <span className="text-xs sm:text-sm">{s.id}</span>
            </button>
          ))}
        </div>
      </div>
    )
  }

  // ── チャット ──────────────────────────────────────────────────────
  const subjectInfo = SUBJECTS.find((s) => s.id === subject)

  return (
    <div className="min-h-screen bg-amber-50 flex flex-col">
      {/* ヘッダー */}
      <div className="bg-green-600 text-white px-4 py-3 flex items-center justify-between shadow">
        <div className="flex items-center gap-2">
          <button
            onClick={() => router.push('/profile')}
            className="w-9 h-9 rounded-full overflow-hidden bg-green-400 flex items-center justify-center border-2 border-white"
          >
            {profile.avatar_url ? (
              <img src={profile.avatar_url} alt="avatar" className="w-full h-full object-cover" />
            ) : (
              <span className="text-lg">👤</span>
            )}
          </button>
          <span className="font-bold text-sm max-w-[70px] sm:max-w-none truncate">{profile.nickname ?? 'きみ'}</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => { setPhase('subject'); setMessages([]); setConversationId(null) }}
            className="bg-white text-green-700 font-bold px-3 py-1 rounded-full text-sm flex items-center gap-1"
          >
            {subjectInfo?.emoji} {subject}
          </button>
          {branchCount > 0 && (
            <div className="bg-yellow-400 text-yellow-900 font-bold px-3 py-1 rounded-full text-xs flex items-center gap-1">
              🌿 ×{branchCount}
            </div>
          )}
          <button onClick={handleLogout} className="text-green-200 text-xs hover:text-white">
            ログアウト
          </button>
        </div>
      </div>

      {/* キャラクターエリア */}
      <div className="bg-white border-b border-green-100 px-4 py-3 flex items-end justify-center gap-8">
        <div className="flex flex-col items-center gap-1">
          <CharacterAvatar character="sensei" size={72} talking={talkingChar === 'sensei'} />
          <span className="text-xs font-bold text-green-700">Sensei</span>
        </div>
        <div className="flex flex-col items-center gap-1">
          <CharacterAvatar character="tomo" size={72} talking={talkingChar === 'tomo'} />
          <span className="text-xs font-bold text-orange-500">Tomo</span>
        </div>
      </div>

      {/* メッセージ一覧 */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
        {messages.map((msg) => {
          if (msg.role === 'child') {
            return (
              <div key={msg.id} className="flex justify-end items-end gap-2">
                <div className="bg-blue-500 text-white px-4 py-3 rounded-2xl rounded-tr-sm max-w-[78%] sm:max-w-sm text-sm shadow">
                  {msg.content}
                </div>
                <div className="w-8 h-8 rounded-full overflow-hidden bg-green-100 flex-shrink-0 flex items-center justify-center">
                  {profile.avatar_url ? (
                    <img src={profile.avatar_url} alt="avatar" className="w-full h-full object-cover" />
                  ) : (
                    <span className="text-lg">👤</span>
                  )}
                </div>
              </div>
            )
          }

          const isSensei = msg.role === 'sensei'
          return (
            <div key={msg.id}>
              <div className="flex items-start gap-2">
                <div className="flex-shrink-0">
                  <CharacterAvatar character={isSensei ? 'sensei' : 'tomo'} size={36} />
                </div>
                <div
                  className={`px-4 py-3 rounded-2xl rounded-tl-sm max-w-[78%] sm:max-w-sm text-sm shadow ${
                    isSensei ? 'bg-green-100 text-green-900' : 'bg-orange-100 text-orange-900'
                  }`}
                >
                  <p className="font-bold text-xs mb-1 opacity-60">
                    {isSensei ? 'Sensei' : 'Tomo'}
                  </p>
                  {msg.content}
                </div>
              </div>

              {/* BRANCH発見カード */}
              {msg.branch && (
                <div className="ml-11 mt-2 bg-gradient-to-r from-green-50 to-yellow-50 border-2 border-green-300 rounded-2xl px-4 py-3 max-w-[78%] sm:max-w-sm shadow-sm">
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <span className="text-base">🌿</span>
                    <span className="text-xs font-bold text-green-700 tracking-wider uppercase">
                      Branch 発見！
                    </span>
                  </div>
                  <p className="text-xs text-green-700 font-semibold mb-1">
                    <span className="font-bold text-green-800">{subject}</span>
                    <span className="mx-1.5 text-green-400">→</span>
                    <span className="font-bold text-green-800">{msg.branch.to}</span>
                    <span className="ml-1 font-normal">に繋がった！</span>
                  </p>
                  <p className="text-sm text-green-900 italic">「{msg.branch.question}」</p>
                </div>
              )}
            </div>
          )
        })}

        {loading && (
          <div className="flex items-center gap-2">
            <CharacterAvatar character="sensei" size={36} />
            <div className="bg-green-100 px-4 py-3 rounded-2xl text-sm text-green-800 flex items-center gap-2">
              <span className="animate-pulse">🌿</span>
              <span>ブランチを探してるよ...</span>
            </div>
          </div>
        )}

        {interimText && (
          <div className="flex justify-end">
            <div className="bg-blue-200 text-blue-800 px-4 py-3 rounded-2xl rounded-tr-sm max-w-sm text-sm shadow opacity-70 italic">
              {interimText}
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* 入力エリア */}
      <div className="bg-white border-t border-green-100 px-4 py-4 flex flex-col items-center gap-3">
        {/* テキスト入力 */}
        <div className="flex items-center gap-2 w-full max-w-md">
          <input
            type="text"
            value={textInput}
            onChange={(e) => setTextInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                unlockSpeech()
                handleSend(textInput)
              }
            }}
            placeholder="メッセージを入力..."
            disabled={micDisabled}
            className="flex-1 border border-green-200 rounded-full px-4 py-2.5 focus:outline-none focus:border-green-400 disabled:opacity-40 bg-gray-50"
          />
          <button
            onClick={() => { unlockSpeech(); handleSend(textInput) }}
            disabled={micDisabled || !textInput.trim()}
            className="bg-green-500 text-white rounded-full w-10 h-10 flex items-center justify-center hover:bg-green-600 disabled:opacity-40 transition-all text-lg"
          >
            ↑
          </button>
        </div>

        {/* マイクボタン */}
        <button
          onClick={recording ? stopRecording : startRecording}
          disabled={micDisabled}
          className={`
            w-16 h-16 rounded-full flex items-center justify-center text-3xl shadow-lg transition-all
            ${
              micDisabled
                ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                : recording
                ? 'bg-red-500 text-white scale-110 shadow-red-300 shadow-xl animate-pulse'
                : 'bg-green-500 text-white hover:bg-green-600 active:scale-95'
            }
          `}
        >
          {speaking ? '🔊' : recording ? '⏹' : '🎤'}
        </button>
        <p className="text-xs text-gray-400">
          {speaking
            ? '読み上げ中...'
            : recording
            ? 'タップして停止'
            : micDisabled
            ? '少し待ってね...'
            : 'タップして話しかける'}
        </p>
      </div>
    </div>
  )
}
