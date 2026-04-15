'use client'

import { useState, useRef, useEffect } from 'react'
import { createClient } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import type { User } from '@supabase/supabase-js'
import { CharacterAvatar } from '@/components/CharacterAvatar'

// Web Speech API 型定義
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
    onerror: (() => void) | null
  }
  interface SpeechRecognitionEvent extends Event {
    results: SpeechRecognitionResultList
  }
}

type Role = 'child' | 'sensei' | 'tomo'

type Message = {
  id: string
  role: Role
  content: string
}

type Profile = {
  nickname: string | null
  avatar_url: string | null
}

const GRADE_LABELS = ['1年生', '2年生', '3年生', '4年生', '5年生', '6年生']

function speakText(text: string, character: 'sensei' | 'tomo'): Promise<void> {
  return new Promise((resolve) => {
    window.speechSynthesis.cancel()
    const utterance = new SpeechSynthesisUtterance(text)
    utterance.lang = 'ja-JP'
    if (character === 'sensei') {
      utterance.pitch = 1.0
      utterance.rate = 0.9
    } else {
      utterance.pitch = 1.4
      utterance.rate = 1.1
    }
    utterance.onend = () => resolve()
    utterance.onerror = () => resolve()
    window.speechSynthesis.speak(utterance)
  })
}

