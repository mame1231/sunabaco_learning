'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { useRouter } from 'next/navigation'

type Message = { role: string; content: string }

type Conversation = {
  id: string
  user_email: string
  grade: number
  messages: Message[]
  created_at: string
  updated_at: string
}

export default function AdminPage() {
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState<string | null>(null)
  const router = useRouter()

  useEffect(() => {
    fetch('/api/admin/conversations')
      .then((r) => r.json())
      .then((data) => {
        if (!Array.isArray(data)) {
          router.push('/')
          return
        }
        setConversations(data)
        setLoading(false)
      })
  }, [router])

  async function handleLogout() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  const totalMessages = conversations.reduce((sum, c) => sum + c.messages.length, 0)
  const userCount = new Set(conversations.map((c) => c.user_email)).size

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <p className="text-gray-400">読み込み中...</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* ヘッダー */}
      <div className="bg-amber-600 text-white px-6 py-4 flex items-center justify-between shadow">
        <div>
          <h1 className="text-xl font-bold">管理者ダッシュボード</h1>
          <p className="text-amber-200 text-xs">SUNABACO Learning</p>
        </div>
        <button
          onClick={handleLogout}
          className="bg-white text-amber-600 font-bold px-3 py-1 rounded-full text-sm"
        >
          ログアウト
        </button>
      </div>

      {/* サマリー */}
      <div className="grid grid-cols-3 gap-4 p-6">
        <div className="bg-white rounded-2xl p-5 shadow-sm text-center">
          <p className="text-3xl font-bold text-amber-600">{userCount}</p>
          <p className="text-sm text-gray-500 mt-1">ユーザー数</p>
        </div>
        <div className="bg-white rounded-2xl p-5 shadow-sm text-center">
          <p className="text-3xl font-bold text-amber-600">{conversations.length}</p>
          <p className="text-sm text-gray-500 mt-1">会話セッション</p>
        </div>
        <div className="bg-white rounded-2xl p-5 shadow-sm text-center">
          <p className="text-3xl font-bold text-amber-600">{totalMessages}</p>
          <p className="text-sm text-gray-500 mt-1">総メッセージ数</p>
        </div>
      </div>

      {/* 会話一覧 */}
      <div className="px-6 pb-10 space-y-3">
        <h2 className="text-sm font-bold text-gray-500 uppercase tracking-wide mb-3">会話履歴</h2>
        {conversations.map((c) => (
          <div key={c.id} className="bg-white rounded-2xl shadow-sm overflow-hidden">
            <button
              className="w-full px-5 py-4 flex items-center justify-between hover:bg-gray-50 transition-all"
              onClick={() => setExpanded(expanded === c.id ? null : c.id)}
            >
              <div className="text-left">
                <p className="font-medium text-gray-700 text-sm">{c.user_email}</p>
                <p className="text-xs text-gray-400 mt-0.5">
                  小学{c.grade}年生 · {c.messages.length}メッセージ · {new Date(c.updated_at).toLocaleString('ja-JP')}
                </p>
              </div>
              <span className="text-gray-400 text-lg">{expanded === c.id ? '▲' : '▼'}</span>
            </button>

            {expanded === c.id && (
              <div className="border-t border-gray-100 px-5 py-4 space-y-2 bg-gray-50">
                {c.messages.map((m, i) => (
                  <div key={i} className={`flex ${m.role === 'child' ? 'justify-end' : 'justify-start'}`}>
                    <div className={`px-3 py-2 rounded-xl text-xs max-w-xs ${
                      m.role === 'child'
                        ? 'bg-blue-500 text-white'
                        : m.role === 'sensei'
                          ? 'bg-green-100 text-green-900'
                          : 'bg-orange-100 text-orange-900'
                    }`}>
                      {m.role !== 'child' && (
                        <p className="font-bold opacity-60 mb-0.5">{m.role === 'sensei' ? 'Sensei' : 'Tomo'}</p>
                      )}
                      {m.content}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}

        {conversations.length === 0 && (
          <p className="text-center text-gray-400 py-10">まだ会話がありません</p>
        )}
      </div>
    </div>
  )
}
