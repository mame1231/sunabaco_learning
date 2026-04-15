'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase'
import { useRouter } from 'next/navigation'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [isSignUp, setIsSignUp] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const router = useRouter()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')

    const supabase = createClient()

    if (isSignUp) {
      const { error } = await supabase.auth.signUp({ email, password })
      if (error) {
        setError(error.message)
      } else {
        setError('確認メールを送りました！メールを確認してください。')
      }
    } else {
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) {
        setError('メールアドレスかパスワードが間違っています')
      } else {
        router.push('/')
        router.refresh()
      }
    }

    setLoading(false)
  }

  return (
    <div className="min-h-screen bg-amber-50 flex flex-col items-center justify-center p-8">
      <h1 className="text-4xl font-bold text-amber-800 mb-2">SUNABACO Learning</h1>
      <p className="text-amber-600 mb-10 text-lg">いっしょに考えよう！</p>

      <div className="bg-white rounded-3xl shadow-lg p-8 w-full max-w-sm">
        <h2 className="text-xl font-bold text-gray-700 mb-6 text-center">
          {isSignUp ? 'アカウント作成' : 'ログイン'}
        </h2>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <input
            type="email"
            placeholder="メールアドレス"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-amber-400 text-[#333]"
          />
          <input
            type="password"
            placeholder="パスワード（6文字以上）"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            className="border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-amber-400 text-[#333]"
          />

          {error && (
            <p className="text-sm text-center text-red-500">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="bg-amber-500 text-white font-bold py-3 rounded-xl hover:bg-amber-600 disabled:opacity-40 transition-all mt-2"
          >
            {loading ? '...' : isSignUp ? 'アカウントを作る' : 'ログイン'}
          </button>
        </form>

        <button
          onClick={() => { setIsSignUp(!isSignUp); setError('') }}
          className="w-full text-center text-sm text-amber-600 mt-4 hover:underline"
        >
          {isSignUp ? 'すでにアカウントがある → ログイン' : 'アカウントがない → 新規登録'}
        </button>
      </div>
    </div>
  )
}