export default function Home() {
  const [user, setUser] = useState<User | null>(null)
  const [profile, setProfile] = useState<Profile>({ nickname: null, avatar_url: null })
  const [grade, setGrade] = useState<number | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [conversationId, setConversationId] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [recording, setRecording] = useState(false)
  const [speaking, setSpeaking] = useState(false)
  const [talkingChar, setTalkingChar] = useState<'sensei' | 'tomo' | null>(null)
  const [interimText, setInterimText] = useState('')
  const bottomRef = useRef<HTMLDivElement>(null)
  const recognitionRef = useRef<SpeechRecognition | null>(null)
  const interimTextRef = useRef('')
  const router = useRouter()

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      setUser(user)
      if (!user) return
      const { data } = await supabase.from('profiles').select('nickname, avatar_url').eq('id', user.id).single()
      if (data) setProfile({ nickname: data.nickname, avatar_url: data.avatar_url })
    })
  }, [])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, interimText])

  async function handleGradeSelect(g: number) {
    const introMessages: Message[] = [
      { id: 'intro-sensei', role: 'sensei', content: `こんにちは！小学${g}年生なんだね。今日はどんなことが気になってる？何でも話しかけてみて！` },
      { id: 'intro-tomo', role: 'tomo', content: `やっほー！いっしょに考えよう！なんか疑問に思ってること、ある？` },
    ]
    setGrade(g)
    setMessages(introMessages)

    if (user) {
      const supabase = createClient()
      const { data } = await supabase
        .from('conversations')
        .insert({ user_id: user.id, grade: g, messages: introMessages })
        .select('id').single()
      setConversationId(data?.id ?? null)
    }
  }

  async function saveMessages(msgs: Message[]) {
    if (!conversationId) return
    const supabase = createClient()
    await supabase.from('conversations')
      .update({ messages: msgs, updated_at: new Date().toISOString() })
      .eq('id', conversationId)
  }

  async function handleSend(text: string) {
    if (!text.trim() || loading || grade === null) return

    const childMessage: Message = { id: Date.now().toString(), role: 'child', content: text.trim() }
    const newMessages = [...messages, childMessage]
    setMessages(newMessages)
    setLoading(true)

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: newMessages, grade }),
      })
      const data = await res.json()

      const senseiMsg: Message = { id: Date.now().toString() + '-sensei', role: 'sensei', content: data.sensei }
      const updatedMessages = data.tomo
        ? [...newMessages, senseiMsg, { id: Date.now().toString() + '-tomo', role: 'tomo' as Role, content: data.tomo }]
        : [...newMessages, senseiMsg]

      setMessages(updatedMessages)
      setLoading(false)
      await saveMessages(updatedMessages)

      // 音声再生（キャラクターごとに口を動かす）
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
      setMessages((prev) => [...prev, { id: Date.now().toString() + '-error', role: 'sensei', content: 'エラーが発生しました。もう一度試してね。' }])
      setLoading(false)
    }
  }

  function startRecording() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SpeechRecognition) {
      alert('このブラウザは音声認識に対応していません。Chromeをお使いください。')
      return
    }
    const recognition = new SpeechRecognition()
    recognition.lang = 'ja-JP'
    recognition.interimResults = true
    recognition.continuous = false

    recognition.onresult = (e: SpeechRecognitionEvent) => {
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
      if (text.trim()) handleSend(text.trim())
    }

    recognition.onerror = () => {
      setRecording(false)
      interimTextRef.current = ''
      setInterimText('')
    }

    recognitionRef.current = recognition
    recognition.start()
    setRecording(true)
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

  if (grade === null) {
    return (
      <div className="min-h-screen bg-amber-50 flex flex-col items-center justify-center p-8">
        <div className="absolute top-4 right-4 flex items-center gap-3">
          {user?.email === process.env.NEXT_PUBLIC_ADMIN_EMAIL && (
            <button onClick={() => router.push('/admin')} className="text-xs text-amber-600 hover:underline">管理者</button>
          )}
          <button onClick={handleLogout} className="text-xs text-gray-400 hover:text-gray-600">ログアウト</button>
        </div>

        {/* ユーザーアバター・プロフィールボタン */}
        <div className="absolute top-4 left-4">
          <button onClick={() => router.push('/profile')} className="flex items-center gap-2 bg-white rounded-full pl-1 pr-3 py-1 shadow text-sm text-gray-600 hover:shadow-md transition-all">
            <div className="w-8 h-8 rounded-full overflow-hidden bg-amber-200 flex items-center justify-center">
              {profile.avatar_url
                ? <img src={profile.avatar_url} alt="avatar" className="w-full h-full object-cover" />
                : <span className="text-lg">👤</span>}
            </div>
            <span className="font-medium">{profile.nickname ?? 'プロフィール'}</span>
          </button>
        </div>

        <h1 className="text-4xl font-bold text-amber-800 mb-2">SUNABACO Learning</h1>
        <p className="text-amber-600 mb-8 text-lg">いっしょに考えよう！</p>

        {/* キャラクター紹介 */}
        <div className="flex gap-8 mb-10">
          <div className="flex flex-col items-center gap-2">
            <CharacterAvatar character="sensei" size={80} />
            <span className="text-sm font-bold text-green-700">Sensei</span>
          </div>
          <div className="flex flex-col items-center gap-2">
            <CharacterAvatar character="tomo" size={80} />
            <span className="text-sm font-bold text-orange-500">Tomo</span>
          </div>
        </div>

        <p className="text-gray-700 text-xl mb-6 font-medium">何年生ですか？</p>
        <div className="grid grid-cols-3 gap-4">
          {GRADE_LABELS.map((label, i) => (
            <button
              key={i}
              onClick={() => handleGradeSelect(i + 1)}
              className="bg-white border-2 border-amber-400 text-amber-800 font-bold text-lg px-8 py-6 rounded-2xl hover:bg-amber-400 hover:text-white transition-all shadow-md"
            >
              {label}
            </button>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-amber-50 flex flex-col">
      {/* ヘッダー */}
      <div className="bg-amber-500 text-white px-4 py-3 flex items-center justify-between shadow">
        <div className="flex items-center gap-2">
          {/* ユーザーアバター */}
          <button onClick={() => router.push('/profile')} className="w-9 h-9 rounded-full overflow-hidden bg-amber-300 flex items-center justify-center border-2 border-white">
            {profile.avatar_url
              ? <img src={profile.avatar_url} alt="avatar" className="w-full h-full object-cover" />
              : <span className="text-lg">👤</span>}
          </button>
          <span className="font-bold text-sm">{profile.nickname ?? 'きみ'}</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => { setGrade(null); setMessages([]); setConversationId(null) }}
            className="bg-white text-amber-600 font-bold px-3 py-1 rounded-full text-sm"
          >
            小学{grade}年生 ▾
          </button>
          <button onClick={handleLogout} className="text-amber-100 text-xs hover:text-white">ログアウト</button>
        </div>
      </div>

      {/* キャラクターエリア */}
      <div className="bg-white border-b border-amber-100 px-4 py-3 flex items-end justify-center gap-8">
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
                <div className="bg-blue-500 text-white px-4 py-3 rounded-2xl rounded-tr-sm max-w-sm text-sm shadow">
                  {msg.content}
                </div>
                <div className="w-8 h-8 rounded-full overflow-hidden bg-amber-200 flex-shrink-0 flex items-center justify-center">
                  {profile.avatar_url
                    ? <img src={profile.avatar_url} alt="avatar" className="w-full h-full object-cover" />
                    : <span className="text-lg">👤</span>}
                </div>
              </div>
            )
          }

          const isSensei = msg.role === 'sensei'
          return (
            <div key={msg.id} className="flex items-start gap-2">
              <div className="flex-shrink-0">
                <CharacterAvatar character={isSensei ? 'sensei' : 'tomo'} size={36} />
              </div>
              <div className={`px-4 py-3 rounded-2xl rounded-tl-sm max-w-sm text-sm shadow ${isSensei ? 'bg-green-100 text-green-900' : 'bg-orange-100 text-orange-900'}`}>
                <p className="font-bold text-xs mb-1 opacity-60">{isSensei ? 'Sensei' : 'Tomo'}</p>
                {msg.content}
              </div>
            </div>
          )
        })}

        {loading && (
          <div className="flex items-center gap-2">
            <CharacterAvatar character="sensei" size={36} />
            <div className="bg-green-100 px-4 py-3 rounded-2xl text-sm text-green-800">
              考えてるよ...
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

      {/* マイクエリア */}
      <div className="bg-white border-t border-amber-100 px-4 py-5 flex flex-col items-center gap-2">
        <button
          onClick={recording ? stopRecording : startRecording}
          disabled={micDisabled}
          className={`
            w-20 h-20 rounded-full flex items-center justify-center text-4xl shadow-lg transition-all
            ${micDisabled
              ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
              : recording
                ? 'bg-red-500 text-white scale-110 shadow-red-300 shadow-xl animate-pulse'
                : 'bg-amber-500 text-white hover:bg-amber-600 active:scale-95'
            }
          `}
        >
          {speaking ? '🔊' : recording ? '⏹' : '🎤'}
        </button>
        <p className="text-xs text-gray-400">
          {speaking ? '読み上げ中...' : recording ? 'タップして停止' : micDisabled ? '少し待ってね...' : 'タップして話しかける'}
        </p>
      </div>
    </div>
  )
}
